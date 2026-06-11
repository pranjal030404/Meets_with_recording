module.exports = {
  apps: [{
    name: 'meetclone-server',
    script: 'src/index.js',
    instances: process.env.NODE_ENV === 'production' ? -1 : 1,
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      CLUSTER_ENABLED: 'false',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_restarts: 10,
    restart_delay: 4000,
  }],
};
