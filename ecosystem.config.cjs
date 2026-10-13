// backend/ecosystem.config.cjs
module.exports = {
    apps: [
        {
            name: 'smartgas-backend',
            script: '/var/www/smartgas/backend/server.js',
            cwd: '/var/www/smartgas/backend',
            instances: 1,           
            exec_mode: 'fork',      
            watch: false,           
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,    

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
