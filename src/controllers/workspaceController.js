const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Device = require('../models/Device');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Invitation = require('../models/Invitation');
const PendingRequest = require('../models/PendingRequest');

// Get all workspaces
exports.getAllWorkspaces = async (req, res) => {
    try {
        // Find all workspaces where user is a member
        const memberships = await WorkspaceMember.find({ userId: req.userId })
            .populate('workspaceId');

        const workspaces = await Promise.all(memberships.map(async (membership) => {
            const workspace = membership.workspaceId;
            if (!workspace) return null;

            const memberCount = await WorkspaceMember.countDocuments({ workspaceId: workspace._id });
            const deviceCount = await Device.countDocuments({ workspaceId: workspace._id });

            return {
                id: workspace._id,
                name: workspace.name,
                type: workspace.type,
                ownerId: workspace.ownerId,
                memberCount,
                deviceCount,
                settings: workspace.settings,
                role: membership.role,
                permissions: membership.permissions || [],  // ✅ Include permissions for consistency
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt
            };
        }));

        res.json({
            success: true,
            data: {
                workspaces: workspaces.filter(w => w !== null),
                total: workspaces.filter(w => w !== null).length
            }
        });
    } catch (error) {
        console.error('Get workspaces error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch workspaces'
            }
        });
    }
};

// Get workspace details
exports.getWorkspaceDetails = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Workspace not found'
                }
            });
        }

        // Check if user is a member
        const membership = await WorkspaceMember.findOne({
            workspaceId: workspace._id,
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

        const memberCount = await WorkspaceMember.countDocuments({ workspaceId: workspace._id });
        const deviceCount = await Device.countDocuments({ workspaceId: workspace._id });

        res.json({
            success: true,
            data: {
                id: workspace._id,
                name: workspace.name,
                type: workspace.type,
                ownerId: workspace.ownerId,
                description: workspace.description,
                memberCount,
                deviceCount,
                role: membership.role,  // ✅ Include user's role
                permissions: membership.permissions || [],  // ✅ Include user's permissions
                memberPoints: membership.points || 0,  // ✅ User's points in this workspace
                memberScanCount: membership.scanCount || 0,  // ✅ User's scans in this workspace
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt,
                settings: workspace.settings
            }
        });
    } catch (error) {
        console.error('Get workspace error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch workspace'
            }
        });
    }
};

// Create workspace
exports.createWorkspace = async (req, res) => {
    try {
        const { name, type, description } = req.body;

        const workspace = new Workspace({
            name,
            type,
            description: description || '',
            ownerId: req.userId
        });

        await workspace.save();

        // Add owner as member
        const member = new WorkspaceMember({
            userId: req.userId,
            workspaceId: workspace._id,
            role: 'OWNER',
            permissions: []
        });

        await member.save();

        res.status(201).json({
            success: true,
            data: {
                id: workspace._id,
                name: workspace.name,
                type: workspace.type,
                ownerId: workspace.ownerId,
                description: workspace.description,
                memberCount: 1,
                deviceCount: 0,
                role: 'OWNER',  // ✅ Creator is always OWNER
                permissions: [],  // ✅ OWNER has all permissions (handled by app)
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt
            }
        });
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create workspace'
            }
        });
    }
};

// Update workspace
exports.updateWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Workspace not found'
                }
            });
        }

        // Check if user is owner
        if (workspace.ownerId.toString() !== req.userId.toString()) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only workspace owner can update'
                }
            });
        }

        const { name, description, settings } = req.body;

        if (name) workspace.name = name;
        if (description !== undefined) workspace.description = description;

        // Support updating workspace settings
        if (settings) {
            // Ensure settings object exists (for old workspaces created before this field)
            if (!workspace.settings) {
                workspace.settings = {
                    allowMemberInvites: true,
                    deviceAutoApproval: false,
                    notificationsEnabled: true,
                    isActive: true
                };
            }

            if (settings.isActive !== undefined) {
                workspace.settings.isActive = settings.isActive;
            }
            if (settings.allowMemberInvites !== undefined) {
                workspace.settings.allowMemberInvites = settings.allowMemberInvites;
            }
            if (settings.notificationsEnabled !== undefined) {
                workspace.settings.notificationsEnabled = settings.notificationsEnabled;
            }
        }

        await workspace.save();

        res.json({
            success: true,
            data: {
                id: workspace._id,
                name: workspace.name,
                description: workspace.description,
                updatedAt: workspace.updatedAt
            }
        });
    } catch (error) {
        console.error('Update workspace error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update workspace'
            }
        });
    }
};

