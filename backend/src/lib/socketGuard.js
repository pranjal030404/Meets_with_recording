/**
 * A client controls what arrives with a socket event: nothing, null, a string. Handlers destructure an object,
 * so one bad packet used to throw outside any try block and end the whole server process (every meeting).
 * Every handler registered through here gets a plain object, and nothing it throws can escape.
 */
const isPlain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const INTERNAL = new Set(['disconnect', 'disconnecting', 'error']);

export const guardHandler = (event, handler, log = console.error) => (...args) => {
  const ack = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  const call = event === 'net:ping'
    ? () => handler(ack)
    : () => handler(isPlain(args[0]) ? args[0] : {}, ...(ack ? [ack] : []));
  const failed = (error) => {
    log(`Socket event ${event} failed:`, error.message);
    ack?.({ success: false, error: 'Bad request' });
  };
  try {
    const result = call();
    if (typeof result?.then === 'function') result.catch(failed);
  } catch (error) {
    failed(error);
  }
};

export const guardSocket = (socket) => {
  const on = socket.on.bind(socket);
  socket.on = (event, handler) => on(event, INTERNAL.has(event) ? handler : guardHandler(event, handler));
};
