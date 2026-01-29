const Invitation = require('../models/Invitation');
const PendingRequest = require('../models/PendingRequest');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const User = require('../models/User');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const { sendToWorkspace, sendPushNotification, sendDataOnlyNotification } = require('../config/firebase');
const crypto = require('crypto');

// Generate unique invite code
function generateInviteCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Generate invitation
exports.generateInvitation = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const { role = 'REGULAR_USER', requiresApproval = false, maxUses = null } = req.body;

        // Check if user is owner or admin with MANAGE_MEMBERS permission
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

        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();

        // Check if admin has permission to invite members/admins
        const canInviteMembers = membership.permissions.includes('INVITE_MEMBERS');
        const canInviteAdmin = membership.permissions.includes('INVITE_ADMIN');

        // Admins need INVITE_ADMIN permission to invite admins, or INVITE_MEMBERS for regular users
        const hasPermission = (role === 'ADMIN' && canInviteAdmin) || (role !== 'ADMIN' && canInviteMembers);

        if (!isOwner && membership.role !== 'OWNER' && (!hasPermission || membership.role !== 'ADMIN')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only owners and admins with appropriate invite permissions can create invitations'
                }
            });
        }

        // Generate unique invite code
        let inviteCode;
        let isUnique = false;
        while (!isUnique) {
            inviteCode = generateInviteCode();
            const existing = await Invitation.findOne({ inviteCode });
            if (!existing) isUnique = true;
        }

        // Create invitation
        const invitation = new Invitation({
            workspaceId,
            inviteCode,
            role,
            requiresApproval,
            createdBy: req.userId,
            maxUses
        });

        await invitation.save();

        res.status(201).json({
            success: true,
            data: {
                inviteCode: invitation.inviteCode,
                inviteLink: `harmonyapp://join/${invitation.inviteCode}`,
                role: invitation.role,
                requiresApproval: invitation.requiresApproval,
                expiresAt: invitation.expiresAt,
                maxUses: invitation.maxUses
            }
        });
    } catch (error) {
        console.error('Generate invitation error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to generate invitation'
            }
        });
    }
};

// Get invitation info (public endpoint - no auth required)
exports.getInvitationInfo = async (req, res) => {
    try {
        const { code } = req.params;

        const invitation = await Invitation.findOne({ inviteCode: code })
            .populate('workspaceId', 'name description')
            .populate('createdBy', 'name');

        if (!invitation) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Invitation not found'
                }
            });
        }

        if (!invitation.isValid()) {
            return res.status(410).json({
                success: false,
                error: {
                    code: 'INVITATION_EXPIRED',
                    message: 'This invitation has expired'
                }
            });
        }

        res.json({
            success: true,
            data: {
                workspace: {
                    id: invitation.workspaceId._id,
                    name: invitation.workspaceId.name,
                    description: invitation.workspaceId.description
                },
                role: invitation.role,
                requiresApproval: invitation.requiresApproval,
                invitedBy: invitation.createdBy.name,
                expiresAt: invitation.expiresAt
            }
        });
    } catch (error) {
        console.error('Get invitation info error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get invitation info'
            }
        });
    }
};

