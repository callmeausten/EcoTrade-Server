const Activity = require('../models/Activity');
const ActivityArchive = require('../models/ActivityArchive');

/**
 * Activity Archive Service
 * 
 * Handles archiving of raw activity logs into bucketed daily summaries.
 * This runs daily via cron to compress activity data before TTL deletion.
 */

/**
 * Archive activities for a specific date range
 * @param {Date} startDate - Start of the range (inclusive)
 * @param {Date} endDate - End of the range (exclusive)
 */
async function archiveActivities(startDate, endDate) {
    console.log(`[Archive] Archiving activities from ${startDate.toISOString()} to ${endDate.toISOString()}...`);
    
    const startTime = Date.now();
    
    try {
        const pipeline = [
            // STAGE 1: Filter Raw Data by date range
            {
                $match: {
                    createdAt: {
                        $gte: startDate,
                        $lt: endDate
                    }
                }
            },

            // STAGE 2: Group by Hour (The Inner Bucket)
            {
                $group: {
                    _id: {
                        workspaceId: "$workspaceId",
                        type: "$type",
                        deviceType: "$deviceType",
                        // Group by Year-Month-Day (midnight UTC)
                        day: { $dateTrunc: { date: "$createdAt", unit: "day" } },
                        // Extract Hour (0-23)
                        hour: { $hour: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    points: { $sum: "$points" },
                    // Collect UNIQUE users for this specific hour/type combo
                    userIds: { $addToSet: "$userId" }
                }
            },

            // STAGE 3: Group by Day (The Daily Document)
            {
                $group: {
                    _id: {
                        workspaceId: "$_id.workspaceId",
                        day: "$_id.day"
                    },
                    // Calculate Daily Totals
                    dailyTotalPoints: { $sum: "$points" },
                    dailyTotalActivities: { $sum: "$count" },
                    // To count unique users per DAY, we combine all hourly arrays
                    allUserIds: { $push: "$userIds" },
                    
                    // Push the hourly stats into the timeline array
                    timeline: {
                        $push: {
                            hour: "$_id.hour",
                            type: "$_id.type",
                            deviceType: "$_id.deviceType",
                            count: "$count",
                            points: "$points",
                            userIds: "$userIds"
                        }
                    }
                }
            },

            // STAGE 4: Clean up format for output
            {
                $project: {
                    _id: 0,
                    workspaceId: "$_id.workspaceId",
                    date: "$_id.day",
                    stats: {
                        totalPoints: "$dailyTotalPoints",
                        totalActivities: "$dailyTotalActivities",
                        // Flatten the array of arrays and count unique users
                        activeUsersCount: {
                            $size: {
                                $setUnion: {
                                    $reduce: {
                                        input: "$allUserIds",
                                        initialValue: [],
                                        in: { $concatArrays: ["$$value", "$$this"] }
                                    }
                                }
                            }
                        }
                    },
                    timeline: 1
                }
            },

            // STAGE 5: Write to Database using $merge (upsert)
            {
                $merge: {
                    into: "activityarchives", // Collection name (lowercase, pluralized)
                    on: ["workspaceId", "date"], // Uses the unique index
                    whenMatched: "replace",      // Update if exists
                    whenNotMatched: "insert"     // Insert if new
                }
            }
        ];

        await Activity.aggregate(pipeline);
        
        const duration = Date.now() - startTime;
        console.log(`[Archive] Archiving complete in ${duration}ms`);
        
        return { success: true, duration };
    } catch (error) {
        console.error('[Archive] Error archiving activities:', error);
        throw error;
    }
}

/**
 * Archive yesterday's activities
 * This is the function called by the daily cron job
 */
async function archiveYesterdaysActivities() {
    const now = new Date();
    
    // Get yesterday's date at midnight UTC
    const endDate = new Date(now);
    endDate.setUTCHours(0, 0, 0, 0);
    
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 1);
    
    console.log(`[Archive] Running daily archive for ${startDate.toISOString().split('T')[0]}`);
    
    return await archiveActivities(startDate, endDate);
}

/**
 * Get archived activity stats for a workspace
 * @param {string} workspaceId - Workspace ID
 * @param {number} days - Number of days to look back (default: 7)
 */
async function getArchivedStats(workspaceId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
    
    const archives = await ActivityArchive.find({
        workspaceId,
        date: { $gte: startDate }
    }).sort({ date: -1 });
    
    // Aggregate stats from archives
    let totalPoints = 0;
    let totalActivities = 0;
    const uniqueUsers = new Set();
    const dailyBreakdown = [];
    
    archives.forEach(dayDoc => {
        totalPoints += dayDoc.stats.totalPoints;
        totalActivities += dayDoc.stats.totalActivities;
        
        // Collect unique users from timeline
        dayDoc.timeline.forEach(t => {
            t.userIds.forEach(uid => uniqueUsers.add(uid.toString()));
        });
        
        dailyBreakdown.push({
            date: dayDoc.date,
            points: dayDoc.stats.totalPoints,
            activities: dayDoc.stats.totalActivities,
            users: dayDoc.stats.activeUsersCount
        });
    });
    
    return {
        period: `last_${days}_days`,
        totalPoints,
        totalActivities,
        uniqueUsers: uniqueUsers.size,
        dailyBreakdown
    };
}

/**
 * Get activity breakdown by type for a workspace
 * @param {string} workspaceId - Workspace ID
 * @param {number} days - Number of days to look back
 */
async function getActivityTypeBreakdown(workspaceId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
    
    const archives = await ActivityArchive.find({
        workspaceId,
        date: { $gte: startDate }
    });
    
    const typeStats = {};
    
    archives.forEach(dayDoc => {
        dayDoc.timeline.forEach(t => {
            if (!typeStats[t.type]) {
                typeStats[t.type] = { count: 0, points: 0 };
            }
            typeStats[t.type].count += t.count;
            typeStats[t.type].points += t.points;
        });
    });
    
    return typeStats;
}

module.exports = {
    archiveActivities,
    archiveYesterdaysActivities,
    getArchivedStats,
    getActivityTypeBreakdown
};
