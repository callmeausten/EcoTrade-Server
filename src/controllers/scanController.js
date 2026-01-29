const Workspace = require('../models/Workspace');
const Device = require('../models/Device');
const WorkspaceMember = require('../models/WorkspaceMember');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { decryptQRPayload, validatePayload } = require('../utils/crypto');

/**
 * Global scan endpoint - workspaceId determined from encrypted QR payload
 * Used by Quick Access scanning when workspace context is not known upfront
 * 
 * Expected encrypted payload structure (after decryption):
 * {
 *   workspaceId: "mongodb_object_id",
 *   deviceId: "BIN-004",
 *   type: "SMART_BIN",
 *   action: "SCAN",
 *   uniqueCode: 1705012345678
 * }
 */
exports.scanDeviceGlobal = async (req, res) => {
    try {
        const { encryptedPayload } = req.body;
        const userId = req.userId;

        console.log('[Global Scan] ===== REQUEST RECEIVED =====');
        console.log('[Global Scan] Request body keys:', Object.keys(req.body));
        console.log('[Global Scan] Encrypted payload present:', !!encryptedPayload);
        console.log('[Global Scan] Encrypted payload length:', encryptedPayload?.length || 0);
        console.log('[Global Scan] First 50 chars:', encryptedPayload?.substring(0, 50));

        // This endpoint only works with encrypted payloads
        if (!encryptedPayload) {
            console.log('[Global Scan] ERROR: Missing encrypted payload');
            return res.status(400).json({
                success: false,
                error: 'Missing encrypted payload',
                message: 'QR code ini tidak valid. Gunakan QR code yang telah dienkripsi.'
            });
        }

        console.log('[Global Scan] Processing encrypted QR payload');

        // Decrypt the payload
        const payload = decryptQRPayload(encryptedPayload);

        console.log('[Global Scan] ===== DECRYPTION RESULT =====');
        console.log('[Global Scan] Decryption successful:', !!payload);
        if (payload) {
            console.log('[Global Scan] Decrypted payload:', JSON.stringify(payload, null, 2));
            console.log('[Global Scan] Payload keys:', Object.keys(payload));
        } else {
            console.log('[Global Scan] Decryption returned null/undefined');
        }

        if (!payload) {
            console.log('[Global Scan] ERROR: Decryption failed');
            return res.status(400).json({
                success: false,
                error: 'Decryption failed',
                message: 'Invalid or corrupted QR code. Please try scanning again.'
            });
        }

        // Validate payload structure
        console.log('[Global Scan] ===== VALIDATION =====');
        const validation = validatePayload(payload);
        console.log('[Global Scan] Validation result:', JSON.stringify(validation, null, 2));

        if (!validation.valid) {
            console.log('[Global Scan] ERROR: Validation failed -', validation.error);
            return res.status(400).json({
                success: false,
                error: 'Invalid payload',
                message: validation.error
            });
        }

        // Extract fields from the decrypted payload
        // NOTE: workspaceId is NOT in the IoT payload - we'll find it by looking up the device
        const finalDeviceId = payload.deviceId;
        const finalAction = payload.action;
        const finalType = payload.type;

        console.log('[Global Scan] ===== EXTRACTED FIELDS =====');
        console.log('[Global Scan] deviceId:', finalDeviceId);
        console.log('[Global Scan] action:', finalAction);
        console.log('[Global Scan] type:', finalType);

        // Validate action - must be SCAN for points
        if (finalAction !== 'SCAN') {
            console.log('[Global Scan] ERROR: Invalid action -', finalAction);
            return res.status(400).json({
                success: false,
                error: `Invalid action for earning points. Got "${finalAction}"`,
                message: 'This QR code is for device registration. Please use the Add Device feature.'
            });
        }

        console.log('[Global Scan] ===== FINDING DEVICE (across all workspaces) =====');
        // Find device by deviceId - check ALL workspaces (user might not know which one)
        let device = await Device.findOne({
            deviceId: finalDeviceId
        });

        console.log('[Global Scan] Device found:', !!device);

        // If not found by deviceId, try MongoDB _id (only if it's a valid ObjectId)
        if (!device && finalDeviceId.match(/^[0-9a-fA-F]{24}$/)) {
            console.log('[Global Scan] Trying to find by MongoDB _id');
            device = await Device.findOne({
                _id: finalDeviceId
            });
            console.log('[Global Scan] Device found by _id:', !!device);
        }

        if (!device) {
            console.log('[Global Scan] ERROR: Device not recognized in any workspace');
            return res.status(404).json({
                success: false,
                error: 'Device not recognized',
                message: 'Perangkat ini tidak terdaftar di sistem.'
            });
        }

        console.log('[Global Scan] Device found:', device.name);
        console.log('[Global Scan] Device workspace:', device.workspaceId);

        // Now we know the workspace - verify user is a member
        const workspaceId = device.workspaceId;

        console.log('[Global Scan] ===== CHECKING MEMBERSHIP =====');
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId
        });

        console.log('[Global Scan] Membership found:', !!membership);
        if (membership) {
            console.log('[Global Scan] Member role:', membership.role);
        }

        if (!membership) {
            // User is not a member of the workspace this device belongs to
            // Get workspace name for better error message
            const workspace = await Workspace.findById(workspaceId);

            console.log('[Global Scan] ERROR: User not a member of device workspace');
            console.log('[Global Scan] Workspace:', workspace?.name);

            return res.status(403).json({
                success: false,
                error: 'Not a member of this workspace',
                message: `Perangkat ini milik workspace "${workspace?.name || 'Unknown'}", tapi Anda bukan anggotanya.`
            });
        }

        console.log('[Global Scan] Device found:', device.name);

        // ===== REPLAY ATTACK PROTECTION =====
        console.log('[Global Scan] ===== REPLAY PROTECTION =====');
        // Check if uniqueCode is new
        if (payload.uniqueCode !== undefined) {
            const newUniqueCode = payload.uniqueCode;
            const lastUniqueCode = device.lastUniqueCode || 0;

            console.log('[Global Scan] New uniqueCode:', newUniqueCode);
            console.log('[Global Scan] Last uniqueCode:', lastUniqueCode);

            if (newUniqueCode <= lastUniqueCode) {
                console.log(`[Global Scan] ERROR: Replay attack blocked! uniqueCode ${newUniqueCode} <= ${lastUniqueCode}`);
                return res.status(400).json({
                    success: false,
                    error: 'QR code sudah dipakai',
                    message: 'QR code ini sudah pernah di-scan. Tunggu QR code baru dari mesin.'
                });
            }

            // Update device's lastUniqueCode
            device.lastUniqueCode = newUniqueCode;
            await device.save();
            console.log(`[Global Scan] Updated lastUniqueCode to ${newUniqueCode}`);
        }

        console.log('[Global Scan] ===== AWARDING POINTS =====');
        // Award points to workspace member (per-workspace points)
        // We already have the membership from earlier checks
        membership.points += 10;
        membership.scanCount += 1;

        console.log('[Global Scan] Workspace member:', membership.userId);
        console.log('[Global Scan] Current workspace points:', membership.points - 10);
        console.log('[Global Scan] New workspace points:', membership.points);

        // Also update user's global points (total across all workspaces)
        const user = await User.findById(userId);
        if (user) {
            user.points += 10;
            user.scanCount += 1;
            console.log('[Global Scan] User global points updated:', user.points);
        }

        // Parallelize saves and activity creation for faster response
        const [updatedMembership, updatedUser, activity] = await Promise.all([
            membership.save(),
            user ? user.save() : Promise.resolve(null),
            Activity.create({
                workspaceId,
                userId,
                deviceId: device._id,
                deviceType: finalType || device.type,
                type: 'SCAN',
                title: 'Waste Scanned',
                description: `${device.name} • ${device.type.replace('_', ' ')}`,
                points: 10,
                timestamp: new Date().toString()
            })
        ]);

        console.log(`[Global Scan] ===== SUCCESS =====`);
        console.log(`[Global Scan] Workspace points: ${membership.points}`);
        console.log(`[Global Scan] Global points: ${user?.points || 'N/A'}`);
        console.log(`[Global Scan] Activity created:`, activity._id);

        res.json({
            success: true,
            data: {
                pointsEarned: 10,
                workspacePoints: membership.points,  // Points in this workspace
                totalPoints: user?.points || membership.points,  // Global points across all workspaces
                scanCount: membership.scanCount,
                activity: {
                    id: activity._id,
                    type: activity.type,
                    title: activity.title,
                    timestamp: activity.timestamp
                }
            }
        });

    } catch (error) {
        console.error('[Global Scan] ===== EXCEPTION =====');
        console.error('[Global Scan] Error:', error);
        console.error('[Global Scan] Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to process scan',
            message: error.message
        });
    }
};