// Accept invitation
exports.acceptInvitation = async (req, res) => {
    try {
        const { code } = req.params;
        const userId = req.userId;

        const invitation = await Invitation.findOne({ inviteCode: code });

        if (!invitation) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Invitation not found'
                }
            });
        }

        if (!invitation.isValid()) {
            return res.status(410).json({
                success: false,
                error: {
                    code: 'INVITATION_EXPIRED',
                    message: 'This invitation has expired'
                }
            });
        }

        // Check if already a member
        const existingMember = await WorkspaceMember.findOne({
            workspaceId: invitation.workspaceId,
            userId
        });

        if (existingMember) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ALREADY_MEMBER',
                    message: 'You are already a member of this workspace'
                }
            });
        }

        // If requires approval, create pending request
        if (invitation.requiresApproval) {
            // Check for existing pending request
            const existingRequest = await PendingRequest.findOne({
                userId,
                workspaceId: invitation.workspaceId,
                status: 'pending'
            });

            if (existingRequest) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'REQUEST_PENDING',
                        message: 'Your request is already pending approval'
                    }
                });
            }

            const pendingRequest = new PendingRequest({
                userId,
                workspaceId: invitation.workspaceId,
                invitationId: invitation._id,
                role: invitation.role
            });

            await pendingRequest.save();

            // Increment usage count
            invitation.usedCount += 1;
            await invitation.save();

            return res.json({
                success: true,
                message: 'Request sent successfully',
                data: {
                    requiresApproval: true,
                    status: 'pending'
                }
            });
        }

        // Auto-approve: Add directly to workspace
        const newMember = new WorkspaceMember({
            userId,
            workspaceId: invitation.workspaceId,
            role: invitation.role
        });

        await newMember.save();

        // Increment usage count
        invitation.usedCount += 1;
        await invitation.save();

        // Get user details for notification
        const user = await User.findById(userId);

        // Create Activity log for the workspace
        const Activity = require('../models/Activity');
        const activity = new Activity({
            workspaceId: invitation.workspaceId,
            userId: userId,
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            description: `${user.name} joined as ${invitation.role}`,
            points: 0,
            timestamp: new Date().toString()
        });
        await activity.save();

        // Create notification
        const notification = new Notification({
            workspaceId: invitation.workspaceId,
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            message: `${user.name} joined as ${invitation.role}`,
            metadata: {
                memberId: newMember._id,
                memberName: user.name,
                role: invitation.role
            }
        });

        await notification.save();

        // Send FCM notification
        sendToWorkspace(invitation.workspaceId.toString(), {
            id: notification._id.toString(),
            workspaceId: invitation.workspaceId.toString(),
            type: 'MEMBER_JOINED',
            title: 'New Member Joined',
            message: `${user.name} joined as ${invitation.role}`
        }).catch(err => console.error('FCM send failed:', err));

        res.json({
            success: true,
            message: 'Successfully joined workspace',
            data: {
                workspaceId: invitation.workspaceId,
                role: invitation.role,
                requiresApproval: false
            }
        });
    } catch (error) {
        console.error('Accept invitation error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to accept invitation'
            }
        });
    }
};

// Get workspace invitations (owner/admin only)
exports.getWorkspaceInvitations = async (req, res) => {
    try {
        const workspaceId = req.params.id;

        // Check permissions
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

        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();
        const hasPermission = membership.permissions.includes('INVITE_MEMBERS') || membership.permissions.includes('INVITE_ADMIN');

        // Debug log
        console.log(`[Inv] Check permissions. IsOwnerID: ${isOwner}, MemberRole: ${membership.role}`);

        const isOwnerRole = membership.role && membership.role.toUpperCase() === 'OWNER';
        const isAdminRole = membership.role && membership.role.toUpperCase() === 'ADMIN';

        if (!isOwner && !isOwnerRole && (!hasPermission || !isAdminRole)) {
            console.log(`[Inv] ❌ Access denied.`);
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
                }
            });
        }

        const invitations = await Invitation.find({
            workspaceId,
            status: 'active'
        })
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });


        res.json({
            success: true,
            data: {
                invitations: invitations.map(inv => ({
                    id: inv._id,
                    inviteCode: inv.inviteCode,
                    inviteLink: `harmonyapp://join/${inv.inviteCode}`,
                    role: inv.role,
                    requiresApproval: inv.requiresApproval,
                    createdBy: inv.createdBy.name,
                    expiresAt: inv.expiresAt,
                    usedCount: inv.usedCount,
                    maxUses: inv.maxUses,
                    createdAt: inv.createdAt
                }))
            }
        });
    } catch (error) {
        console.error('Get invitations error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get invitations'
            }
        });
    }
};

