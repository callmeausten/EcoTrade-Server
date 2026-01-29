const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Device',
        required: false
    },
    deviceType: {
        type: String,
        required: false
    },
    type: {
        type: String,
        enum: ['SCAN', 'DEVICE_ADDED', 'DEVICE_REMOVED', 'DEVICE_TRANSFERRED_OUT', 'DEVICE_TRANSFERRED_IN', 'MEMBER_JOINED', 'MEMBER_LEFT', 'ACHIEVEMENT', 'REWARD', 'GENERIC'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        default: 0
    },
    timestamp: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Index for faster queries
activitySchema.index({ workspaceId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });

// TTL Index: Auto-delete raw activity logs after 30 days
// 30 days * 24 hours * 60 minutes * 60 seconds = 2592000 seconds
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Activity', activitySchema);

