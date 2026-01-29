const Device = require('../models/Device');
const Workspace = require('../models/Workspace');

// API Key for IoT devices (should normally be in .env)
const IOT_API_KEY = process.env.IOT_API_KEY || 'UnanzaHarmonyIoTKey2026!';

/**
 * Check device registration status
 * Endpoint: GET /api/v1/iot/status?deviceId=...
 */
exports.checkStatus = async (req, res) => {
    try {
        // 1. Validate API Key
        const apiKey = req.header('X-API-Key');
        if (!apiKey || apiKey !== IOT_API_KEY) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid or missing API Key'
            });
        }

        // 2. Validate deviceId
        const { deviceId } = req.query;
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                error: 'Missing deviceId',
                message: 'deviceId query parameter is required'
            });
        }

        // 3. Find device
        const device = await Device.findOne({ deviceId }).populate('workspaceId');

        if (!device) {
            // Device not found in DB at all
            return res.status(404).json({
                success: false,
                registered: false,
                message: 'Device not found'
            });
        }

        // 4. Check registration status
        if (device.workspaceId && device.status === 'ACTIVE') {
            return res.json({
                success: true,
                registered: true,
                workspaceId: device.workspaceId._id,
                workspaceName: device.workspaceId.name
            });
        } else {
            return res.json({
                success: true,
                registered: false,
                message: 'Device exists but is not active or assigned to a workspace'
            });
        }

    } catch (error) {
        console.error('IoT Status Check Error:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: error.message
        });
    }
};
