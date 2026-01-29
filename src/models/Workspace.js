const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['PRIVATE', 'ORGANIZATION'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    settings: {
        allowMemberInvites: { type: Boolean, default: true },
        deviceAutoApproval: { type: Boolean, default: false },
        notificationsEnabled: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for member count
workspaceSchema.virtual('memberCount', {
    ref: 'WorkspaceMember',
    localField: '_id',
    foreignField: 'workspaceId',
    count: true
});

// Virtual for device count
workspaceSchema.virtual('deviceCount', {
    ref: 'Device',
    localField: '_id',
    foreignField: 'workspaceId',
    count: true
});

module.exports = mongoose.model('Workspace', workspaceSchema);
