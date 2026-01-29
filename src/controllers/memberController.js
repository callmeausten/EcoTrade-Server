const WorkspaceMember = require('../models/WorkspaceMember');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const { sendToWorkspace, sendToUser } = require('../config/firebase');

// Get members
exports.getMembers = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { role, page = 1, limit = 20 } = req.query;

        // Check workspace access
        const userMembership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!userMembership) {
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
        if (role) query.role = role;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const members = await WorkspaceMember.find(query)
            .populate('userId', 'name email avatarUrl')
            .limit(parseInt(limit))
            .skip(skip);

        const total = await WorkspaceMember.countDocuments(query);

        const formattedMembers = members.map(member => ({
            id: member._id,
            userId: member.userId._id,
            workspaceId: member.workspaceId,
            name: member.userId.name,
            email: member.userId.email,
            role: member.role,
            permissions: member.permissions,
            joinedDate: member.joinedDate,
            avatarUrl: member.userId.avatarUrl
        }));

        res.json({
            success: true,
            data: {
                members: formattedMembers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch members'
            }
        });
    }
};

// Invite member
exports.inviteMember = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { email, role = 'REGULAR_USER', message } = req.body;

        // Check if user is owner/admin
        const userMembership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!userMembership || (userMembership.role !== 'OWNER' && userMembership.role !== 'ADMIN')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only owners and admins can invite members'
                }
            });
        }

        // Find user by email
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User with this email not found'
                }
            });
        }

        // Check if already a member
        const existingMember = await WorkspaceMember.findOne({
            workspaceId,
            userId: user._id
        });

        if (existingMember) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ALREADY_MEMBER',
                    message: 'User is already a member'
                }
            });
        }

        // Add as member
        const newMember = new WorkspaceMember({
            userId: user._id,
            workspaceId,
            role
        });

        await newMember.save();

        // Create Activity log for the workspace
        const Activity = require('../models/Activity');
        const activity = new Activity({
            workspaceId,
            userId: user._id,
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            description: `${user.name} joined as ${role}`,
            points: 0,
            timestamp: new Date().toString()
        });
        await activity.save();

        // Create notification
        const notification = new Notification({
            workspaceId,
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            message: `${user.name} joined as ${role}`,
            metadata: {
                memberId: newMember._id,
                memberName: user.name,
                role
            }
        });

        await notification.save();

        // Send FCM push notification
        sendToWorkspace(workspaceId, {
            id: notification._id.toString(),
            workspaceId: workspaceId,
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            message: `${user.name} joined as ${role}`
        }).catch(err => console.error('FCM send failed:', err));

        res.json({
            success: true,
            message: 'Invitation sent successfully',
            data: {
                invitationId: newMember._id,
                email,
                role,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            }
        });
    } catch (error) {
        console.error('Invite member error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to invite member'
            }
        });
    }
};

// Update member role
exports.updateMemberRole = async (req, res) => {
    try {
        const { workspaceId, memberId } = req.params;
        const { role, permissions } = req.body;

        // Get workspace and check ownership
        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();

        // Get requester's membership
        const requesterMembership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        // Check permissions: Owner OR Admin with PROMOTE_DEMOTE_MEMBERS permission
        const hasPromoteDemotePermission = requesterMembership &&
            requesterMembership.permissions.includes('PROMOTE_DEMOTE_MEMBERS');

        if (!isOwner && (!hasPromoteDemotePermission || requesterMembership.role !== 'ADMIN')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only workspace owner or admins with PROMOTE_DEMOTE_MEMBERS permission can update roles'
                }
            });
        }

        const member = await WorkspaceMember.findById(memberId);

        if (!member) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Member not found'
                }
            });
        }

        // Determine operation type
        const isDemotingToRegularUser = role === 'REGULAR_USER';
        const isPromotingToAdmin = role === 'ADMIN' && member.role === 'REGULAR_USER';
        const isModifyingAdminPermissions = member.role === 'ADMIN' && role === 'ADMIN';

        // Admins can:
        // 1. Promote regular users to admin
        // 2. Demote admins to regular users
        // But they CANNOT modify permissions of existing admins (owner only)
        if (!isOwner) {
            if (isModifyingAdminPermissions) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Only owner can modify permissions of existing admins'
                    }
                });
            }

            if (!isDemotingToRegularUser && !isPromotingToAdmin) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Invalid operation. Admins can only promote regular users or demote admins.'
                    }
                });
            }
        }

        if (role) member.role = role;
        if (permissions) member.permissions = permissions;

        await member.save();

        // Get workspace and member details for notification
        const affectedUser = await User.findById(member.userId);

        // Send user-level notification to the affected member
        if (affectedUser) {
            let notificationTitle = '';
            let notificationMessage = '';
            let notificationType = '';

            if (isDemotingToRegularUser) {
                // Demotion: Admin → Regular User
                notificationTitle = 'Role Updated';
                notificationMessage = `You have been changed to a regular member in ${workspace.name}`;
                notificationType = 'ROLE_CHANGED';
            } else if (isPromotingToAdmin) {
                // Promotion: Regular User → Admin
                notificationTitle = 'Promoted to Admin';
                notificationMessage = `You have been promoted to admin in ${workspace.name}`;
                notificationType = 'ROLE_CHANGED';
            } else if (isModifyingAdminPermissions) {
                // Permission change for existing admin
                notificationTitle = 'Permissions Updated';
                notificationMessage = `Your admin permissions have been modified in ${workspace.name}`;
                notificationType = 'ROLE_CHANGED';
            }

            if (notificationType) {
                const userNotification = new UserNotification({
                    userId: affectedUser._id,
                    type: notificationType,
                    title: notificationTitle,
                    message: notificationMessage,
                    metadata: {
                        workspaceId: workspaceId,
                        workspaceName: workspace.name,
                        newRole: member.role,
                        permissions: member.permissions
                    }
                });
                await userNotification.save();

                // Send FCM push notification
                sendToUser(affectedUser._id, {
                    id: userNotification._id.toString(),
                    title: notificationTitle,
                    message: notificationMessage,
                    type: notificationType,
                    metadata: {
                        workspaceId: workspaceId,
                        workspaceName: workspace.name,
                        newRole: member.role
                    }
                }).catch(err => console.error('FCM send failed:', err));
            }
        }

        res.json({
            success: true,
            data: {
                id: member._id,
                userId: member.userId,
                role: member.role,
                permissions: member.permissions,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update member role'
            }
        });
    }
};

