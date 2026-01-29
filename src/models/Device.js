const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        trim: true,
        sparse: true  // Allow null but enforce uniqueness when present
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['SMART_BIN', 'SMART_LAMP', 'ACCESS_CONTROL', 'RFID_READER', 'GENERIC'],
        required: true
    },
    status: {
        type: String,
        enum: ['ONLINE', 'OFFLINE', 'ACTIVE', 'INACTIVE'],
        default: 'ACTIVE'
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    // Device-specific data stored as flexible key-value map
    // For SMART_BIN: { capacity: 1000, fillLevel: 0, isLidOpen: false }
    // For SMART_LAMP: { wattage: 10, brightness: 100, isOn: false, colorTemp: 3000 }
    // For ACCESS_CONTROL: { isLocked: true, accessLevel: "admin" }
    // For RFID_READER: { frequency: "13.56MHz", lastScan: null }
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    // For QR code replay protection - stores last used uniqueCode
    lastUniqueCode: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Update lastSeen on any update
deviceSchema.pre('save', function (next) {
    if (this.isModified('status') && this.status === 'ONLINE') {
        this.lastSeen = new Date();
    }
    next();
});

module.exports = mongoose.model('Device', deviceSchema);
