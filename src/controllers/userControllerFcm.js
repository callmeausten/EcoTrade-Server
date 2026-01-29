const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Device = require('../models/Device');
const UserNotification = require('../models/UserNotification');

// Update FCM token
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_FCM_TOKEN',
                    message: 'FCM token is required'
                }
            });
        }

        req.user.fcmToken = fcmToken;
        await req.user.save();

        res.json({
            success: true,
            message: 'FCM token updated successfully'
        });
    } catch (error) {
        console.error('Update FCM token error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update FCM token'
            }
        });
    }
};
