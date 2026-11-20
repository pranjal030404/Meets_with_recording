import util from 'util';

/**
 * LOG_FORMAT=json turns console.* into one JSON object per line (level, ts, node, msg) for Loki/promtail,
 * without touching the ~hundreds of existing call sites. Default (unset) leaves console untouched.
 */
export const enableJsonLogs = () => {
  if (process.env.LOG_FORMAT !== 'json') return;
  const node = process.env.NODE_ID || 'node';
  const wrap = (level, orig, stream) => (...args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 3, breakLength: Infinity }))).join(' ');
    stream.write(JSON.stringify({ ts: new Date().toISOString(), level, node, msg: msg.slice(0, 4000) }) + '\n');
  };
  console.log = wrap('info', console.log, process.stdout);
  console.info = console.log;
  console.warn = wrap('warn', console.warn, process.stdout);
  console.error = wrap('error', console.error, process.stderr);
};