// Revoke invitation
exports.revokeInvitation = async (req, res) => {
    try {
        const { id: workspaceId, inviteId } = req.params;

        // Check permissions
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

        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();
        const hasPermission = membership.permissions.includes('INVITE_MEMBERS') || membership.permissions.includes('INVITE_ADMIN');

        // Debug log
        console.log(`[Inv] Check permissions. IsOwnerID: ${isOwner}, MemberRole: ${membership.role}`);

        const isOwnerRole = membership.role && membership.role.toUpperCase() === 'OWNER';
        const isAdminRole = membership.role && membership.role.toUpperCase() === 'ADMIN';

        if (!isOwner && !isOwnerRole && (!hasPermission || !isAdminRole)) {
            console.log(`[Inv] ❌ Access denied.`);
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
                }
            });
        }

        const invitation = await Invitation.findById(inviteId);

        if (!invitation || invitation.workspaceId.toString() !== workspaceId) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Invitation not found'
                }
            });
        }

        invitation.status = 'revoked';
        await invitation.save();

        res.json({
            success: true,
            message: 'Invitation revoked successfully'
        });
    } catch (error) {
        console.error('Revoke invitation error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to revoke invitation'
            }
        });
    }
};

// Get pending requests (owner/admin only)
exports.getPendingRequests = async (req, res) => {
    try {
        const workspaceId = req.params.id;

        // Check permissions
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

        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();
        const hasPermission = membership.permissions.includes('KICK_MEMBERS');

        // Debug log
        console.log(`[Inv] Check permissions. IsOwnerID: ${isOwner}, MemberRole: ${membership.role}`);

        const isOwnerRole = membership.role && membership.role.toUpperCase() === 'OWNER';
        const isAdminRole = membership.role && membership.role.toUpperCase() === 'ADMIN';

        if (!isOwner && !isOwnerRole && (!hasPermission || !isAdminRole)) {
            console.log(`[Inv] ❌ Access denied.`);
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
                }
            });
        }

        const requests = await PendingRequest.find({
            workspaceId,
            status: 'pending'
        })
            .populate('userId', 'name email')
            .sort({ requestedAt: -1 });

        res.json({
            success: true,
            data: {
                requests: requests.map(req => ({
                    id: req._id,
                    user: {
                        id: req.userId._id,
                        name: req.userId.name,
                        email: req.userId.email
                    },
                    role: req.role,
                    requestedAt: req.requestedAt
                }))
            }
        });
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get pending requests'
            }
        });
    }
};