// Delete workspace
exports.deleteWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Workspace not found'
                }
            });
        }

        // Check if user is owner
        if (workspace.ownerId.toString() !== req.userId.toString()) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only workspace owner can delete'
                }
            });
        }

        console.log(`[DELETE] Starting workspace deletion: ${workspace._id} (${workspace.name})`);

        // Delete all related data with cascade
        const devicesDeleted = await Device.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${devicesDeleted.deletedCount} devices`);

        const membersDeleted = await WorkspaceMember.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${membersDeleted.deletedCount} members`);

        const notificationsDeleted = await Notification.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${notificationsDeleted.deletedCount} notifications`);

        const activitiesDeleted = await Activity.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${activitiesDeleted.deletedCount} activity logs`);

        const invitationsDeleted = await Invitation.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${invitationsDeleted.deletedCount} invitations`);

        const pendingRequestsDeleted = await PendingRequest.deleteMany({ workspaceId: workspace._id });
        console.log(`[DELETE] Deleted ${pendingRequestsDeleted.deletedCount} pending requests`);

        // Finally delete the workspace itself
        await Workspace.findByIdAndDelete(workspace._id);
        console.log(`[DELETE] Workspace deleted successfully`);

        res.json({
            success: true,
            message: 'Workspace and all related data deleted successfully',
            deletedRecords: {
                devices: devicesDeleted.deletedCount,
                members: membersDeleted.deletedCount,
                notifications: notificationsDeleted.deletedCount,
                activities: activitiesDeleted.deletedCount,
                invitations: invitationsDeleted.deletedCount,
                pendingRequests: pendingRequestsDeleted.deletedCount
            }
        });
    } catch (error) {
        console.error('[DELETE] Delete workspace error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to delete workspace'
            }
        });
    }
};

// Get workspace statistics
exports.getWorkspaceStatistics = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Workspace not found'
                }
            });
        }

        // Get device statistics
        const devices = await Device.find({ workspaceId: workspace._id });

        const devicesByType = {
            SMART_BIN: devices.filter(d => d.type === 'SMART_BIN').length,
            SMART_LAMP: devices.filter(d => d.type === 'SMART_LAMP').length,
            ACCESS_CONTROL: devices.filter(d => d.type === 'ACCESS_CONTROL').length,
            RFID_READER: devices.filter(d => d.type === 'RFID_READER').length
        };

        const devicesByStatus = {
            ONLINE: devices.filter(d => d.status === 'ONLINE').length,
            OFFLINE: devices.filter(d => d.status === 'OFFLINE').length
        };

        // Get member statistics
        const members = await WorkspaceMember.find({ workspaceId: workspace._id });

        const membersByRole = {
            OWNER: members.filter(m => m.role === 'OWNER').length,
            ADMIN: members.filter(m => m.role === 'ADMIN').length,
            REGULAR_USER: members.filter(m => m.role === 'REGULAR_USER').length
        };

        // Get notification count
        const unreadNotifications = await Notification.countDocuments({
            workspaceId: workspace._id,
            isRead: false
        });

        // Get today's activity
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const devicesAddedToday = await Device.countDocuments({
            workspaceId: workspace._id,
            createdAt: { $gte: today }
        });

        const membersJoinedToday = await WorkspaceMember.countDocuments({
            workspaceId: workspace._id,
            joinedDate: { $gte: today }
        });

        res.json({
            success: true,
            data: {
                totalDevices: devices.length,
                devicesByType,
                devicesByStatus,
                totalMembers: members.length,
                membersByRole,
                unreadNotifications,
                recentActivity: {
                    devicesAddedToday,
                    devicesRemovedToday: 0,
                    membersJoinedToday
                }
            }
        });
    } catch (error) {
        console.error('Get workspace statistics error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch statistics'
            }
        });
    }
};
