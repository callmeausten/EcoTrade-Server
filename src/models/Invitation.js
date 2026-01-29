const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    inviteCode: {
        type: String,
        required: true,
        unique: true,
        length: 8
    },
    role: {
        type: String,
        enum: ['REGULAR_USER', 'ADMIN'],
        default: 'REGULAR_USER'
    },
    requiresApproval: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    },
    maxUses: {
        type: Number,
        default: null // null = unlimited
    },
    usedCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'revoked'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Index for quick lookup by invite code
invitationSchema.index({ inviteCode: 1 });

// Index for workspace invitations
invitationSchema.index({ workspaceId: 1, status: 1 });

// Method to check if invitation is valid
invitationSchema.methods.isValid = function () {
    if (this.status !== 'active') return false;
    if (this.expiresAt < new Date()) {
        this.status = 'expired';
        this.save();
        return false;
    }
    if (this.maxUses && this.usedCount >= this.maxUses) {
        this.status = 'expired';
        this.save();
        return false;
    }
    return true;
};

module.exports = mongoose.model('Invitation', invitationSchema);
