const express = require('express');
const invitationController = require('../controllers/invitationController');

const router = express.Router();

// Public endpoint - no auth required
router.get('/:code/info', invitationController.getInvitationInfo);

// Auth required
const auth = require('../middleware/auth');
router.post('/:code/accept', auth, invitationController.acceptInvitation);

module.exports = router;
