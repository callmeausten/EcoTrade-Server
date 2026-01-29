const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: function() {
            // Password is only required for email-based authentication
            return this.authProvider === 'email';
        },
        select: false // Don't include password in queries by default
    },
    points: {
        type: Number,
        default: 0
    },
    scanCount: {
        type: Number,
        default: 0
    },
    avatarUrl: {
        type: String,
        default: null
    },
    fcmToken: {
        type: String,
        default: null
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // Allow null but must be unique if set
    },
    authProvider: {
        type: String,
        enum: ['email', 'google'],
        default: 'email'
    },
    refreshTokens: [{
        token: String,
        createdAt: { type: Date, default: Date.now }
    }],
    notificationPreferences: {
        personalNotifications: { type: Boolean, default: true },
        workspaceNotifications: { type: Boolean, default: false },
        pushNotifications: { type: Boolean, default: false }
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to get public profile
userSchema.methods.toJSON = function () {
    const user = this.toObject();
    delete user.password;
    delete user.refreshTokens;
    delete user.__v;
    return user;
};

module.exports = mongoose.model('User', userSchema);
