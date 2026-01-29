const Notification = require('../models/Notification');
const WorkspaceMember = require('../models/WorkspaceMember');

// Get notifications
exports.getNotifications = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { unreadOnly, type, page = 1, limit = 20, since } = req.query;

        // Check workspace access
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

        // Build query
        const query = { workspaceId };
        if (unreadOnly === 'true') query.isRead = false;
        if (type) query.type = type;

        // Incremental sync: only fetch notifications created after 'since'
        if (since) {
            query.createdAt = { $gt: new Date(since) };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({
            workspaceId,
            isRead: false
        });
        console.log(membership.userId)

        res.json({
            success: true,
            data: {
                notifications,
                unreadCount,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch notifications'
            }
        });
    }
};

// Mark as read
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Notification not found'
                }
            });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.json({
            success: true,
            data: {
                id: notification._id,
                isRead: true,
                readAt: notification.readAt
            }
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark notification as read'
            }
        });
    }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
    try {
        const workspaceId = req.params.id;

        const result = await Notification.updateMany(
            { workspaceId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read',
            data: {
                markedCount: result.modifiedCount
            }
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark all as read'
            }
        });
    }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Notification not found'
                }
            });
        }

        await Notification.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to delete notification'
            }
        });
    }
};
