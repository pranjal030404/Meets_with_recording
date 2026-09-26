import AuditLog from '../models/AuditLog.js';

/**
 * Append-only audit trail. Never throws — auditing must not break requests.
 *
 * logAudit({
 *   actor: req.user,          // authenticated user (optional)
 *   action: 'team.create',    // dotted action name
 *   entityType: 'Team',
 *   entityId: team.id,
 *   metadata: { name: team.name },
 *   req                       // optional express req for ip/user-agent
 * })
 */
export default async function logAudit({ actor, action, entityType, entityId, metadata = {}, req }) {
  try {
    await AuditLog.create({
      actorId: actor?.id || null,
      actorName: actor?.name || 'system',
      action,
      entityType: entityType || null,
      entityId: entityId ? String(entityId) : null,
      metadata,
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent']?.slice(0, 250) || null
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
}
