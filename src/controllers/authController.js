const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokenUtils');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Maximum number of devices per user (multi-device support with limit)
const MAX_DEVICES = 5;

// Register
exports.register = async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input data',
                    details: errors.mapped()
                }
            });
        }

        const { name, email, password, fcmToken } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'EMAIL_ALREADY_EXISTS',
                    message: 'An account with this email already exists'
                }
            });
        }

        // Create user
        const user = new User({
            name,
            email,
            password,
            fcmToken: fcmToken || null,
            authProvider: 'email'
        });

        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Save refresh token (limit to MAX_DEVICES)
        if (user.refreshTokens.length >= MAX_DEVICES) {
            user.refreshTokens.shift(); // Remove oldest token
        }
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        res.status(201).json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                expiresIn: 3600,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl
                }
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Registration failed'
            }
        });
    }
};

// Login
exports.login = async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input data',
                    details: errors.mapped()
                }
            });
        }

        const { email, password, fcmToken } = req.body;

        // Find user with password
        const user = await User.findOne({ email }).select('+password');

        if (!user || !user.password) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password'
                }
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password'
                }
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Update FCM token if provided
        if (fcmToken) {
            user.fcmToken = fcmToken;
        }

        // Save refresh token (limit to MAX_DEVICES)
        if (user.refreshTokens.length >= MAX_DEVICES) {
            user.refreshTokens.shift(); // Remove oldest token
        }
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                expiresIn: 3600,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Login failed'
            }
        });
    }
};

// Google OAuth
exports.googleAuth = async (req, res) => {
    try {
        const { idToken, fcmToken } = req.body;

        console.log('[Google Auth] Request received');
        console.log('[Google Auth] Token preview:', idToken ? idToken.substring(0, 50) + '...' : 'MISSING');
        console.log('[Google Auth] Server GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);

        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_TOKEN',
                    message: 'Google ID token is required'
                }
            });
        }

        // Verify Google token
        let ticket;
        try {
            ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            console.log('[Google Auth] Token verified successfully!');
        } catch (error) {
            console.error('[Google Auth] Token verification failed:', error.message);
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_GOOGLE_TOKEN',
                    message: 'Invalid or expired Google ID token'
                }
            });
        }

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        // Check if user exists
        let user = await User.findOne({ $or: [{ googleId }, { email }] });
        let isNewUser = false;

        if (user) {
            // Update Google ID if not set
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = 'google';
                await user.save();
            }
        } else {
            // Create new user
            user = new User({
                name,
                email,
                googleId,
                avatarUrl: picture,
                authProvider: 'google'
            });
            await user.save();
            isNewUser = true;
        }

        // Update FCM token if provided
        if (fcmToken) {
            user.fcmToken = fcmToken;
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Save refresh token (limit to MAX_DEVICES)
        if (user.refreshTokens.length >= MAX_DEVICES) {
            user.refreshTokens.shift(); // Remove oldest token
        }
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        res.status(isNewUser ? 201 : 200).json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                expiresIn: 3600,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl
                },
                isNewUser
            }
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Google authentication failed'
            }
        });
    }
};

// Refresh token
exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        // Verify refresh token
        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_REFRESH_TOKEN',
                    message: 'Invalid or expired refresh token'
                }
            });
        }

        // Find user and check if token exists
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_REFRESH_TOKEN',
                    message: 'Invalid refresh token'
                }
            });
        }

        const tokenExists = user.refreshTokens.some(t => t.token === refreshToken);
        if (!tokenExists) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_REFRESH_TOKEN',
                    message: 'Invalid refresh token'
                }
            });
        }

        // Generate new access token
        const accessToken = generateAccessToken(user._id);

        res.json({
            success: true,
            data: {
                accessToken,
                expiresIn: 3600
            }
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Token refresh failed'
            }
        });
    }
};

// Logout
exports.logout = async (req, res) => {
    try {
        // Remove all refresh tokens for this user
        req.user.refreshTokens = [];
        await req.user.save();

        res.json({
            success: true,
            message: 'Successfully logged out'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Logout failed'
            }
        });
    }
};
