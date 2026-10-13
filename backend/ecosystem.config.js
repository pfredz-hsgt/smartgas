// backend/ecosystem.config.js
export default {
    apps: [
        {
            name: 'smartgas-backend',
            script: './server.js',

            instances: 1,           // Single instance (scale up if needed)
            exec_mode: 'fork',      // 'cluster' mode requires ESM-compatible PM2 v5+
            watch: false,           // Disable in production (use CI/CD for restarts)
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,    // ms between auto-restarts

            env: {
                NODE_ENV: 'production',
                PORT: 3009,
            },

            // Logging
            out_file: './logs/api-out.log',
            error_file: './logs/api-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
        },
    ],
};