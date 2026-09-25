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

// Blocks recording uploads when the plan doesn't include recording or the
// monthly recording minutes are exhausted. `durationMinutes` comes from the
// upload's duration field when available.
export const enforceRecordingLimit = async (req, res, next) => {
  try {
    const duration = Number(req.body?.duration) || 0;
    const result = await assertCanRecord(req.user.id, duration);

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
