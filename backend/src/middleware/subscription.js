import {
  assertCanCreateMeeting,
  assertCanRecord
} from '../services/subscriptionService.js';

// Blocks meeting creation when the user's plan quota is exhausted
export const enforceMeetingQuota = async (req, res, next) => {
  try {
    const result = await assertCanCreateMeeting(req.user.id);

    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        message: result.reason,
        code: 'PLAN_LIMIT_REACHED',
        data: {
          plan: result.subscription.plan,
          limits: result.limits
        }
      });
    }

    req.subscription = result.subscription;
    next();
  } catch (error) {
    console.error('Meeting quota check failed:', error);
    res.status(500).json({ success: false, message: 'Error checking plan limits' });
  }
};

// Cheap pre-upload gate: rejects users whose plan doesn't include recording
// at all, before any bytes are received. The per-period minutes check needs
// the multipart-parsed duration, so it runs later in the recordings route
// (see assertCanRecord there).
export const enforceRecordingAllowed = async (req, res, next) => {
  try {
    const result = await assertCanRecord(req.user.id, 0);

    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        message: result.reason,
        code: 'PLAN_LIMIT_REACHED',
        data: {
          plan: result.subscription.plan,
          limits: result.limits
        }
      });
    }

    req.subscription = result.subscription;
    next();
  } catch (error) {
    console.error('Recording limit check failed:', error);
    res.status(500).json({ success: false, message: 'Error checking plan limits' });
  }
};
