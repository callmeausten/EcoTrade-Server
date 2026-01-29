const Activity = require('../models/Activity');
const WorkspaceMember = require('../models/WorkspaceMember');

// Get workspace activities
exports.getActivities = async (req, res) => {
    try {
        const { id: workspaceId } = req.params;
        const { limit, since } = req.query;
        const userId = req.userId;

        // Verify user is member of workspace
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of this workspace'
            });
        }

        // Build query with activity filtering based on sync state:
        // - If 'since' provided: incremental sync from that timestamp
        // - If not: initial sync from user's joinedDate (only show activities since they joined)
        let queryFilter = { workspaceId };
        const lowerBound = since ? new Date(since) : membership.joinedDate;
        queryFilter.createdAt = { $gte: lowerBound };

        // Build query
        let query = Activity.find(queryFilter)
            .sort({ createdAt: -1 }); // Most recent first

        // Apply limit if provided
        if (limit) {
            query = query.limit(parseInt(limit));
        }

        const activities = await query
            .populate('userId', 'name email avatarUrl')
            .lean();

        // Format response
        const formattedActivities = activities.map(activity => ({
            id: activity._id,
            workspaceId: activity.workspaceId,
            type: activity.type,
            title: activity.title,
            description: activity.description,
            deviceId: activity.deviceId,
            deviceType: activity.deviceType,
            userId: activity.userId._id,
            points: activity.points,
            timestamp: activity.timestamp,
            createdAt: activity.createdAt
        }));

        res.json({
            success: true,
            data: {
                activities: formattedActivities,
                total: formattedActivities.length
            }
        });

    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get activities',
            message: error.message
        });
    }
};

/**
 * Get activity graph data for visualization
 * 
 * Query params:
 * - range: 'today' | 'yesterday' | '7days' | '30days' (default: 'today')
 * - types: comma-separated activity types to filter (optional)
 * 
 * Returns hourly data for today/yesterday, daily data for 7days/30days
 */
exports.getActivityGraph = async (req, res) => {
    try {
        const { id: workspaceId } = req.params;
        const { range = 'today', types } = req.query;
        const userId = req.userId;

        // Verify user is member of workspace
        const membership = await WorkspaceMember.findOne({ workspaceId, userId });
        if (!membership) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of this workspace'
            });
        }

        // Calculate date range
        const now = new Date();
        let startDate, endDate, groupBy;
        
        switch (range) {
            case 'yesterday':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setHours(23, 59, 59, 999);
                groupBy = 'hour';
                break;
            case '7days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate = now;
                groupBy = 'day';
                break;
            case '30days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate = now;
                groupBy = 'day';
                break;
            case 'today':
            default:
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                endDate = now;
                groupBy = 'hour';
                break;
        }

        // Build match filter
        const matchFilter = {
            workspaceId: require('mongoose').Types.ObjectId(workspaceId),
            createdAt: { $gte: startDate, $lte: endDate }
        };

        // Filter by activity types if specified
        if (types) {
            const typeArray = types.split(',').map(t => t.trim().toUpperCase());
            matchFilter.type = { $in: typeArray };
        }

        // Build aggregation pipeline
        let groupId;
        if (groupBy === 'hour') {
            groupId = { hour: { $hour: '$createdAt' } };
        } else {
            groupId = { 
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' }
            };
        }

        const pipeline = [
            { $match: matchFilter },
            {
                $group: {
                    _id: groupId,
                    count: { $sum: 1 },
                    points: { $sum: '$points' },
                    types: { $push: '$type' }
                }
            },
            { $sort: groupBy === 'hour' ? { '_id.hour': 1 } : { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ];

        const graphData = await Activity.aggregate(pipeline);

        // Also get totals
        const totals = await Activity.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalActivities: { $sum: 1 },
                    totalPoints: { $sum: '$points' }
                }
            }
        ]);

        // Get type breakdown
        const typeBreakdown = await Activity.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    points: { $sum: '$points' }
                }
            }
        ]);

        // Format data points for chart
        let dataPoints = [];
        
        if (groupBy === 'hour') {
            // Create 24 hour slots (0-23)
            for (let h = 0; h < 24; h++) {
                const hourData = graphData.find(d => d._id.hour === h);
                dataPoints.push({
                    label: `${h.toString().padStart(2, '0')}:00`,
                    hour: h,
                    count: hourData ? hourData.count : 0,
                    points: hourData ? hourData.points : 0
                });
            }
        } else {
            // Create day slots
            const dayCount = range === '7days' ? 7 : 30;
            for (let d = dayCount - 1; d >= 0; d--) {
                const day = new Date(now);
                day.setDate(day.getDate() - d);
                
                const dayData = graphData.find(data => 
                    data._id.year === day.getFullYear() &&
                    data._id.month === day.getMonth() + 1 &&
                    data._id.day === day.getDate()
                );
                
                dataPoints.push({
                    label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    date: day.toISOString().split('T')[0],
                    count: dayData ? dayData.count : 0,
                    points: dayData ? dayData.points : 0
                });
            }
        }

        res.json({
            success: true,
            data: {
                range,
                groupBy,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                dataPoints,
                totals: totals[0] || { totalActivities: 0, totalPoints: 0 },
                typeBreakdown: typeBreakdown.reduce((acc, t) => {
                    acc[t._id] = { count: t.count, points: t.points };
                    return acc;
                }, {})
            }
        });

    } catch (error) {
        console.error('Get activity graph error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get activity graph data',
            message: error.message
        });
    }
};

