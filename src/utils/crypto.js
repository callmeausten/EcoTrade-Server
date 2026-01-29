/**
 * Crypto utility for QR code encryption/decryption
 * Uses AES-128-CBC with shared secret key between ESP32 and backend
 */
const crypto = require('crypto');

// Shared secret key - MUST match the key in ESP32 firmware
// 16 bytes for AES-128 (32 hex characters)
const ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
    console.error('❌ QR_ENCRYPTION_KEY is required in .env file');
    process.exit(1);
}

// Validate key length
if (ENCRYPTION_KEY.length !== 16) {
    console.error('⚠️ QR_ENCRYPTION_KEY must be exactly 16 characters for AES-128');
    console.error(`   Current length: ${ENCRYPTION_KEY.length}`);
    process.exit(1);
}

/**
 * Decrypt a QR code payload encrypted by ESP32
 * @param {string} encryptedBase64 - Base64 encoded string containing IV + ciphertext
 * @returns {object|null} - Decrypted JSON payload or null if decryption fails
 */
function decryptQRPayload(encryptedBase64) {
    try {
        // Decode Base64
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

        // Extract IV (first 16 bytes) and ciphertext (rest)
        if (encryptedBuffer.length < 17) {
            console.error('[Crypto] Encrypted data too short');
            return null;
        }

        const iv = encryptedBuffer.slice(0, 16);
        const ciphertext = encryptedBuffer.slice(16);

        // Create decipher
        const decipher = crypto.createDecipheriv('aes-128-cbc', ENCRYPTION_KEY, iv);
        decipher.setAutoPadding(true);

        // Decrypt
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Parse JSON
        const jsonString = decrypted.toString('utf8');
        const payload = JSON.parse(jsonString);

        console.log('[Crypto] Successfully decrypted QR payload');
        return payload;

    } catch (error) {
        console.error('[Crypto] Decryption failed:', error.message);
        return null;
    }
}

/**
 * Encrypt a payload (for testing purposes)
 * @param {object} payload - JSON object to encrypt
 * @returns {string} - Base64 encoded IV + ciphertext
 */
function encryptPayload(payload) {
    try {
        // Generate random IV
        const iv = crypto.randomBytes(16);

        // Create cipher
        const cipher = crypto.createCipheriv('aes-128-cbc', ENCRYPTION_KEY, iv);

        // Encrypt
        const jsonString = JSON.stringify(payload);
        let encrypted = cipher.update(jsonString, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        // Combine IV + ciphertext and encode as Base64
        const combined = Buffer.concat([iv, encrypted]);
        return combined.toString('base64');

    } catch (error) {
        console.error('[Crypto] Encryption failed:', error.message);
        return null;
    }
}

/**
 * Validate QR payload structure
 * @param {object} payload - Decrypted payload
 * @returns {object} - { valid: boolean, error?: string }
 */
function validatePayload(payload) {
    console.log('[Crypto] Validating payload:', JSON.stringify(payload, null, 2));

    if (!payload) {
        console.log('[Crypto] Validation failed: Empty payload');
        return { valid: false, error: 'Empty payload' };
    }

    const requiredFields = ['deviceId', 'type', 'action', 'uniqueCode'];

    console.log('[Crypto] Checking required fields:', requiredFields);

    for (const field of requiredFields) {
        const value = payload[field];
        console.log(`[Crypto] Field '${field}':`, value, `(type: ${typeof value})`);

        if (payload[field] === undefined || payload[field] === null) {
            console.log(`[Crypto] Validation failed: Missing field: ${field}`);
            return { valid: false, error: `Missing field: ${field}` };
        }
    }

    if (!['SCAN', 'REGISTER'].includes(payload.action)) {
        console.log(`[Crypto] Validation failed: Invalid action: ${payload.action}`);
        return { valid: false, error: `Invalid action: ${payload.action}` };
    }

    if (typeof payload.uniqueCode !== 'number') {
        console.log(`[Crypto] Validation failed: uniqueCode must be a number, got ${typeof payload.uniqueCode}`);
        return { valid: false, error: 'uniqueCode must be a number' };
    }

    console.log('[Crypto] Validation passed!');
    return { valid: true };
}

module.exports = {
    decryptQRPayload,
    encryptPayload,
    validatePayload,
    ENCRYPTION_KEY
};
