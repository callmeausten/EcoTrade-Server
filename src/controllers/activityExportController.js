const ExcelJS = require('exceljs');
const Activity = require('../models/Activity');
const ActivityArchive = require('../models/ActivityArchive');
const WorkspaceMember = require('../models/WorkspaceMember');

/**
 * Export Activities to Excel
 * 
 * Data Source Logic:
 * - "MY_ACTIVITY" → Uses Activity model (raw logs, 30-day limit enforced)
 * - "ALL" → Uses ActivityArchive model (aggregated, no time limit)
 * 
 * @route POST /api/v1/workspaces/:id/activities/export
 */
exports.exportActivities = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { 
            ownership = 'ALL',     // 'ALL' or 'MY_ACTIVITY'
            deviceType = null,     // null = all, or specific type
            activityType = null,   // null = all, or specific type like 'SCAN'
            startDate,             // ISO date string
            endDate                // ISO date string
        } = req.body;

        // Validate membership
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        let activities = [];
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : new Date();
        
        // Set end date to end of day
        if (end) {
            end.setHours(23, 59, 59, 999);
        }

        if (ownership === 'MY_ACTIVITY') {
            // Use Activity model (raw logs) - 30 day limit enforced by TTL
            // But also enforce in query for safety
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const effectiveStart = start && start > thirtyDaysAgo ? start : thirtyDaysAgo;
            
            const query = {
                workspaceId,
                userId: req.userId,
                createdAt: {
                    $gte: effectiveStart,
                    $lte: end
                }
            };
            
            if (deviceType) query.deviceType = deviceType;
            if (activityType) query.type = activityType;
            
            activities = await Activity.find(query)
                .sort({ createdAt: -1 })
                .limit(10000); // Safety limit
                
            console.log(`[Export] MY_ACTIVITY: Found ${activities.length} records`);
            
        } else {
            // Use ActivityArchive model (aggregated data) - no time limit
            const archiveQuery = { workspaceId };
            
            if (start) {
                archiveQuery.date = { $gte: start };
            }
            if (end) {
                archiveQuery.date = archiveQuery.date 
                    ? { ...archiveQuery.date, $lte: end }
                    : { $lte: end };
            }
            
            const archives = await ActivityArchive.find(archiveQuery)
                .sort({ date: -1 });
            
            // Flatten timeline data from archives
            archives.forEach(dayDoc => {
                dayDoc.timeline.forEach(entry => {
                    // Apply filters
                    if (deviceType && entry.deviceType !== deviceType) return;
                    if (activityType && entry.type !== activityType) return;
                    
                    // Create activity-like objects from aggregated data
                    activities.push({
                        date: dayDoc.date,
                        hour: entry.hour,
                        type: entry.type,
                        deviceType: entry.deviceType || 'N/A',
                        count: entry.count,
                        points: entry.points,
                        isAggregated: true
                    });
                });
            });
            
            console.log(`[Export] ALL: Found ${activities.length} aggregated records from ${archives.length} days`);
        }

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Harmony App';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet('Activities');
        
        // Style configuration
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14B8A6' } },
            alignment: { horizontal: 'center', vertical: 'middle' }
        };
        
        if (ownership === 'MY_ACTIVITY') {
            // Detailed columns for raw activity data
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Time', key: 'time', width: 10 },
                { header: 'Type', key: 'type', width: 20 },
                { header: 'Title', key: 'title', width: 30 },
                { header: 'Description', key: 'description', width: 40 },
                { header: 'Device Type', key: 'deviceType', width: 15 },
                { header: 'Points', key: 'points', width: 10 }
            ];
            
            // Add rows
            activities.forEach(activity => {
                const createdAt = new Date(activity.createdAt);
                worksheet.addRow({
                    date: createdAt.toISOString().split('T')[0],
                    time: createdAt.toTimeString().split(' ')[0],
                    type: activity.type,
                    title: activity.title || '',
                    description: activity.description || '',
                    deviceType: activity.deviceType || 'N/A',
                    points: activity.points || 0
                });
            });
        } else {
            // Aggregated columns for archive data
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Hour', key: 'hour', width: 8 },
                { header: 'Type', key: 'type', width: 20 },
                { header: 'Device Type', key: 'deviceType', width: 15 },
                { header: 'Count', key: 'count', width: 10 },
                { header: 'Points', key: 'points', width: 10 }
            ];
            
            // Add rows
            activities.forEach(activity => {
                worksheet.addRow({
                    date: new Date(activity.date).toISOString().split('T')[0],
                    hour: activity.hour !== undefined ? `${activity.hour}:00` : 'N/A',
                    type: activity.type,
                    deviceType: activity.deviceType,
                    count: activity.count,
                    points: activity.points || 0
                });
            });
        }
        
        // Apply header styling
        worksheet.getRow(1).eachCell(cell => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill;
            cell.alignment = headerStyle.alignment;
        });
        
        // Add filters
        worksheet.autoFilter = {
            from: 'A1',
            to: `${String.fromCharCode(65 + worksheet.columns.length - 1)}1`
        };

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `activities_${ownership.toLowerCase()}_${timestamp}.xlsx`;

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Write to response
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`[Export] Successfully exported ${activities.length} activities to ${filename}`);

    } catch (error) {
        console.error('Export activities error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to export activities'
            }
        });
    }
};

/**
 * Get export date range limits
 * Returns available date range based on ownership type
 * 
 * @route GET /api/v1/workspaces/:id/activities/export-info
 */
exports.getExportInfo = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        
        // Check membership
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' }
            });
        }
        
        // For MY_ACTIVITY: 30 days limit
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // For ALL: Get earliest archive date
        const earliestArchive = await ActivityArchive.findOne({ workspaceId })
            .sort({ date: 1 })
            .select('date');
        
        res.json({
            success: true,
            data: {
                myActivity: {
                    minDate: thirtyDaysAgo.toISOString().split('T')[0],
                    maxDate: new Date().toISOString().split('T')[0],
                    note: 'Limited to last 30 days'
                },
                allActivities: {
                    minDate: earliestArchive?.date?.toISOString().split('T')[0] || null,
                    maxDate: new Date().toISOString().split('T')[0],
                    note: 'Aggregated historical data'
                },
                activityTypes: [
                    'SCAN', 'DEVICE_ADDED', 'DEVICE_REMOVED', 
                    'DEVICE_TRANSFERRED_OUT', 'DEVICE_TRANSFERRED_IN',
                    'MEMBER_JOINED', 'MEMBER_LEFT', 'ACHIEVEMENT', 'REWARD'
                ],
                deviceTypes: [
                    'SMART_BIN', 'SMART_LAMP', 'ACCESS_CONTROL', 'RFID_READER', 'GENERIC'
                ]
            }
        });
    } catch (error) {
        console.error('Get export info error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get export info' }
        });
    }
};
