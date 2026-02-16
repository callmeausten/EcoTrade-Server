const path = require('path');

/**
 * QR Dummy Controller
 * Serves the QR code dummy HTML interface for testing device registration and scanning
 */

/**
 * GET /api/v1/qr-dummy
 * Serves the HTML page for QR code dummy interface
 */
exports.getQrDummyPage = (req, res) => {
    try {
        const htmlPath = path.join(__dirname, '../public/qr-dummy/index.html');
        res.sendFile(htmlPath);
    } catch (error) {
        console.error('Error serving QR dummy page:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FILE_SERVE_ERROR',
                message: 'Failed to serve QR dummy page'
            }
        });
    }
};

/**
 * GET /api/v1/qr-dummy/script.js
 * Serves the JavaScript file for QR code dummy interface
 */
exports.getQrDummyScript = (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '../public/qr-dummy/script.js');
        // Set proper MIME type for JavaScript
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.sendFile(scriptPath);
    } catch (error) {
        console.error('Error serving QR dummy script:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FILE_SERVE_ERROR',
                message: 'Failed to serve QR dummy script'
            }
        });
    }
};
