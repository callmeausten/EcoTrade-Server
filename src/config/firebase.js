const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin SDK
// Supports two methods:
// 1. Service account JSON file (for local development)
// 2. Environment variables (for production/cloud deployment)

let serviceAccount;
const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');

// Check if environment variables are set
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    console.log('🔐 Using Firebase credentials from environment variables');
    serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    };
} else if (fs.existsSync(serviceAccountPath)) {
    console.log('🔐 Using Firebase credentials from service account JSON file');
    serviceAccount = require(serviceAccountPath);
} else {
    console.error('❌ No Firebase credentials found!');
    console.error('Please provide either:');
    console.error('  1. firebase-service-account.json file in src/config/');
    console.error('  2. Environment variables: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Export FCM messaging instance
const messaging = admin.messaging();

/**
 * Clean up invalid FCM tokens from database
 * @param {Array<string>} invalidTokens - Array of invalid FCM tokens to remove
 */
async function cleanupInvalidTokens(invalidTokens) {
    try {
        const User = require('../models/User');
        const WorkspaceMember = require('../models/WorkspaceMember');

        console.log(`🧹 Cleaning up ${invalidTokens.length} invalid FCM tokens...`);

        // Remove tokens from User collection
        const userResult = await User.updateMany(
            { fcmToken: { $in: invalidTokens } },
            { $unset: { fcmToken: 1 } }
        );
        console.log(`  - Removed from ${userResult.modifiedCount} user(s)`);

        // Remove tokens from WorkspaceMember collection
        const memberResult = await WorkspaceMember.updateMany(
            { fcmToken: { $in: invalidTokens } },
            { $unset: { fcmToken: 1 } }
        );
        console.log(`  - Removed from ${memberResult.modifiedCount} workspace member(s)`);

        console.log(`✅ Token cleanup complete`);
    } catch (error) {
        console.error('❌ Error cleaning up invalid tokens:', error);
    }
}


/**
 * Send FCM push notification to specific tokens
 * @param {Array<string>} tokens - FCM device tokens
 * @param {Object} notification - Notification payload
 * @param {Object} data - Data payload
 */
async function sendPushNotification(tokens, notification, data = {}) {
    if (!tokens || tokens.length === 0) {
        console.log('No FCM tokens provided');
        return { success: false, error: 'No tokens' };
    }

    // Ensure all data values are strings (FCM requirement)
    const stringifyData = (obj) => {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined) {
                result[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
            }
        }
        return result;
    };

    const message = {
        tokens: tokens,
        notification: {
            title: notification.title,
            body: notification.message
        },
        data: stringifyData({
            ...data,
            notificationId: notification.id || '',
            workspaceId: notification.workspaceId || '',
            type: notification.type || 'INFO',
            click_action: 'FLUTTER_NOTIFICATION_CLICK' // For Android
        }),
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                channelId: 'harmony_notifications',
                priority: 'high'
            }
        }
    };

    try {
        // Use sendEachForMulticast for better compatibility
        const response = await messaging.sendEachForMulticast(message);
        console.log(`FCM sent: ${response.successCount} successful, ${response.failureCount} failed`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    console.error(`Failed to send to token ${idx}:`, resp.error);

                    // These error codes indicate the token is invalid and should be removed
                    if (errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered' ||
                        errorCode === 'messaging/not-found') {
                        invalidTokens.push(tokens[idx]);
                        console.log(`⚠️ Marking token ${idx} for removal (${errorCode})`);
                    }
                }
            });

            // Remove invalid tokens from database
            if (invalidTokens.length > 0) {
                await cleanupInvalidTokens(invalidTokens);
            }
        }

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses
        };
    } catch (error) {
        console.error('Error sending FCM:', error);
        // Fallback: try sending individually
        try {
            console.log('Attempting individual sends as fallback...');
            let successCount = 0;
            let failureCount = 0;
            const responses = [];
            const invalidTokens = [];

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                try {
                    const singleMessage = {
                        token: token,
                        notification: message.notification,
                        data: message.data,
                        android: message.android
                    };
                    await messaging.send(singleMessage);
                    successCount++;
                    responses.push({ success: true });
                } catch (err) {
                    failureCount++;
                    responses.push({ success: false, error: err.message });
                    console.error(`Failed to send to token ${i}:`, err.message);

                    // Check for invalid token errors
                    if (err.code === 'messaging/invalid-registration-token' ||
                        err.code === 'messaging/registration-token-not-registered' ||
                        err.code === 'messaging/not-found') {
                        invalidTokens.push(token);
                        console.log(`⚠️ Marking token ${i} for removal (${err.code})`);
                    }
                }
            }

            // Remove invalid tokens from database
            if (invalidTokens.length > 0) {
                await cleanupInvalidTokens(invalidTokens);
            }

            console.log(`Fallback FCM sent: ${successCount} successful, ${failureCount} failed`);
            return {
                success: successCount > 0,
                successCount,
                failureCount,
                responses
            };
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            return { success: false, error: fallbackError.message };
        }
    }
}

