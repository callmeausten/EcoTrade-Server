const { 
    archiveActivities, 
    archiveYesterdaysActivities, 
    getArchivedStats, 
    getActivityTypeBreakdown 
} = require('../services/activityArchiveService');
const { runArchiveNow } = require('../config/scheduler');

/**
 * Admin Controller - Activity Archive Management
 * 
 * These endpoints are for admin use only.
 * TODO: Add admin role verification middleware
 */

/**
 * POST /api/v1/admin/archive/run
 * Manually trigger the daily archive job
 */
exports.triggerArchive = async (req, res) => {
    try {
        console.log('[Admin] Manual archive triggered');
        const result = await runArchiveNow();
        
        res.json({
            success: true,
            message: 'Archive job completed',
            data: {
                duration: result.duration
            }
        });
    } catch (error) {
        console.error('[Admin] Archive trigger failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'ARCHIVE_FAILED',
                message: error.message
            }
        });
    }
};

/**
 * POST /api/v1/admin/archive/range
 * Archive activities for a custom date range
 * 
 * Body: { startDate: "2026-01-01", endDate: "2026-01-07" }
 */
exports.archiveDateRange = async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_DATES',
                    message: 'startDate and endDate are required'
                }
            });
        }
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_DATES',
                    message: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
                }
            });
        }
        
        if (start >= end) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_RANGE',
                    message: 'startDate must be before endDate'
                }
            });
        }
        
        console.log(`[Admin] Archiving range: ${startDate} to ${endDate}`);
        const result = await archiveActivities(start, end);
        
        res.json({
            success: true,
            message: 'Archive completed for date range',
            data: {
                startDate,
                endDate,
                duration: result.duration
            }
        });
    } catch (error) {
        console.error('[Admin] Range archive failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'ARCHIVE_FAILED',
                message: error.message
            }
        });
    }
};

/**
 * GET /api/v1/admin/archive/stats/:workspaceId
 * Get archived stats for a workspace
 * 
 * Query: ?days=7 (default: 7)
 */
exports.getWorkspaceArchiveStats = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const days = parseInt(req.query.days) || 7;
        
        if (days < 1 || days > 365) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_DAYS',
                    message: 'days must be between 1 and 365'
                }
            });
        }
        
        const stats = await getArchivedStats(workspaceId, days);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[Admin] Get stats failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FETCH_FAILED',
                message: error.message
            }
        });
    }
};

/**
 * GET /api/v1/admin/archive/breakdown/:workspaceId
 * Get activity type breakdown for a workspace
 * 
 * Query: ?days=30 (default: 30)
 */
exports.getWorkspaceTypeBreakdown = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const days = parseInt(req.query.days) || 30;
        
        if (days < 1 || days > 365) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_DAYS',
                    message: 'days must be between 1 and 365'
                }
            });
        }
        
        const breakdown = await getActivityTypeBreakdown(workspaceId, days);
        
        res.json({
            success: true,
            data: {
                workspaceId,
                period: `last_${days}_days`,
                breakdown
            }
        });
    } catch (error) {
        console.error('[Admin] Get breakdown failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FETCH_FAILED',
                message: error.message
            }
        });
    }
};

/**
 * GET /api/v1/admin/archive/health
 * Check archive system health
 */
exports.getArchiveHealth = async (req, res) => {
    try {
        const ActivityArchive = require('../models/ActivityArchive');
        const Activity = require('../models/Activity');
        
        // Get counts
        const [archiveCount, rawCount, oldestArchive, newestArchive] = await Promise.all([
            ActivityArchive.countDocuments(),
            Activity.countDocuments(),
            ActivityArchive.findOne().sort({ date: 1 }).select('date'),
            ActivityArchive.findOne().sort({ date: -1 }).select('date')
        ]);
        
        res.json({
            success: true,
            data: {
                archiveDocuments: archiveCount,
                rawActivityDocuments: rawCount,
                oldestArchiveDate: oldestArchive?.date || null,
                newestArchiveDate: newestArchive?.date || null,
                status: 'healthy'
            }
        });
    } catch (error) {
        console.error('[Admin] Health check failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'HEALTH_CHECK_FAILED',
                message: error.message
            }
        });
    }
};
