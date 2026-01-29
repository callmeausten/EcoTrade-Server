require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { initializeScheduledJobs } = require('./config/scheduler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const memberRoutes = require('./routes/memberRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Initialize app
const app = express();

// Connect to database
connectDB();

// Initialize scheduled jobs (cron tasks)
initializeScheduledJobs();

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
const API_VERSION = process.env.API_VERSION || 'v1';
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);

// Global scan endpoint - used by Quick Access when workspace context is unknown
const scanController = require('./controllers/scanController');
const auth = require('./middleware/auth');
app.post(`/api/${API_VERSION}/scan`, auth, scanController.scanDeviceGlobal);

app.use(`/api/${API_VERSION}/workspaces`, workspaceRoutes);
app.use(`/api/${API_VERSION}/devices`, deviceRoutes);
app.use(`/api/${API_VERSION}/members`, memberRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/invitations`, invitationRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/iot`, require('./routes/iotRoutes'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'Route not found'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || 'Something went wrong'
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces
const SERVER_IP = process.env.SERVER_IP || 'localhost';

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoint: http://${SERVER_IP}:${PORT}/api/${API_VERSION}`);
    console.log(`🌐 Network access: http://${SERVER_IP}:${PORT}/api/${API_VERSION}`);
    console.log(`🏥 Health check: http://${SERVER_IP}:${PORT}/health`);
});

module.exports = app;

