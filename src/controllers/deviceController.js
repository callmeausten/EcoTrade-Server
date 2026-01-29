const Device = require('../models/Device');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { sendToWorkspace } = require('../config/firebase');

// Get workspace devices
exports.getWorkspaceDevices = async (req, res) => {
    try {
        const { type, status, page = 1, limit = 20 } = req.query;
        const workspaceId = req.params.id;

        // Check workspace access
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        // Build query
        const query = { workspaceId };
        if (type) query.type = type;
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const devices = await Device.find(query)
            .limit(parseInt(limit))
            .skip(skip)
            .sort({ createdAt: -1 });

        const total = await Device.countDocuments(query);

        res.json({
            success: true,
            data: {
                devices,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch devices'
            }
        });
    }
};

// Register device from QR code
exports.registerDevice = async (req, res) => {
    try {
        const { id: workspaceId } = req.params;
        const { deviceId, type, name, metadata } = req.body;  // fillLevel is now in metadata
        const userId = req.userId;

        // Validate required fields
        if (!deviceId || !type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'deviceId and type are required'
            });
        }

        // Verify user is member
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of this workspace'
            });
        }

        // Check if device with this deviceId already exists in ANY workspace (global uniqueness)
        // A device can only be registered to ONE workspace at a time
        const existingDevice = await Device.findOne({
            deviceId: deviceId
        }).populate('workspaceId');

        if (existingDevice) {
            // Device already registered somewhere
            const ownerWorkspaceName = existingDevice.workspaceId?.name || 'Unknown';
            const isSameWorkspace = existingDevice.workspaceId?._id?.toString() === workspaceId;

            if (isSameWorkspace) {
                return res.status(409).json({
                    success: false,
                    error: 'Device already registered',
                    message: `Device is already registered in this workspace`
                });
            } else {
                return res.status(409).json({
                    success: false,
                    error: 'Device already registered',
                    message: `Device is already registered in workspace: "${ownerWorkspaceName}". Remove it from that workspace first.`
                });
            }
        }

        // Auto-generate device name based on type
        const deviceCount = await Device.countDocuments({ workspaceId, type });
        const deviceNumber = deviceCount + 1;

        const typeNames = {
            'SMART_BIN': 'Smart Bin',
            'SMART_LAMP': 'Smart Lamp',
            'ACCESS_CONTROL': 'Access Control',
            'RFID_READER': 'RFID Reader',
            'GENERIC': 'Device'
        };

        // const deviceName = `${typeNames[type] || 'Device'} ${deviceNumber}`;

        // Use custom name if provided, otherwise auto-generate
        const deviceName = name || `${typeNames[type] || 'Device'} ${deviceNumber}`;

        // Create device data
        const deviceData = {
            deviceId: deviceId,  // Store the QR deviceId as custom field
            name: deviceName,  // Use custom name from request
            type: type,
            status: 'ACTIVE',
            workspaceId: workspaceId,
            metadata: metadata || {}  // Changed from info to metadata
        };

        // Add fillLevel to metadata if provided
        if (metadata && metadata.fillLevel !== undefined && metadata.fillLevel !== null) {
            deviceData.metadata.fillLevel = metadata.fillLevel;
        }

        // Add type-specific metadata if provided (only if not already in metadata)
        if (metadata) {
            switch (type) {
                case 'SMART_BIN':
                    if (!deviceData.metadata.capacity) {
                        deviceData.metadata.capacity = metadata.capacity || 1000;
                    }
                    break;
                case 'SMART_LAMP':
                    if (!deviceData.metadata.wattage) {
                        deviceData.metadata.wattage = metadata.wattage || 10;
                    }
                    if (!deviceData.metadata.colorTemp) {
                        deviceData.metadata.colorTemp = metadata.colorTemp || 3000;
                    }
                    break;
                case 'ACCESS_CONTROL':
                    if (!deviceData.metadata.accessLevel) {
                        deviceData.metadata.accessLevel = metadata.accessLevel || 'medium';
                    }
                    break;
                case 'RFID_READER':
                    if (!deviceData.metadata.frequency) {
                        deviceData.metadata.frequency = metadata.frequency || '13.56 MHz';
                    }
                    break;
            }
        }

        // Create device
        const device = new Device(deviceData);
        await device.save();

        // Log activity
        const activity = new Activity({
            workspaceId,
            userId,
            type: 'DEVICE_ADDED',
            title: `${device.name} added`,
            description: `New ${typeNames[type]} device registered via QR code`,
            deviceId: device._id,
            deviceType: type,
            timestamp: new Date(),  // ✅ Add required timestamp field
            metadata: {
                registrationMethod: 'QR_SCAN',
                qrDeviceId: deviceId
            }
        });
        await activity.save();

        // Create notification
        const notification = new Notification({
            workspaceId,
            type: 'DEVICE_ADDED',
            title: 'New Device Registered',
            message: `${device.name} has been registered via QR code`,
            metadata: {
                deviceId: device._id,
                deviceName: device.name,
                registrationMethod: 'QR_SCAN',
                addedBy: userId
            }
        });
        await notification.save();

        // Send FCM push notification to workspace members
        sendToWorkspace(workspaceId, {
            id: notification._id.toString(),
            workspaceId: workspaceId,
            type: 'DEVICE_ADDED',
            title: 'New Device Registered',
            message: `${device.name} has been registered via QR code`
        }).catch(err => console.error('FCM send failed:', err));

        res.status(201).json({
            success: true,
            message: 'Device registered successfully',
            data: {
                device: {
                    id: device._id,
                    name: device.name,
                    type: device.type,
                    status: device.status,
                    metadata: device.metadata
                }
            }
        });

    } catch (error) {
        console.error('Register device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register device',
            message: error.message
        });
    }
};