// Update permissions
exports.updatePermissions = async (req, res) => {
    try {
        const { workspaceId, memberId } = req.params;
        const { permissions } = req.body;

        const member = await WorkspaceMember.findById(memberId);

        if (!member) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Member not found'
                }
            });
        }

        member.permissions = permissions;
        await member.save();

        res.json({
            success: true,
            data: {
                memberId: member._id,
                permissions: member.permissions,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Update permissions error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update permissions'
            }
        });
    }
};

// Remove member
exports.removeMember = async (req, res) => {
    try {
        const { workspaceId, memberId } = req.params;

        // Check if user is owner/admin
        const userMembership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!userMembership || (userMembership.role !== 'OWNER' && userMembership.role !== 'ADMIN')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only owners and admins can remove members'
                }
            });
        }

        const member = await WorkspaceMember.findById(memberId);

        if (!member) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Member not found'
                }
            });
        }

        // Can't remove owner
        if (member.role === 'OWNER') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Cannot remove workspace owner'
                }
            });
        }

        // Get user and workspace details for notification
        const removedUser = await User.findById(member.userId);
        const workspace = await Workspace.findById(workspaceId);

        // Create Activity log for the workspace (MEMBER_LEFT)
        const Activity = require('../models/Activity');
        if (removedUser && workspace) {
            const activity = new Activity({
                workspaceId,
                userId: removedUser._id,
                type: 'MEMBER_LEFT',
                title: 'Member Left',
                description: `${removedUser.name} was removed from the workspace`,
                points: 0,
                timestamp: new Date().toString()
            });
            await activity.save();

            // Create workspace notification (for other members to see)
            const workspaceNotification = new Notification({
                workspaceId,
                type: 'MEMBER_LEFT',
                title: 'Member Left',
                message: `${removedUser.name} has left the workspace`,
                metadata: {
                    memberId: member._id,
                    memberName: removedUser.name,
                    previousRole: member.role
                }
            });
            await workspaceNotification.save();

            // Send FCM to workspace members
            sendToWorkspace(workspaceId, {
                id: workspaceNotification._id.toString(),
                workspaceId: workspaceId,
                type: 'MEMBER_LEFT',
                title: 'Member Left',
                message: `${removedUser.name} has left the workspace`
            }).catch(err => console.error('FCM send failed:', err));
        }

        // Send user-level notification to the removed member
        if (removedUser && workspace) {
            const userNotification = new UserNotification({
                userId: removedUser._id,
                type: 'REMOVED_FROM_WORKSPACE',
                title: 'Removed from Workspace',
                message: `You have been removed from ${workspace.name}`,
                metadata: {
                    workspaceId: workspaceId,
                    workspaceName: workspace.name,
                    previousRole: member.role
                }
            });
            await userNotification.save();

            // Send FCM push notification
            sendToUser(removedUser._id, {
                id: userNotification._id.toString(),
                title: 'Removed from Workspace',
                message: `You have been removed from ${workspace.name}`,
                type: 'REMOVED_FROM_WORKSPACE',
                metadata: {
                    workspaceId: workspaceId,
                    workspaceName: workspace.name,
                    previousRole: member.role
                }
            }).catch(err => console.error('FCM send failed:', err));
        }

        await WorkspaceMember.findByIdAndDelete(memberId);

        res.json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to remove member'
            }
        });
    }
};

// Save FCM Token
exports.saveFcmToken = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { fcmToken } = req.body;

        console.log(`[FCM] Received token save request for workspace: ${workspaceId}`);
        console.log(`[FCM] Request body:`, JSON.stringify(req.body));
        console.log(`[FCM] FCM Token received: ${fcmToken ? `${fcmToken.substring(0, 20)}... (length: ${fcmToken.length})` : 'NULL/UNDEFINED'}`);

        if (!fcmToken) {
            console.error(`[FCM] Validation failed: fcmToken is ${fcmToken === null ? 'null' : fcmToken === undefined ? 'undefined' : 'empty'}`);
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'FCM token is required'
                }
            });
        }

        // Find and update user's membership
        const member = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.userId
        });

        if (!member) {
            console.error(`[FCM] Membership not found for userId: ${req.userId}, workspaceId: ${workspaceId}`);
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Membership not found'
                }
            });
        }

        console.log(`[FCM] Found member: ${member._id}, updating token...`);
        member.fcmToken = fcmToken;
        await member.save();

        console.log(`[FCM] Token saved successfully for member: ${member._id}`);
        console.log(`[FCM] Stored token preview: ${member.fcmToken.substring(0, 20)}...`);

        res.json({
            success: true,
            message: 'FCM token saved successfully'
        });
    } catch (error) {
        console.error('[FCM] Save FCM token error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to save FCM token'
            }
        });
    }
};
