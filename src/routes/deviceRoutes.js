const express = require('express');
const deviceController = require('../controllers/deviceController');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();

// Get device details - any member (checked in controller)
router.get('/:id', auth, deviceController.getDeviceDetails);

// Update device - OWNER or ADMIN with UPDATE_DEVICE permission (Checked in controller)
router.patch('/:id', auth, deviceController.updateDevice);

// Remove device - OWNER or ADMIN with REMOVE_DEVICE permission (Checked in controller)
router.delete('/:id', auth, deviceController.removeDevice);

// Control device - any member (checked in controller)
router.post('/:id/control', auth, deviceController.controlDevice);

module.exports = router;