// Add device (manual)
exports.addDevice = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { name, type, serialNumber, location, brightness } = req.body;

        // Check workspace access
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        const device = new Device({
            name,
            type,
            workspaceId,
            metadata: {
                serialNumber,
                location
            }
        });

        // Set type-specific defaults
        if (type === 'SMART_LAMP' && brightness) {
            device.brightness = brightness;
        }

        await device.save();

        // Create notification
        const notification = new Notification({
            workspaceId,
            type: 'DEVICE_ADDED',
            title: 'New Device Added',
            message: `${name} has been added to the workspace`,
            metadata: {
                deviceId: device._id,
                deviceName: name,
                addedBy: req.userId
            }
        });

        await notification.save();

        // Send FCM push notification
        sendToWorkspace(workspaceId, {
            id: notification._id.toString(),
            workspaceId: workspaceId,
            type: 'DEVICE_ADDED',
            title: 'New Device Added',
            message: `${name} has been added to the workspace`
        }).catch(err => console.error('FCM send failed:', err));

        res.status(201).json({
            success: true,
            data: device
        });
    } catch (error) {
        console.error('Add device error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to add device'
            }
        });
    }
};

// Get device details
exports.getDeviceDetails = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);

        if (!device) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Device not found'
                }
            });
        }

        // Check workspace access
        const membership = await WorkspaceMember.findOne({
            workspaceId: device.workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        res.json({
            success: true,
            data: device
        });
    } catch (error) {
        console.error('Get device error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch device'
            }
        });
    }
};

// Update device
exports.updateDevice = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);

        if (!device) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Device not found'
                }
            });
        }

        // Check workspace access
        const membership = await WorkspaceMember.findOne({
            workspaceId: device.workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        // Check Permissions
        const isOwner = membership.role === 'OWNER';
        const isAdmin = membership.role === 'ADMIN';
        const hasPermission = membership.permissions && membership.permissions.includes('UPDATE_DEVICE');

        if (!isOwner && (!isAdmin || !hasPermission)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions. Requires UPDATE_DEVICE permission.'
                }
            });
        }

        const { name, location } = req.body;
        const oldName = device.name;  // Store old name for activity log

        if (name) device.name = name;
        if (location) device.metadata.location = location;

        await device.save();

        // Create activity log for device update
        await Activity.create({
            workspaceId: device.workspaceId,
            userId: req.userId,
            deviceId: device._id,
            deviceType: device.type,
            type: 'DEVICE_ADDED',  // Reuse DEVICE_ADDED for updates
            title: `${device.name} updated`,
            description: name ? `Device renamed from "${oldName}" to "${device.name}"` : `Device location updated`,
            timestamp: new Date().toString()
        });

        // Create notification for device update
        const notification = new Notification({
            workspaceId: device.workspaceId,
            type: 'INFO',
            title: 'Device Updated',
            message: name ? `${device.name} has been renamed` : `Device settings updated`,
            metadata: {
                deviceId: device._id,
                deviceName: device.name,
                updatedBy: req.userId
            }
        });
        await notification.save();

        // Send FCM push notification
        sendToWorkspace(device.workspaceId.toString(), {
            id: notification._id.toString(),
            workspaceId: device.workspaceId.toString(),
            type: 'INFO',
            title: 'Device Updated',
            message: name ? `${device.name} has been renamed` : `Device settings updated`
        }).catch(err => console.error('FCM send failed:', err));

        res.json({
            success: true,
            data: {
                id: device._id,
                name: device.name,
                updatedAt: device.updatedAt
            }
        });
    } catch (error) {
        console.error('Update device error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update device'
            }
        });
    }
};

