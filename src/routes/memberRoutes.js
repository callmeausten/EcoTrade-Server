const express = require('express');
const memberController = require('../controllers/memberController');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();

// Update member role - OWNER or ADMIN with PROMOTE_DEMOTE_MEMBERS permission
router.patch('/:workspaceId/:memberId', auth, requirePermission('PROMOTE_DEMOTE_MEMBERS'), memberController.updateMemberRole);

// Update permissions - OWNER or ADMIN with PROMOTE_DEMOTE_MEMBERS permission
router.patch('/:workspaceId/:memberId/permissions', auth, requirePermission('PROMOTE_DEMOTE_MEMBERS'), memberController.updatePermissions);

// Remove member - OWNER or ADMIN with KICK_MEMBERS permission
router.delete('/:workspaceId/:memberId', auth, requirePermission('KICK_MEMBERS'), memberController.removeMember);

module.exports = router;
