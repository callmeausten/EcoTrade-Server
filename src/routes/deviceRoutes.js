const express = require('express');
const deviceController = require('../controllers/deviceController');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();

// Get device details - any member (checked in controller)
router.get('/:id', auth, deviceController.getDeviceDetails);

// Update device - OWNER or ADMIN with UPDATE_DEVICE permission
router.patch('/:id', auth, requirePermission('UPDATE_DEVICE'), deviceController.updateDevice);

// Remove device - OWNER or ADMIN with REMOVE_DEVICE permission
router.delete('/:id', auth, requirePermission('REMOVE_DEVICE'), deviceController.removeDevice);

// Control device - any member (checked in controller)
router.post('/:id/control', auth, deviceController.controlDevice);

module.exports = router;
