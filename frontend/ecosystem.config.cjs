// Frontend: serves the built Vite app (dist/) as a SPA.
// Build first:  npm run build
// Start:        pm2 start ecosystem.config.cjs
// Requires:     npm install serve   (in frontend/)
const PORT = process.env.FRONTEND_PORT || 5005;

module.exports = {
  apps: [{
    name: 'meetclone-frontend',
    cwd: __dirname,
    script: 'node_modules/serve/build/main.js',
    args: `-s dist -l ${PORT}`,   // -s = SPA fallback to index.html
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '300M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
