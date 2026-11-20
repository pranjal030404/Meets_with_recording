// Dedicated worker process:  node src/workers/main.js [queue ...]   (WORKERS_IN_PROCESS=false on the API)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { connectDB, sequelize } = await import('../database/index.js');
await import('../models/associations.js');
const { startWorkers } = await import('./index.js');
const { registerShutdown } = await import('../lib/shutdown.js');
const { closeRedis } = await import('../infrastructure/redis/redisClient.js');
const { closeQueues } = await import('../queues/index.js');

if (!process.env.REDIS_URL) { console.error('REDIS_URL is required for a dedicated worker'); process.exit(1); }
await connectDB();
const names = process.argv.slice(2);
const running = startWorkers(names.length ? names : undefined);
registerShutdown([['workers', () => running.close()], ['queues', closeQueues], ['redis', closeRedis], ['database', () => sequelize.close()]]);
