// Backend: Express + Socket.IO + mediasoup (port comes from backend/.env PORT)
// Start:  cd backend && pm2 start ecosystem.config.cjs --env production
//
// NOTE: fork mode with ONE instance on purpose. Socket.IO (without sticky
// sessions) and mediasoup room state live in-process, so cluster mode breaks
// meetings. mediasoup already spreads load over its own worker processes.
module.exports = {
  apps: [{
    name: 'meetclone-backend',
    cwd: __dirname,
    script: 'src/index.js',
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
      CLUSTER_ENABLED: 'false',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_restarts: 10,
    restart_delay: 4000,
  }],
};