// Remove device
exports.removeDevice = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);

        if (!device) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Device not found'
                }
            });
        }

        // Check workspace access
        const membership = await WorkspaceMember.findOne({
            workspaceId: device.workspaceId,
            userId: req.userId
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        // Check Permissions
        const isOwner = membership.role === 'OWNER';
        const isAdmin = membership.role === 'ADMIN';
        const hasPermission = membership.permissions && membership.permissions.includes('REMOVE_DEVICE');

        if (!isOwner && (!isAdmin || !hasPermission)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions. Requires REMOVE_DEVICE permission.'
                }
            });
        }

        // Store device info before deletion
        const deviceName = device.name;
        const deviceType = device.type;
        const workspaceId = device.workspaceId;

        // Delete device
        await Device.findByIdAndDelete(req.params.id);

        // Create activity log
        await Activity.create({
            workspaceId: workspaceId,
            userId: req.userId,
            type: 'DEVICE_REMOVED',
            title: `${deviceName} removed`,
            description: `${deviceName} was removed from the workspace`,
            deviceType: deviceType,
            timestamp: new Date().toString()
        });

        // Create notification
        const notification = new Notification({
            workspaceId: workspaceId,
            type: 'DEVICE_REMOVED',
            title: 'Device Removed',
            message: `${deviceName} has been removed from the workspace`,
            metadata: {
                deviceName: deviceName,
                removedBy: req.userId
            }
        });
        await notification.save();

        // Send FCM push notification
        sendToWorkspace(workspaceId.toString(), {
            id: notification._id.toString(),
            workspaceId: workspaceId.toString(),
            type: 'DEVICE_REMOVED',
            title: 'Device Removed',
            message: `${deviceName} has been removed from the workspace`
        }).catch(err => console.error('FCM send failed:', err));

        res.json({
            success: true,
            message: 'Device removed successfully'
        });
    } catch (error) {
        console.error('Remove device error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to remove device'
            }
        });
    }
};

// Control device
exports.controlDevice = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);

        if (!device) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Device not found'
                }
            });
        }

        const { action, parameters } = req.body;

        // Handle different device actions
        switch (action) {
            case 'toggle':
                if (device.type === 'SMART_LAMP') {
                    device.isOn = !device.isOn;
                }
                break;

            case 'setBrightness':
                if (device.type === 'SMART_LAMP' && parameters.brightness !== undefined) {
                    device.brightness = parameters.brightness;
                }
                break;

            case 'setLock':
                if (device.type === 'ACCESS_CONTROL' && parameters.locked !== undefined) {
                    device.isLocked = parameters.locked;
                }
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_ACTION',
                        message: 'Unknown device action'
                    }
                });
        }

        device.status = 'ONLINE';
        device.lastSeen = new Date();
        await device.save();

        res.json({
            success: true,
            message: 'Command sent successfully',
            data: {
                deviceId: device._id,
                action,
                status: 'EXECUTED',
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Control device error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to control device'
            }
        });
    }
};

