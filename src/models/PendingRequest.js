const mongoose = require('mongoose');

const pendingRequestSchema = new mongoose.Schema({
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
    invitationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invitation',
        required: true
    },
    role: {
        type: String,
        enum: ['REGULAR_USER', 'ADMIN'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    requestedAt: {
        type: Date,
        default: Date.now
    },
    processedAt: {
        type: Date,
        default: null
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Index for workspace pending requests
pendingRequestSchema.index({ workspaceId: 1, status: 1 });

// Index for user requests
pendingRequestSchema.index({ userId: 1, status: 1 });

// Ensure one pending request per user per workspace
pendingRequestSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

module.exports = mongoose.model('PendingRequest', pendingRequestSchema);
