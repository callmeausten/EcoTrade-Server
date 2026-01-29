# PM2 Ecosystem Configuration File
# This file makes it easier to deploy and manage your application with PM2

module.exports = {
    apps: [{
        name: 'harmony-backend',
        script: 'src/server.js',

        // Instances
        instances: 1,
        exec_mode: 'fork', // Use 'cluster' for multiple instances

        // Environment variables
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },

        // Logging
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

        // Advanced features
        watch: false, // Set to true for auto-restart on file changes
        max_memory_restart: '500M',

        // Restart behavior
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',

        // Graceful shutdown
        kill_timeout: 5000,
        listen_timeout: 3000,

        // Monitoring
        instance_var: 'INSTANCE_ID',

        // Source control
        source_map_support: false
    }]
};
