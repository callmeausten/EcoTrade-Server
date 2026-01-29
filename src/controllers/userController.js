const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Device = require('../models/Device');
const UserNotification = require('../models/UserNotification');

// Get current user
exports.getCurrentUser = async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                avatarUrl: req.user.avatarUrl,
                createdAt: req.user.createdAt,
                updatedAt: req.user.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get user profile'
            }
        });
    }
};

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, avatarUrl } = req.body;

        if (name) req.user.name = name;
        if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;

        await req.user.save();

        res.json({
            success: true,
            data: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                avatarUrl: req.user.avatarUrl,
                updatedAt: req.user.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update profile'
            }
        });
    }
};

// Change user password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_FIELDS',
                    message: 'Current password and new password are required'
                }
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PASSWORD',
                    message: 'New password must be at least 8 characters long'
                }
            });
        }

        // Google users cannot change password
        if (req.user.authProvider === 'google') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'GOOGLE_AUTH_USER',
                    message: 'Google authenticated users cannot change password'
                }
            });
        }

        // Fetch user with password field (normally excluded)
        const User = require('../models/User');
        const userWithPassword = await User.findById(req.user._id).select('+password');

        // Verify current password
        const isMatch = await userWithPassword.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CURRENT_PASSWORD',
                    message: 'Current password is incorrect'
                }
            });
        }

        // Update password (will be hashed by pre-save hook)
        userWithPassword.password = newPassword;
        await userWithPassword.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to change password'
            }
        });
    }
};

// Get notification preferences
exports.getNotificationPreferences = async (req, res) => {
    try {
        const preferences = req.user.notificationPreferences || {
            personalNotifications: true,
            workspaceNotifications: true,
            pushNotifications: true
        };

        res.json({
            success: true,
            data: preferences
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get notification preferences'
            }
        });
    }
};

// Update notification preferences
exports.updateNotificationPreferences = async (req, res) => {
    try {
        const { personalNotifications, workspaceNotifications, pushNotifications } = req.body;

        // Initialize preferences if not exists
        if (!req.user.notificationPreferences) {
            req.user.notificationPreferences = {};
        }

        // Update only provided fields
        if (personalNotifications !== undefined) req.user.notificationPreferences.personalNotifications = personalNotifications;
        if (workspaceNotifications !== undefined) req.user.notificationPreferences.workspaceNotifications = workspaceNotifications;
        if (pushNotifications !== undefined) req.user.notificationPreferences.pushNotifications = pushNotifications;

        await req.user.save();

        res.json({
            success: true,
            data: req.user.notificationPreferences
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update notification preferences'
            }
        });
    }
};

// Get user statistics
exports.getUserStatistics = async (req, res) => {
    try {
        // Get user's workspace memberships
        const memberships = await WorkspaceMember.find({ userId: req.userId });
        const workspaceIds = memberships.map(m => m.workspaceId);

        // Get all workspaces
        const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

        // Count owned workspaces
        const ownedWorkspaces = workspaces.filter(w => w.ownerId.toString() === req.userId.toString()).length;

        // Count workspaces by type
        const workspacesByType = {
            PRIVATE: workspaces.filter(w => w.type === 'PRIVATE').length,
            ORGANIZATION: workspaces.filter(w => w.type === 'ORGANIZATION').length
        };

        // Count total devices across all workspaces
        const totalDevices = await Device.countDocuments({ workspaceId: { $in: workspaceIds } });

        res.json({
            success: true,
            data: {
                totalWorkspaces: workspaces.length,
                totalDevices,
                workspacesByType,
                ownedWorkspaces,
                memberWorkspaces: workspaces.length - ownedWorkspaces
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get statistics'
            }
        });
    }
};

// Get user notifications
exports.getUserNotifications = async (req, res) => {
    try {
        const { limit = 50, skip = 0, unreadOnly = false, since } = req.query;

        const query = { userId: req.userId };
        if (unreadOnly === 'true') {
            query.read = false;
        }

        // Incremental sync: only fetch notifications newer than 'since' timestamp
        if (since) {
            query.createdAt = { $gt: new Date(since) };
            console.log(`\n📅 Fetching user notifications since: ${since}`);
        }

        const notifications = await UserNotification.find(query)
            .populate('workspaceId', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await UserNotification.countDocuments(query);
        const unreadCount = await UserNotification.countDocuments({ userId: req.userId, read: false });

        console.log(`✅ Returning ${notifications.length} user notifications (total: ${total}, unread: ${unreadCount})`);

        res.json({
            success: true,
            data: {
                notifications,
                total,
                unreadCount
            }
        });
    } catch (error) {
        console.error('Error getting user notifications:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get notifications'
            }
        });
    }
};

// Mark notification as read
exports.markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await UserNotification.findOne({
            _id: id,
            userId: req.userId
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Notification not found'
                }
            });
        }

        notification.read = true;
        await notification.save();

        res.json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark notification as read'
            }
        });
    }
};

// Mark all notifications as read
exports.markAllNotificationsRead = async (req, res) => {
    try {
        await UserNotification.updateMany(
            { userId: req.userId, read: false },
            { read: true }
        );

        res.json({
            success: true,
            data: { message: 'All notifications marked as read' }
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark all notifications as read'
            }
        });
    }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await UserNotification.findOneAndDelete({
            _id: id,
            userId: req.userId
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Notification not found'
                }
            });
        }

        res.json({
            success: true,
            data: { message: 'Notification deleted' }
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to delete notification'
            }
        });
    }
};

// Get user's own pending requests (for tracking)
exports.getMyPendingRequests = async (req, res) => {
    try {
        const PendingRequest = require('../models/PendingRequest');

        const requests = await PendingRequest.find({
            userId: req.userId,
            status: 'pending'
        })
            .populate('workspaceId', 'name type')
            .sort({ requestedAt: -1 });

        res.json({
            success: true,
            data: { requests }
        });
    } catch (error) {
        console.error('Error getting pending requests:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get pending requests'
            }
        });
    }
};

// Cancel own pending request
exports.cancelPendingRequest = async (req, res) => {
    try {
        const PendingRequest = require('../models/PendingRequest');
        const { requestId } = req.params;

        const request = await PendingRequest.findOne({
            _id: requestId,
            userId: req.userId,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Pending request not found'
                }
            });
        }

        request.status = 'cancelled';
        await request.save();

        res.json({
            success: true,
            message: 'Request cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling request:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to cancel request'
            }
        });
    }
};

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

