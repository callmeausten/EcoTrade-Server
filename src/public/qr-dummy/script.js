// Track device counter and current unique code
let deviceCounter = 1;
let uniqueCodeCounter = Date.now(); // Use current timestamp for uniqueness
let devices = [];

// ==================== ENCRYPTION CONFIGURATION ====================
// IMPORTANT: This key MUST match the ENCRYPTION_KEY in ESP32 firmware and server
// 16 bytes for AES-128 (must be exactly 16 characters)
const ENCRYPTION_KEY = "UnanzaHarmony24!";

// ==================== AES-128-CBC ENCRYPTION ====================
/**
 * Encrypt a JSON payload using AES-128-CBC (matching ESP32 implementation)
 * @param {object} jsonPayload - The JSON object to encrypt
 * @returns {Promise<string>} - Base64 encoded string containing IV + ciphertext
 */
async function encryptPayload(jsonPayload) {
    try {
        // Convert JSON to string
        const jsonString = JSON.stringify(jsonPayload);

        // Convert key and plaintext to ArrayBuffer
        const encoder = new TextEncoder();
        const keyData = encoder.encode(ENCRYPTION_KEY);
        const plaintext = encoder.encode(jsonString);

        // Generate random IV (16 bytes)
        const iv = window.crypto.getRandomValues(new Uint8Array(16));

        // Import the key
        const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "AES-CBC", length: 128 },
            false,
            ["encrypt"]
        );

        // Encrypt the plaintext
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-CBC", iv: iv },
            cryptoKey,
            plaintext
        );

        // Combine IV + ciphertext (matching ESP32 format)
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // Base64 encode the combined data
        const base64String = btoa(String.fromCharCode(...combined));

        return base64String;
    } catch (error) {
        console.error('[Encryption Error]', error);
        throw error;
    }
}

// Initialize invalid QR code on page load
document.addEventListener('DOMContentLoaded', function () {
    createInvalidQR();

    // Set up button event listeners
    document.getElementById('newDeviceBtn').addEventListener('click', createNewDevice);
});

// Create invalid QR code
function createInvalidQR() {
    new QRCode(document.getElementById("qrcodeinvalid"), {
        text: "invacygjhgblid",
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

// Create a new device with both register and scan QR codes
async function createNewDevice() {
    // Get custom device ID from input
    const inputValue = document.getElementById('deviceIdInput').value.trim().toUpperCase();
    let deviceId;

    if (inputValue === 'AUTO' || inputValue === '') {
        // Auto-increment mode
        deviceId = `DUMMY-BIN-${String(deviceCounter).padStart(3, '0')}`;
        deviceCounter++;
    } else {
        // Check if input is a number
        const numericValue = parseInt(inputValue);

        if (!isNaN(numericValue)) {
            // Numeric input - validate and pad
            if (numericValue < 0 || numericValue > 999) {
                alert('Device ID number must be between 0 and 999');
                return;
            }
            // Pad to 3 digits
            deviceId = `DUMMY-BIN-${String(numericValue).padStart(3, '0')}`;
        } else {
            // Non-numeric input - use as-is
            deviceId = `DUMMY-BIN-${inputValue}`;
        }
    }

    const currentUniqueCode = uniqueCodeCounter;
    uniqueCodeCounter++;

    // Create device object
    const device = {
        id: deviceId,
        uniqueCode: currentUniqueCode,
        registerData: {
            deviceId: deviceId,
            action: "REGISTER",
            type: "SMART_BIN",
            metadata: {
                // capacity: 10000,
                // fillLevel: 45
            }
        },
        scanData: {
            deviceId: deviceId,
            type: "SMART_BIN",
            action: "SCAN",
            uniqueCode: currentUniqueCode
        }
    };

    devices.push(device);

    // Add only the new device to DOM
    await addDeviceToDOM(device, devices.length - 1);

    // Reset input to AUTO after creating device
    document.getElementById('deviceIdInput').value = 'AUTO';
}

// Add a single device to the DOM
async function addDeviceToDOM(device, index) {
    const container = document.getElementById('devicesContainer');

    // Remove empty state if it exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Create device card
    const deviceCard = document.createElement('div');
    deviceCard.className = 'device-card';
    deviceCard.id = `device-card-${device.id}`;

    deviceCard.innerHTML = `
        <div class="device-header">
            <div class="device-title">Device #${index + 1}</div>
            <div class="device-id">${device.id}</div>
        </div>
        <div class="qr-codes">
            <div class="qr-section">
                <div class="qr-label">Register</div>
                <div class="qr-container">
                    <div id="register-${device.id}"></div>
                </div>
                <div class="qr-info">Action: REGISTER (Plain JSON)</div>
            </div>
            <div class="qr-section">
                <div class="qr-label">Scan</div>
                <div class="qr-container">
                    <div id="scan-${device.id}"></div>
                </div>
                <div class="qr-info">Code: ${device.uniqueCode} (Encrypted)</div>
            </div>
        </div>
        <div class="device-actions">
            <button class="replace-btn" onclick="replaceScanQR('${device.id}')">Replace Scan QR</button>
        </div>
    `;

    container.appendChild(deviceCard);

    // Generate QR codes after element is in DOM
    setTimeout(async () => {
        await generateQRCodes(device);
    }, 10);
}

// Generate QR codes for a device
async function generateQRCodes(device) {
    try {
        // REGISTER QR Code: Plain JSON (no encryption)
        const registerJSON = JSON.stringify(device.registerData);
        console.log(`[Device ${device.id}] Register (Plain JSON):`, registerJSON);

        // SCAN QR Code: Encrypted
        const encryptedScanData = await encryptPayload(device.scanData);
        console.log(`[Device ${device.id}] Scan (Encrypted):`, encryptedScanData);

        // Register QR Code - Plain JSON
        const registerElement = document.getElementById(`register-${device.id}`);
        if (registerElement && registerElement.innerHTML === '') {
            new QRCode(registerElement, {
                text: registerJSON,  // Plain JSON
                width: 128,
                height: 128,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        // Scan QR Code - Encrypted
        const scanElement = document.getElementById(`scan-${device.id}`);
        if (scanElement && scanElement.innerHTML === '') {
            new QRCode(scanElement, {
                text: encryptedScanData,  // Encrypted payload
                width: 128,
                height: 128,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    } catch (error) {
        console.error(`[Error] Failed to generate QR codes for device ${device.id}:`, error);
    }
}

// Replace scan QR code for a specific device
async function replaceScanQR(deviceId) {
    // Find the device
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    // Increment unique code
    uniqueCodeCounter++;

    // Update the scan data with new unique code
    device.scanData.uniqueCode = uniqueCodeCounter;
    device.uniqueCode = uniqueCodeCounter;

    try {
        // Encrypt the new scan data
        const encryptedScanData = await encryptPayload(device.scanData);

        console.log(`[Device ${deviceId}] New Scan Encrypted:`, encryptedScanData);

        // Update only the scan QR code section
        const scanContainer = document.getElementById(`scan-${deviceId}`);
        const qrInfo = scanContainer.parentElement.querySelector('.qr-info');

        // Clear the QR code container
        scanContainer.innerHTML = '';

        // Regenerate scan QR code with encrypted data
        new QRCode(scanContainer, {
            text: encryptedScanData,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Update the info text
        qrInfo.textContent = `Code: ${device.uniqueCode} (Encrypted)`;
    } catch (error) {
        console.error(`[Error] Failed to replace scan QR for device ${deviceId}:`, error);
    }
}