/**
 * Send data-only FCM message (silent notification for background sync)
 * Always triggers onMessageReceived() even when app is in background
 * @param {Array<string>} tokens - FCM device tokens
 * @param {Object} data - Data payload only (no notification)
 */
async function sendDataOnlyNotification(tokens, data = {}) {
    if (!tokens || tokens.length === 0) {
        console.log('No FCM tokens provided');
        return { success: false, error: 'No tokens' };
    }

    // Ensure all data values are strings (FCM requirement)
    const stringifyData = (obj) => {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined) {
                result[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
            }
        }
        return result;
    };

    const message = {
        tokens: tokens,
        data: stringifyData({
            ...data,
            title: data.title || '',
            message: data.message || '',
            type: data.type || 'INFO'
        }),
        android: {
            priority: 'high'
        }
    };

    try {
        const response = await messaging.sendEachForMulticast(message);
        console.log(`📱 Data-only FCM sent: ${response.successCount} successful, ${response.failureCount} failed`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    console.error(`Failed to send to token ${idx}:`, resp.error);

                    // These error codes indicate the token is invalid and should be removed
                    if (errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered' ||
                        errorCode === 'messaging/not-found') {
                        invalidTokens.push(tokens[idx]);
                        console.log(`⚠️ Marking token ${idx} for removal (${errorCode})`);
                    }
                }
            });

            // Remove invalid tokens from database
            if (invalidTokens.length > 0) {
                await cleanupInvalidTokens(invalidTokens);
            }
        }

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses
        };
    } catch (error) {
        console.error('Error sending data-only FCM:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification to all workspace members
 * @param {string} workspaceId - Workspace ID
 * @param {Object} notification - Notification object
 */
async function sendToWorkspace(workspaceId, notification) {
    try {
        const WorkspaceMember = require('../models/WorkspaceMember');

        // Get all members with FCM tokens
        const members = await WorkspaceMember.find({
            workspaceId: workspaceId,
            fcmToken: { $exists: true, $ne: null }
        }).select('fcmToken');

        const tokens = members.map(m => m.fcmToken).filter(t => t);

        if (tokens.length === 0) {
            console.log('No members with FCM tokens in workspace');
            return { success: false, error: 'No tokens' };
        }

        // Use data-only notification for client-side control
        return await sendDataOnlyNotification(tokens, {
            title: notification.title,
            message: notification.message,
            type: notification.type,
            workspaceId: workspaceId,
            ...notification.metadata
        });
    } catch (error) {
        console.error('Error sending to workspace:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send FCM push notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {Object} notification - Notification object with title, message, type, etc.
 */
async function sendToUser(userId, notification) {
    try {
        const User = require('../models/User');

        // Get user's FCM token
        const user = await User.findById(userId);

        if (!user || !user.fcmToken) {
            console.log(`No FCM token for user ${userId}`);
            return { success: false, error: 'No FCM token' };
        }

        console.log(`[FCM] Sending to user ${userId}: ${notification.title}`);

        // Use data-only notification for client-side control
        return await sendDataOnlyNotification(
            [user.fcmToken],
            {
                title: notification.title,
                message: notification.message,
                type: notification.type,
                userId: userId.toString(),
                ...notification.metadata
            }
        );
    } catch (error) {
        console.error('Error sending to user:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    admin,
    messaging,
    sendPushNotification,
    sendDataOnlyNotification,
    sendToWorkspace,
    sendToUser
};
