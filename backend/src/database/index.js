import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_NAME = process.env.DB_NAME || 'meetclone';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;

// Read replicas (opt-in). DB_READ_HOSTS="replica1:3306,replica2" => SELECTs are spread over them, writes and
// `useMaster: true` queries go to DB_HOST. Replication lag means a read right after a write may be stale:
// consistency-sensitive paths (auth, read-after-write) pass `useMaster: true` / use `primary` below.
const readHosts = (process.env.DB_READ_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
const credentials = { username: DB_USER, password: DB_PASSWORD };
const replication = readHosts.length
  ? {
      write: { host: DB_HOST, port: DB_PORT, ...credentials },
      read: readHosts.map((h) => { const [host, port] = h.split(':'); return { host, port: parseInt(port) || DB_PORT, ...credentials }; }),
    }
  : null;

const SLOW_MS = parseInt(process.env.DB_SLOW_QUERY_MS) || 500;
export const dbStats = { queries: 0, slow: 0, lastSlow: [] };

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  ...(replication ? { replication } : { host: DB_HOST, port: DB_PORT }),
  dialect: 'mysql',
  logging: false,
  // Slow-query log (no SQL parameters are logged: statements only, truncated)
  benchmark: true,
  logQueryParameters: false,
  pool: {
    // PER PROCESS. Total = instances x max must stay under the server's max_connections (or go through ProxySQL).
    max: parseInt(process.env.DB_POOL_MAX) || 50,
    min: parseInt(process.env.DB_POOL_MIN) || 5,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    evict: 1000,
  },
  dialectOptions: {
    connectTimeout: 60000,
  },
  retry: {
    max: 3,
  },
  define: {
    timestamps: true,
    underscored: false,
    freezeTableName: false
  }
});

// Sequelize calls `logging` for every query when benchmark is on; we only keep timing counters + slow entries.
sequelize.options.logging = (sql, ms) => {
  dbStats.queries++;
  if (ms >= SLOW_MS) {
    dbStats.slow++;
    const entry = { ms, sql: String(sql).replace(/^Executed \(.*?\): /, '').slice(0, 300), at: new Date().toISOString() };
    dbStats.lastSlow = [entry, ...dbStats.lastSlow].slice(0, 20);
    console.warn(`[db] slow query ${ms}ms: ${entry.sql}`);
  }
};

/** Connection-pool utilisation (sequelize-pool internals; absent => null). */
export const poolStats = () => {
  const pool = sequelize.connectionManager?.pool;
  if (!pool) return null;
  return { size: pool.size, available: pool.available, using: pool.using, waiting: pool.waiting, max: pool.maxSize, replicas: readHosts.length };
};

/** Pass to queries that must read their own writes / need current data when replicas are configured. */
export const primary = { useMaster: true };

// MariaDB stores JSON columns as LONGTEXT, so Sequelize's mysql dialect hands them back as strings
// ("[]" instead of []). Parse them on load so models behave the same on MySQL and MariaDB.
sequelize.addHook('afterFind', (result) => {
  if (!result) return;
  for (const row of Array.isArray(result) ? result : [result]) {
    if (!row?.constructor?.rawAttributes) continue;
    for (const [name, attr] of Object.entries(row.constructor.rawAttributes)) {
      if (attr.type?.key !== 'JSON') continue;
      const value = row.dataValues[name];
      if (typeof value !== 'string') continue;
      try { row.dataValues[name] = JSON.parse(value); } catch { /* leave as is */ }
    }
  }
});

// Sequelize compares JSON values by reference, so `row.list.push(x); row.save()` (or re-assigning the same
// array) silently saved nothing. Remember what was loaded and flag the column when its content differs.
const jsonColumns = (model) => Object.entries(model?.rawAttributes || {}).filter(([, a]) => a.type?.key === 'JSON').map(([name]) => name);
const loadedJson = new WeakMap();
const remember = (row) => {
  const names = jsonColumns(row?.constructor);
  if (!names.length) return;
  const snapshot = {};
  for (const name of names) if (row.dataValues[name] !== undefined) snapshot[name] = JSON.stringify(row.dataValues[name]);
  loadedJson.set(row, snapshot);
};
const rememberAll = (result) => { for (const row of Array.isArray(result) ? result : [result]) if (row) remember(row); };
sequelize.addHook('afterFind', rememberAll); // registered after the MariaDB parse hook above
sequelize.addHook('afterSave', remember);
sequelize.addHook('beforeSave', (row) => {
  const snapshot = loadedJson.get(row);
  if (!snapshot) return;
  for (const [name, before] of Object.entries(snapshot)) {
    if (JSON.stringify(row.dataValues[name]) !== before) row.changed(name, true);
  }
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL connected successfully');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    console.error('Ensure MySQL is running and credentials are correctly set in backend/.env');
    process.exit(1);
  }
};

export { sequelize, connectDB };
export default sequelize;
