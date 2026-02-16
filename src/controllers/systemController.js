/**
 * System Controller
 * Handles system-wide configuration and settings
 */

/**
 * GET /api/v1/system/config
 * Returns system configuration including testing mode
 */
exports.getSystemConfig = (req, res) => {
    try {
        const testingMode = process.env.TESTING_MODE === 'true';

        console.log('[SystemController] GET /system/config called - testingMode:', testingMode);
        res.json({
            success: true,
            data: {
                testingMode
            }
        });
    } catch (error) {
        console.error('Error fetching system config:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch system configuration'
            }
        });
    }
};