/**
 * Scan device for points - handles encrypted QR payloads from Smart Bin IoT
 * 
 * Expected encrypted payload structure (after decryption):
 * {
 *   workspaceId: "mongodb_object_id",
 *   deviceId: "BIN-004",
 *   type: "SMART_BIN",
 *   action: "SCAN",
 *   uniqueCode: 1705012345678
 * }
 */
exports.scanDevice = async (req, res) => {
    try {
        const { encryptedPayload, deviceId, action, type } = req.body;
        const { id: workspaceIdFromUrl } = req.params;
        const userId = req.userId;

        let payload;
        let workspaceId;
        let finalDeviceId;
        let finalAction;
        let finalType;

        // Check if we have an encrypted payload (new secure flow)
        if (encryptedPayload) {
            console.log('[Scan] Processing encrypted QR payload');

            // Decrypt the payload
            payload = decryptQRPayload(encryptedPayload);

            if (!payload) {
                return res.status(400).json({
                    success: false,
                    error: 'Decryption failed',
                    message: 'Invalid or corrupted QR code. Please try scanning again.'
                });
            }

            // Validate payload structure
            const validation = validatePayload(payload);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid payload',
                    message: validation.error
                });
            }

            // Extract fields from decrypted payload
            // workspaceId is determined by the URL, not the payload
            workspaceId = workspaceIdFromUrl;
            finalDeviceId = payload.deviceId;
            finalAction = payload.action;
            finalType = payload.type;

        } else {
            // Legacy plain-text flow (backward compatibility)
            console.log('[Scan] Processing legacy plain-text payload');
            workspaceId = workspaceIdFromUrl;
            finalDeviceId = deviceId;
            finalAction = action;
            finalType = type;
        }

        // Validate action - must be SCAN for points
        if (!finalAction) {
            return res.status(400).json({
                success: false,
                error: 'Missing action field',
                message: 'QR code must contain an action field'
            });
        }

        if (!['SCAN', 'REGISTER'].includes(finalAction)) {
            return res.status(400).json({
                success: false,
                error: `Invalid action "${finalAction}"`,
                message: 'Action must be SCAN or REGISTER'
            });
        }

        if (finalAction !== 'SCAN') {
            return res.status(400).json({
                success: false,
                error: `Invalid action for earning points. Got "${finalAction}"`,
                message: 'This QR code is for device registration. Please use the Add Device feature.'
            });
        }

        // Verify user is member of workspace
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of this workspace',
                message: 'You must be a member of this workspace to scan devices'
            });
        }

        // Find device by deviceId field (hardware ID) in the requested workspace
        let device = await Device.findOne({
            deviceId: finalDeviceId,
            workspaceId
        });

        // If not found by deviceId, try MongoDB _id (only if it's a valid ObjectId)
        if (!device && finalDeviceId.match(/^[0-9a-fA-F]{24}$/)) {
            device = await Device.findOne({
                _id: finalDeviceId,
                workspaceId
            });
        }

        // If not found, check if device exists in another workspace for better error message
        if (!device) {
            const deviceElsewhere = await Device.findOne({ deviceId: finalDeviceId });
            if (deviceElsewhere) {
                // Parallelize workspace and membership lookup
                const [targetWorkspace, isMember] = await Promise.all([
                    Workspace.findById(deviceElsewhere.workspaceId),
                    WorkspaceMember.findOne({
                        workspaceId: deviceElsewhere.workspaceId,
                        userId
                    })
                ]);

                return res.status(403).json({
                    success: false,
                    error: 'Workspace mismatch',
                    message: 'This device belongs to a different workspace',
                    data: {
                        targetWorkspaceId: deviceElsewhere.workspaceId,
                        targetWorkspaceName: targetWorkspace?.name || 'Unknown Workspace',
                        isMember: !!isMember
                    }
                });
            }
            return res.status(404).json({
                success: false,
                error: 'Device not recognized',
                message: 'Perangkat ini tidak terdaftar di workspace Anda.'
            });
        }

        // ===== REPLAY ATTACK PROTECTION =====
        // Check if uniqueCode is new (only for encrypted payloads)
        if (payload && payload.uniqueCode !== undefined) {
            const newUniqueCode = payload.uniqueCode;
            const lastUniqueCode = device.lastUniqueCode || 0;

            if (newUniqueCode <= lastUniqueCode) {
                console.log(`[Scan] Replay attack blocked! uniqueCode ${newUniqueCode} <= ${lastUniqueCode}`);
                return res.status(400).json({
                    success: false,
                    error: 'QR code sudah dipakai',
                    message: 'QR code ini sudah pernah di-scan. Tunggu QR code baru dari mesin.'
                });
            }

            // Update device's lastUniqueCode
            device.lastUniqueCode = newUniqueCode;
            await device.save();
            console.log(`[Scan] Updated lastUniqueCode to ${newUniqueCode}`);
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Award points to workspace member (per-workspace points)
        membership.points += 10;
        membership.scanCount += 1;

        // Also update user's global points (total across all workspaces)
        user.points += 10;
        user.scanCount += 1;

        // Parallelize saves and activity creation for faster response
        const [updatedMembership, updatedUser, activity] = await Promise.all([
            membership.save(),
            user.save(),
            Activity.create({
                workspaceId,
                userId,
                deviceId: device._id,
                deviceType: finalType || device.type,
                type: 'SCAN',
                title: 'Waste Scanned',
                description: `${device.name} • ${device.type.replace('_', ' ')}`,
                points: 10,
                timestamp: new Date().toString()
            })
        ]);

        console.log(`[Scan] Workspace points: ${membership.points}, Global points: ${user.points}`);

        res.json({
            success: true,
            data: {
                pointsEarned: 10,
                workspacePoints: membership.points,  // Points in this workspace
                totalPoints: user.points,  // Global points across all workspaces
                scanCount: membership.scanCount,
                activity: {
                    id: activity._id,
                    type: activity.type,
                    title: activity.title,
                    timestamp: activity.timestamp
                }
            }
        });

    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process scan',
            message: error.message
        });
    }
};

