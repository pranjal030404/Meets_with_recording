import logAudit from '../services/auditService.js';

const SKIP = [/^\/api\/admin\/auth\/me/];

// Records every state-changing API request (and failed auth attempts) into the
// audit log. Bodies are never stored, so no passwords or message text leak.
export default function activityLog(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const started = Date.now();

  res.on('finish', () => {
    const path = req.originalUrl.replace(/\?.*$/, '');
    if (SKIP.some(r => r.test(path))) return;

    const actor = req.admin || req.user || null;
    const actorType = req.admin ? 'admin' : req.user ? 'user' : 'anonymous';
    const isAuthPath = /\/(login|signup)$/.test(path);
    const attempted = !actor && isAuthPath && typeof req.body?.email === 'string' ? req.body.email.slice(0, 100) : null;

    logAudit({
      actor,
      actorType,
      actorName: actor ? undefined : attempted || 'anonymous',
      action: `api.${req.method.toLowerCase()}`,
      entityType: 'Request',
      entityId: null,
      metadata: { ms: Date.now() - started },
      req,
      method: req.method,
      path,
      statusCode: res.statusCode
    });
  });
  next();
}
