const express = require('express');
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

const router = express.Router();

router.patch('/:id/read', auth, notificationController.markAsRead);
router.delete('/:id', auth, notificationController.deleteNotification);

module.exports = router;
