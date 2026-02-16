const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

// GET /api/v1/system/config - Get system configuration (no auth required)
router.get('/config', systemController.getSystemConfig);

module.exports = router;
