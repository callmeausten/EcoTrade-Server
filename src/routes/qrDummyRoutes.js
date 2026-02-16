const express = require('express');
const qrDummyController = require('../controllers/qrDummyController');

const router = express.Router();

// GET /api/v1/qr-dummy - Serve the HTML page
router.get('/', qrDummyController.getQrDummyPage);

// GET /api/v1/qr-dummy/script.js - Serve the JavaScript file
router.get('/script.js', qrDummyController.getQrDummyScript);

module.exports = router;
