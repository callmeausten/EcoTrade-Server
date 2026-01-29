const cron = require('node-cron');
const { archiveYesterdaysActivities } = require('../services/activityArchiveService');

/**
 * Scheduled Jobs Configuration
 * 
 * This module sets up all cron jobs for the application.
 * Jobs are scheduled using node-cron with standard cron syntax.
 */

/**
 * Initialize all scheduled jobs
 * Call this function once when the server starts
 */
function initializeScheduledJobs() {
    console.log('[Scheduler] Initializing scheduled jobs...');
    
    // Daily Activity Archive Job
    // Runs at 00:30 AM UTC every day (30 minutes after midnight)
    // This gives MongoDB TTL a buffer to not conflict with archiving
    cron.schedule('30 0 * * *', async () => {
        console.log('[Scheduler] Running daily activity archive job...');
        
        try {
            const result = await archiveYesterdaysActivities();
            console.log(`[Scheduler] Daily archive completed in ${result.duration}ms`);
        } catch (error) {
            console.error('[Scheduler] Daily archive job failed:', error);
            // TODO: Send alert to admin (email, Slack, etc.)
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });
    
    console.log('[Scheduler] ✅ Daily activity archive job scheduled (00:30 UTC)');
    
    // Add more scheduled jobs here as needed...
    // Example: Weekly cleanup, monthly reports, etc.
}

/**
 * Manually trigger archive job (for testing or admin use)
 */
async function runArchiveNow() {
    console.log('[Scheduler] Manually triggering archive job...');
    return await archiveYesterdaysActivities();
}

module.exports = {
    initializeScheduledJobs,
    runArchiveNow
};
