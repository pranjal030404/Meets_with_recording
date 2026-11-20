// PM2 multi-node layout for ONE host. Every API process is also a meeting-owner/SFU node, so it needs its own
// PORT, NODE_ID, browser-reachable NODE_PUBLIC_URL and a NON-OVERLAPPING mediasoup UDP/TCP port slice.
// (PM2 "cluster" mode is wrong here: it would share one port and hide which node owns a meeting.)
//
//   cd backend && NODES_PER_HOST=2 HOST_ID=h1 NODE_PUBLIC_URL_PATTERN='https://{host}-{i}.meet.example.com' \
//     pm2 start ecosystem.multinode.config.cjs --env production
//
// Env knobs (all optional): NODES_PER_HOST=1  HOST_ID=<hostname>  BASE_PORT=5000  CPU_CORES=<os cpus>
//   MEDIASOUP_MIN_PORT=40000 MEDIASOUP_MAX_PORT=49999  NODE_REGION  NODE_ZONE
//   NODE_PUBLIC_URL_PATTERN  ({host} {i} placeholders; empty => same-origin, only valid with 1 node)
//   WORKER_PROCESSES=0  (>0 => dedicated BullMQ worker processes and API runs WORKERS_IN_PROCESS=false)
const os = require('os');

function buildApps(env = process.env) {
  const nodes = Math.max(1, parseInt(env.NODES_PER_HOST) || 1);
  const host = (env.HOST_ID || os.hostname()).replace(/[^A-Za-z0-9-]/g, '-');
  const basePort = parseInt(env.BASE_PORT) || 5000;
  const cores = parseInt(env.CPU_CORES) || os.cpus().length;
  const min = parseInt(env.MEDIASOUP_MIN_PORT) || 40000;
  const max = parseInt(env.MEDIASOUP_MAX_PORT) || 49999;
  const slice = Math.floor((max - min + 1) / nodes);
  const workerProcs = parseInt(env.WORKER_PROCESSES) || 0;
  if (nodes > 1 && !env.NODE_PUBLIC_URL_PATTERN) {
    throw new Error('NODES_PER_HOST > 1 requires NODE_PUBLIC_URL_PATTERN (browsers must reach each node directly)');
  }
  // One mediasoup worker = one core. Split cores between the nodes on this host; leave the rest to Node/nginx.
  const mediaWorkers = Math.max(1, Math.floor(cores / nodes));

  const apps = [];
  for (let i = 0; i < nodes; i++) {
    const url = (env.NODE_PUBLIC_URL_PATTERN || '').replace('{host}', host).replace('{i}', String(i + 1));
    apps.push({
      name: `meetclone-node-${i + 1}`,
      cwd: __dirname,
      script: 'src/index.js',
      // OpenTelemetry (only does anything when OTEL_EXPORTER_OTLP_ENDPOINT is set)
      node_args: env.OTEL_EXPORTER_OTLP_ENDPOINT ? '--import ./src/observability/tracing.mjs' : undefined,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '1G',
      kill_timeout: 30000, // > SHUTDOWN_TIMEOUT_MS: lets the ordered graceful shutdown finish before SIGKILL
      error_file: `./logs/node-${i + 1}.err.log`,
      out_file: `./logs/node-${i + 1}.out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_restarts: 10,
      restart_delay: 4000,
      env: { NODE_ENV: 'development' },
      env_production: {
        NODE_ENV: 'production',
        PORT: basePort + i,
        NODE_ID: `${host}-${i + 1}`,
        NODE_PUBLIC_URL: url,
        NODE_REGION: env.NODE_REGION || 'default',
        NODE_ZONE: env.NODE_ZONE || 'default',
        MEDIASOUP_MIN_PORT: min + i * slice,
        MEDIASOUP_MAX_PORT: min + (i + 1) * slice - 1,
        MEDIASOUP_NUM_WORKERS: mediaWorkers,
        WORKERS_IN_PROCESS: workerProcs > 0 ? 'false' : 'true',
        REDIS_REQUIRED: nodes > 1 || env.REDIS_REQUIRED === 'true' ? 'true' : 'false',
      },
    });
  }
  for (let w = 0; w < workerProcs; w++) {
    apps.push({
      name: `meetclone-worker-${w + 1}`,
      cwd: __dirname,
      script: 'src/workers/main.js',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 30000,
      error_file: `./logs/worker-${w + 1}.err.log`,
      out_file: `./logs/worker-${w + 1}.out.log`,
      env_production: { NODE_ENV: 'production' },
    });
  }
  return apps;
}

module.exports = { apps: buildApps(), buildApps };
