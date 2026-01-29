const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

/**
 * Admin Routes - Activity Archive Management
 * 
 * All routes require authentication.
 * TODO: Add admin role verification (isAdmin middleware)
 * 
 * Base path: /api/v1/admin
 */

// Apply authentication to all admin routes
router.use(auth);

// Archive Management
// POST /api/v1/admin/archive/run - Trigger daily archive manually
router.post('/archive/run', adminController.triggerArchive);

// POST /api/v1/admin/archive/range - Archive custom date range
router.post('/archive/range', adminController.archiveDateRange);

// GET /api/v1/admin/archive/stats/:workspaceId?days=7 - Get workspace stats
router.get('/archive/stats/:workspaceId', adminController.getWorkspaceArchiveStats);

// GET /api/v1/admin/archive/breakdown/:workspaceId?days=30 - Get activity type breakdown
router.get('/archive/breakdown/:workspaceId', adminController.getWorkspaceTypeBreakdown);

// GET /api/v1/admin/archive/health - Check archive system health
router.get('/archive/health', adminController.getArchiveHealth);

module.exports = router;