// Approve/reject pending request
exports.processPendingRequest = async (req, res) => {
    try {
        const { id: workspaceId, requestId } = req.params;
        const { action } = req.body; // 'approve' or 'reject'

        // Check permissions
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

        const workspace = await Workspace.findById(workspaceId);
        const isOwner = workspace.ownerId.toString() === req.userId.toString();
        const hasPermission = membership.permissions.includes('PROMOTE_DEMOTE_MEMBERS');

        // Debug log
        console.log(`[Inv] Check permissions. IsOwnerID: ${isOwner}, MemberRole: ${membership.role}`);

        const isOwnerRole = membership.role && membership.role.toUpperCase() === 'OWNER';
        const isAdminRole = membership.role && membership.role.toUpperCase() === 'ADMIN';

        if (!isOwner && !isOwnerRole && (!hasPermission || !isAdminRole)) {
            console.log(`[Inv] ❌ Access denied.`);
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
                }
            });
        }

        const request = await PendingRequest.findById(requestId);

        if (!request || request.workspaceId.toString() !== workspaceId) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Request not found'
                }
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_STATUS',
                    message: 'Request has already been processed'
                }
            });
        }

        if (action === 'approve') {
            // Add as member
            const newMember = new WorkspaceMember({
                userId: request.userId,
                workspaceId: request.workspaceId,
                role: request.role
            });

            await newMember.save();

            // Update request status
            request.status = 'approved';
            request.processedAt = new Date();
            request.processedBy = req.userId;
            await request.save();

            // Get user details
            const user = await User.findById(request.userId);

            // Create Activity log for the workspace
            const Activity = require('../models/Activity');
            const activity = new Activity({
                workspaceId: request.workspaceId,
                userId: request.userId,
                type: 'MEMBER_JOINED',
                title: 'New Member Joined',
                description: `${user.name} joined as ${request.role}`,
                points: 0,
                timestamp: new Date().toString()
            });
            await activity.save();

            // Create notification
            const notification = new Notification({
                workspaceId: request.workspaceId,
                type: 'MEMBER_JOINED',
                title: 'New Member Joined',
                message: `${user.name} joined as ${request.role}`,
                metadata: {
                    memberId: newMember._id,
                    memberName: user.name,
                    role: request.role
                }
            });

            await notification.save();

            // Send FCM notification to workspace
            sendToWorkspace(request.workspaceId.toString(), {
                id: notification._id.toString(),
                workspaceId: request.workspaceId.toString(),
                type: 'MEMBER_JOINED',
                title: 'New Member Joined',
                message: `${user.name} joined as ${request.role}`
            }).catch(err => console.error('FCM send failed:', err));

            // Create user notification for the approved user
            const userNotif = new UserNotification({
                userId: request.userId,
                type: 'REQUEST_APPROVED',
                title: 'Request Approved',
                message: `You're now a member of ${workspace.name}!`,
                workspaceId: request.workspaceId,
                metadata: {
                    role: request.role,
                    workspaceName: workspace.name
                }
            });
            await userNotif.save();

            // Send FCM push notification to user
            const approvedUser = await User.findById(request.userId);
            console.log('👤 Approved user:', approvedUser.email);
            console.log('📱 FCM Token:', approvedUser.fcmToken ? `EXISTS (${approvedUser.fcmToken.substring(0, 20)}...)` : 'NULL');

            if (approvedUser && approvedUser.fcmToken) {
                try {
                    console.log('📤 Sending data-only FCM to:', approvedUser.email);
                    // Use data-only message to always trigger onMessageReceived (even in background)
                    const fcmResult = await sendDataOnlyNotification(
                        [approvedUser.fcmToken],
                        {
                            title: 'Request Approved',
                            message: `You're now a member of ${workspace.name}!`,
                            type: 'REQUEST_APPROVED',
                            userId: approvedUser._id.toString(),
                            workspaceId: workspace._id.toString(),
                            workspaceName: workspace.name,
                            role: request.role
                        }
                    );
                    console.log('✅ Data-only FCM result:', fcmResult);
                } catch (error) {
                    console.error('❌ Data-only FCM error:', error);
                }
            } else {
                console.log('⚠️ No FCM token found for user:', approvedUser.email);
            }

            res.json({
                success: true,
                message: 'Request approved successfully'
            });
        } else if (action === 'reject') {
            request.status = 'rejected';
            request.processedAt = new Date();
            request.processedBy = req.userId;
            await request.save();

            // Create user notification for the rejected user
            const userNotif = new UserNotification({
                userId: request.userId,
                type: 'REQUEST_REJECTED',
                title: 'Request Declined',
                message: `Your request to join ${workspace.name} was declined`,
                workspaceId: request.workspaceId,
                metadata: {
                    workspaceName: workspace.name
                }
            });
            await userNotif.save();

            // Send FCM push notification to user
            const user = await User.findById(request.userId);
            console.log('👤 Rejected user:', user.email);
            console.log('📱 FCM Token:', user.fcmToken ? `EXISTS (${user.fcmToken.substring(0, 20)}...)` : 'NULL');

            if (user && user.fcmToken) {
                try {
                    console.log('📤 Sending data-only FCM rejection to:', user.email);
                    // Use data-only message to always trigger onMessageReceived (even in background)
                    const fcmResult = await sendDataOnlyNotification(
                        [user.fcmToken],
                        {
                            title: 'Request Declined',
                            message: `Your request to join ${workspace.name} was declined.`,
                            type: 'REQUEST_REJECTED',
                            userId: user._id.toString(),
                            workspaceId: workspace._id.toString(),
                            workspaceName: workspace.name
                        }
                    );
                    console.log('✅ Data-only FCM rejection result:', fcmResult);
                } catch (error) {
                    console.error('❌ Data-only FCM rejection error:', error);
                }
            } else {
                console.log('⚠️ No FCM token found for user:', user.email);
            }

            // TODO: Send FCM to individual user when user FCM token support is added

            res.json({
                success: true,
                message: 'Request rejected successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_ACTION',
                    message: 'Action must be either "approve" or "reject"'
                }
            });
        }
    } catch (error) {
        console.error('Process request error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to process request'
            }
        });
    }
};
