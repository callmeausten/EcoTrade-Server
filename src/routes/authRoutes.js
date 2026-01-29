const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register',
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    ],
    authController.register
);

// Login
router.post('/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    authController.login
);

// Google OAuth
router.post('/google',
    [
        body('idToken').notEmpty().withMessage('Google ID token is required')
    ],
    authController.googleAuth
);

// Refresh token
router.post('/refresh',
    [
        body('refreshToken').notEmpty().withMessage('Refresh token is required')
    ],
    authController.refreshToken
);

// Logout
router.post('/logout', auth, authController.logout);

module.exports = router;