// Transfer device to another workspace
exports.transferDevice = async (req, res) => {
    try {
        const { id: sourceWorkspaceId, deviceId } = req.params;
        const { targetWorkspaceId } = req.body;
        const userId = req.userId;

        // Validate target workspace
        if (!targetWorkspaceId) {
            return res.status(400).json({
                success: false,
                error: 'Missing targetWorkspaceId',
                message: 'Target workspace ID is required'
            });
        }

        // Get device
        const device = await Device.findById(deviceId);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        // Verify device belongs to source workspace
        if (device.workspaceId.toString() !== sourceWorkspaceId) {
            return res.status(400).json({
                success: false,
                error: 'Device does not belong to this workspace'
            });
        }

        // Get source workspace membership
        const sourceMembership = await WorkspaceMember.findOne({
            workspaceId: sourceWorkspaceId,
            userId
        });

        if (!sourceMembership) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of source workspace'
            });
        }

        // Get source and target workspaces to check ownership
        const sourceWorkspace = await Workspace.findById(sourceWorkspaceId);
        const targetWorkspace = await Workspace.findById(targetWorkspaceId);

        if (!targetWorkspace) {
            return res.status(404).json({
                success: false,
                error: 'Target workspace not found'
            });
        }

        // CRITICAL: Both workspaces must have the SAME owner
        if (sourceWorkspace.ownerId.toString() !== targetWorkspace.ownerId.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Cross-owner transfer not allowed',
                message: 'Devices can only be transferred between workspaces with the same owner'
            });
        }

        // CHECK PERMISSIONS
        // Verify if user is the actual owner of the source workspace
        const isActualOwner = sourceWorkspace.ownerId.toString() === userId.toString();
        const hasTransferPermission = sourceMembership && sourceMembership.permissions.includes('TRANSFER_DEVICE');

        if (isActualOwner) {
            // Owner can always transfer within their workspaces
            // (same-owner validation ensures both workspaces belong to them)
        } else if (hasTransferPermission) {
            // Admin with TRANSFER_DEVICE permission must also have admin access in target workspace
            const targetMembership = await WorkspaceMember.findOne({
                workspaceId: targetWorkspaceId,
                userId
            });

            if (!targetMembership) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to target workspace',
                    message: 'You must be a member of the target workspace'
                });
            }

            // Must be admin in target workspace
            if (targetMembership.role !== 'ADMIN' && targetMembership.role !== 'OWNER') {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions in target workspace',
                    message: 'You must be an admin in the target workspace'
                });
            }

            // Must have TRANSFER_DEVICE permission in target workspace too
            if (targetMembership.role !== 'OWNER' && !targetMembership.permissions.includes('TRANSFER_DEVICE')) {
                return res.status(403).json({
                    success: false,
                    error: 'Missing transfer permission in target workspace',
                    message: 'You need TRANSFER_DEVICE permission in both workspaces'
                });
            }
        } else {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                message: 'Only owner or admins with TRANSFER_DEVICE permission can transfer devices'
            });
        }

        // For owners: same-owner validation is sufficient (already checked above)
        // Owners don't need explicit membership records in their own workspaces

        // Transfer device
        device.workspaceId = targetWorkspaceId;
        await device.save();

        // Create activity log in SOURCE workspace (transfer OUT)
        await Activity.create({
            workspaceId: sourceWorkspaceId,
            userId,
            deviceId: device._id,
            deviceType: device.type,
            type: 'DEVICE_TRANSFERRED_OUT',
            title: 'Device Transferred Out',
            description: `${device.name} transferred to ${targetWorkspace.name}`,
            timestamp: new Date(),
            metadata: {
                targetWorkspaceId,
                targetWorkspaceName: targetWorkspace.name
            }
        });

        // Create activity log in TARGET workspace (transfer IN)
        await Activity.create({
            workspaceId: targetWorkspaceId,
            userId,
            deviceId: device._id,
            deviceType: device.type,
            type: 'DEVICE_TRANSFERRED_IN',
            title: 'Device Transferred In',
            description: `${device.name} transferred from ${sourceWorkspace.name}`,
            timestamp: new Date(),
            metadata: {
                sourceWorkspaceId,
                sourceWorkspaceName: sourceWorkspace.name
            }
        });

        // Create notification in SOURCE workspace
        const sourceNotification = new Notification({
            workspaceId: sourceWorkspaceId,
            type: 'DEVICE_TRANSFERRED',
            title: 'Device Transferred Out',
            message: `${device.name} has been transferred to ${targetWorkspace.name}`,
            metadata: {
                deviceId: device._id,
                deviceName: device.name,
                targetWorkspaceId,
                targetWorkspaceName: targetWorkspace.name,
                transferredBy: userId
            }
        });
        await sourceNotification.save();

        // Send FCM to SOURCE workspace
        sendToWorkspace(sourceWorkspaceId, {
            id: sourceNotification._id.toString(),
            workspaceId: sourceWorkspaceId,
            type: 'DEVICE_TRANSFERRED',
            title: 'Device Transferred Out',
            message: `${device.name} has been transferred to ${targetWorkspace.name}`
        }).catch(err => console.error('FCM send failed:', err));

        // Create notification in TARGET workspace
        const targetNotification = new Notification({
            workspaceId: targetWorkspaceId,
            type: 'DEVICE_RECEIVED',
            title: 'Device Transferred In',
            message: `${device.name} has been transferred from ${sourceWorkspace.name}`,
            metadata: {
                deviceId: device._id,
                deviceName: device.name,
                sourceWorkspaceId,
                sourceWorkspaceName: sourceWorkspace.name,
                transferredBy: userId
            }
        });
        await targetNotification.save();

        // Send FCM to TARGET workspace
        sendToWorkspace(targetWorkspaceId, {
            id: targetNotification._id.toString(),
            workspaceId: targetWorkspaceId,
            type: 'DEVICE_RECEIVED',
            title: 'Device Transferred In',
            message: `${device.name} has been transferred from ${sourceWorkspace.name}`
        }).catch(err => console.error('FCM send failed:', err));

        res.json({
            success: true,
            message: 'Device transferred successfully',
            data: {
                device: {
                    id: device._id,
                    name: device.name,
                    type: device.type,
                    workspaceId: device.workspaceId
                },
                sourceWorkspace: {
                    id: sourceWorkspaceId,
                    name: sourceWorkspace.name
                },
                targetWorkspace: {
                    id: targetWorkspaceId,
                    name: targetWorkspace.name
                }
            }
        });

    } catch (error) {
        console.error('Transfer device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to transfer device',
            message: error.message
        });
    }
};
