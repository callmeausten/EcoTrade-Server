const mongoose = require('mongoose');

/**
 * ActivityArchive Model
 * 
 * Stores bucketed/aggregated activity data for historical analysis.
 * Each document represents one workspace's activities for one day.
 * 
 * Data flow:
 * 1. Raw activities are stored in 'Activity' collection (live for 30 days)
 * 2. Daily cron job archives activities to this collection (bucketed by hour)
 * 3. Raw activities are auto-deleted via TTL index after 30 days
 * 4. Archives persist indefinitely for historical reporting
 */
const activityArchiveSchema = new mongoose.Schema({
    // COMPOUND KEY: Identifies "One Workspace, One Day"
    workspaceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Workspace', 
        required: true 
    },
    date: { 
        type: Date, 
        required: true 
    }, // Stored as midnight UTC (e.g., 2023-10-01T00:00:00.000Z)

    // DAILY STATS: Quick summaries for dashboards
    stats: {
        totalPoints: { type: Number, default: 0 },
        totalActivities: { type: Number, default: 0 },
        activeUsersCount: { type: Number, default: 0 } // Count of unique users that day
    },

    // TIMELINE: The "Bucket" of hourly data
    timeline: [{
        hour: { type: Number, required: true }, // 0 - 23
        type: { type: String, required: true }, // 'SCAN', 'MEMBER_JOINED', etc.
        deviceType: String,                     // 'SMART_BIN', 'SMART_LAMP', etc.
        count: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
        
        // Store unique user IDs for this specific hour/type
        userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }]
}, {
    timestamps: true
});

// CRITICAL INDEX: Ensures we never have duplicate documents for the same day/workspace
// Also makes upserts in aggregation fast.
activityArchiveSchema.index({ workspaceId: 1, date: 1 }, { unique: true });

// Useful for "Get me all history for Workspace X"
activityArchiveSchema.index({ workspaceId: 1, "timeline.type": 1 });

// Index for date-based queries (last 7 days, last month, etc.)
activityArchiveSchema.index({ date: -1 });

module.exports = mongoose.model('ActivityArchive', activityArchiveSchema);
