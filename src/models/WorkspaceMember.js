const mongoose = require('mongoose');

const workspaceMemberSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    role: {
        type: String,
        enum: ['OWNER', 'ADMIN', 'REGULAR_USER'],
        default: 'REGULAR_USER'
    },
    permissions: [{
        type: String,
        enum: [
            // Device Management
            'ADD_DEVICE',
            'REMOVE_DEVICE',
            'TRANSFER_DEVICE',
            'UPDATE_DEVICE',
            // Member Management
            'INVITE_MEMBERS',
            'INVITE_ADMIN',
            'PROMOTE_DEMOTE_MEMBERS',
            'KICK_MEMBERS'
        ]
    }],
    points: {
        type: Number,
        default: 0,
        min: 0
    },
    scanCount: {
        type: Number,
        default: 0,
        min: 0
    },
    fcmToken: {
        type: String,
        default: null
    },
    joinedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure unique user per workspace
workspaceMemberSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

module.exports = mongoose.model('WorkspaceMember', workspaceMemberSchema);
