// VPS preset for meet.arthvex.co.in: 2 backend nodes on ONE host, started by plain `pm2 start` (no env vars needed).
//   cd backend && pm2 delete meetclone-backend; pm2 start ecosystem.vps.config.cjs --env production && pm2 save
// Ports: nodes listen on 5010/5011 (5004/5005 stay with the old backend / the frontend `serve`).
// Override anything from the shell, e.g.  NODES_PER_HOST=3 pm2 start ecosystem.vps.config.cjs --env production
const { buildApps } = require('./ecosystem.multinode.config.cjs');

module.exports = {
  apps: buildApps({
    NODES_PER_HOST: '2',
    HOST_ID: 'meet',
    BASE_PORT: '5010',
    NODE_PUBLIC_URL_PATTERN: 'https://node{i}.meet.arthvex.co.in', // node1.meet..., node2.meet...
    MEDIASOUP_MIN_PORT: '40000',
    MEDIASOUP_MAX_PORT: '49999',
    CPU_CORES: '', // empty => os.cpus().length, split between the nodes
    ...process.env,
  }),
};
