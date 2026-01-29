const express = require('express');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

// Get current user
router.get('/me', auth, userController.getCurrentUser);

// Update user profile
router.patch('/me', auth, userController.updateProfile);

// Change password
router.patch('/me/password', auth, userController.changePassword);

// Notification preferences
router.get('/me/notification-preferences', auth, userController.getNotificationPreferences);
router.put('/me/notification-preferences', auth, userController.updateNotificationPreferences);

// Get user statistics
router.get('/me/statistics', auth, userController.getUserStatistics);

// User notifications
router.get('/me/notifications', auth, userController.getUserNotifications);
router.patch('/me/notifications/:id/read', auth, userController.markNotificationRead);
router.patch('/me/notifications/read-all', auth, userController.markAllNotificationsRead);
router.delete('/me/notifications/:id', auth, userController.deleteNotification);

// User's pending requests
router.get('/me/pending-requests', auth, userController.getMyPendingRequests);
router.delete('/me/pending-requests/:requestId', auth, userController.cancelPendingRequest);

// FCM token
router.patch('/me/fcm-token', auth, userController.updateFcmToken);

module.exports = router;
