const express = require('express');
const workspaceController = require('../controllers/workspaceController');
const deviceController = require('../controllers/deviceController');
const memberController = require('../controllers/memberController');
const notificationController = require('../controllers/notificationController');
const scanController = require('../controllers/scanController');
const activityController = require('../controllers/activityController');
const auth = require('../middleware/auth');
const { requireRole, requirePermission, requireOwner } = require('../middleware/authorize');

const router = express.Router();

// ===== WORKSPACE MANAGEMENT =====
// List/create - any authenticated user
router.get('/', auth, workspaceController.getAllWorkspaces);
router.post('/', auth, workspaceController.createWorkspace);

// Get details - any member
router.get('/:id', auth, workspaceController.getWorkspaceDetails);

// Update - OWNER or ADMIN only
router.patch('/:id', auth, requireRole(['OWNER', 'ADMIN']), workspaceController.updateWorkspace);

// Delete - OWNER only (CRITICAL)
router.delete('/:id', auth, requireOwner(), workspaceController.deleteWorkspace);

// Statistics - any member
router.get('/:id/statistics', auth, workspaceController.getWorkspaceStatistics);

// ===== DEVICE MANAGEMENT =====
// View devices - any member
router.get('/:id/devices', auth, deviceController.getWorkspaceDevices);

// Add/register device - OWNER or ADMIN with ADD_DEVICE permission
router.post('/:id/devices', auth, requirePermission('ADD_DEVICE'), deviceController.addDevice);
router.post('/:id/devices/register', auth, requirePermission('ADD_DEVICE'), deviceController.registerDevice);

// Transfer device - OWNER or ADMIN with TRANSFER_DEVICE permission
router.post('/:id/devices/:deviceId/transfer', auth, requirePermission('TRANSFER_DEVICE'), deviceController.transferDevice);

// ===== SCANNING =====
// Scan - any member can scan
router.post('/:id/scan', auth, scanController.scanDevice);

// ===== ACTIVITIES =====
// View activities - any member
router.get('/:id/activities', auth, activityController.getActivities);
router.get('/:id/activities/graph', auth, activityController.getActivityGraph);

// Export activities - any member
const activityExportController = require('../controllers/activityExportController');
router.get('/:id/activities/export-info', auth, activityExportController.getExportInfo);
router.post('/:id/activities/export', auth, activityExportController.exportActivities);

// ===== MEMBER MANAGEMENT =====
// View members - any member
router.get('/:id/members', auth, memberController.getMembers);

// Invite member - OWNER or ADMIN with INVITE_MEMBERS permission
router.post('/:id/members/invite', auth, requirePermission('INVITE_MEMBERS'), memberController.inviteMember);

// FCM token - any member
router.post('/:id/members/fcm-token', auth, memberController.saveFcmToken);

// ===== INVITATIONS =====
const invitationController = require('../controllers/invitationController');

// Generate invitation - OWNER or ADMIN with INVITE_MEMBERS permission
router.post('/:id/invitations', auth, requirePermission('INVITE_MEMBERS'), invitationController.generateInvitation);

// View invitations - OWNER or ADMIN
router.get('/:id/invitations', auth, requireRole(['OWNER', 'ADMIN']), invitationController.getWorkspaceInvitations);

// Revoke invitation - OWNER or ADMIN
router.delete('/:id/invitations/:inviteId', auth, requireRole(['OWNER', 'ADMIN']), invitationController.revokeInvitation);

// Pending requests - OWNER or ADMIN
router.get('/:id/pending-requests', auth, requireRole(['OWNER', 'ADMIN']), invitationController.getPendingRequests);
router.post('/:id/pending-requests/:requestId', auth, requireRole(['OWNER', 'ADMIN']), invitationController.processPendingRequest);

// ===== NOTIFICATIONS =====
// Notifications - any member
router.get('/:id/notifications', auth, notificationController.getNotifications);
router.post('/:id/notifications/read-all', auth, notificationController.markAllAsRead);

module.exports = router;
