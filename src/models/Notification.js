const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    type: {
        type: String,
        enum: ['DEVICE_ADDED', 'DEVICE_REMOVED', 'DEVICE_TRANSFERRED', 'DEVICE_RECEIVED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'ALERT', 'INFO'],
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
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date,
        default: null
    },
    metadata: {
        deviceId: mongoose.Schema.Types.ObjectId,
        deviceName: String,
        memberId: mongoose.Schema.Types.ObjectId,
        memberName: String,
        addedBy: mongoose.Schema.Types.ObjectId,
        role: String,
        severity: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
