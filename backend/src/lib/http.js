/** Security headers, and the rule that error details stay on the server. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:", // MediaPipe background effects
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss: ws: data: blob:", // other meeting nodes, TURN, signed storage URLs
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'"
].join('; ');

export const securityHeaders = (req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
};

// Errors that mean "what you sent is wrong", however they surfaced
const INPUT_ERROR = /SequelizeValidationError|Data too long|Incorrect .* value|Out of range|Validation (error|len|isEmail)|Data truncated|cannot be null|foreign key constraint/i;

export const apiResponses = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); // per-user data
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object') {
      const detail = String(body.error || '');
      const clean = { ...body };
      delete clean.error;
      if (INPUT_ERROR.test(detail)) {
        res.status(400);
        clean.success = false;
        clean.message = 'Invalid input';
      }
      return json(clean);
    }
    return json(body);
  };
  next();
};

export const apiNotFound = (req, res) => res.status(404).json({ success: false, message: 'Not found' });

/** Last resort for errors passed to next() (body parser, multer, anything unexpected). */
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.type === 'entity.parse.failed' ? 400 : err.status || err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error('Unhandled request error:', err);
  const message = status === 413 ? 'That file is too large' : status === 415 && err.expose ? err.message : status === 400 ? 'Invalid request' : status >= 500 ? 'Something went wrong' : err.expose ? err.message : 'Request failed';
  res.status(status).json({ success: false, message });
};
