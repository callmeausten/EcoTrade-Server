const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'REQUEST_APPROVED',
            'REQUEST_REJECTED',
            'ROLE_CHANGED',
            'REMOVED_FROM_WORKSPACE',
            'WORKSPACE_INVITATION',
            'WORKSPACE_DELETED'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: false
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    read: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for efficient queries
userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('UserNotification', userNotificationSchema);
