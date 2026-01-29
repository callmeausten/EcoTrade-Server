const express = require('express');
const iotController = require('../controllers/iotController');

const router = express.Router();

// GET /api/v1/iot/status?deviceId=...
router.get('/status', iotController.checkStatus);

module.exports = router;
