/**
 * Ordered graceful shutdown. Stages run sequentially, each bounded; total bounded by SHUTDOWN_TIMEOUT_MS.
 * `state.draining` flips first so /readyz fails and the load balancer stops sending traffic.
 */
export const state = { draining: false };

export const registerShutdown = (stages, { stageTimeoutMs = parseInt(process.env.SHUTDOWN_STAGE_TIMEOUT_MS) || 8000, timeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS) || 25000, exit = process.exit } = {}) => {
  let started = false;
  const run = async (signal) => {
    if (started) return;
    started = true;
    state.draining = true;
    console.log(`[shutdown] ${signal}: draining`);
    const hard = setTimeout(() => { console.error('[shutdown] timeout, forcing exit'); exit(1); }, timeoutMs);
    hard.unref?.();
    for (const [name, fn] of stages) {
      // One stuck dependency (e.g. a worker waiting on an unreachable Redis) must not block the stages after it
      let timer;
      try {
        await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`stage timed out after ${stageTimeoutMs}ms`)), stageTimeoutMs); timer.unref?.(); })]);
        console.log(`[shutdown] ${name} done`);
      }
      catch (e) { console.error(`[shutdown] ${name} failed: ${e.message}`); }
      finally { clearTimeout(timer); }
    }
    clearTimeout(hard);
    exit(0);
  };
  process.on('SIGTERM', () => run('SIGTERM'));
  process.on('SIGINT', () => run('SIGINT'));
  return run;
};
