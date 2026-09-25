import express from 'express';
import SubscriptionPlan, { normalizePlan } from '../models/SubscriptionPlan.js';
import { protect } from '../middleware/auth.js';
import {
  SubscriptionError,
  getSubscriptionDetails,
  subscribeToPlan,
  cancelSubscription,
  resumeSubscription,
  listPayments,
  listAllSubscriptions
} from '../services/subscriptionService.js';

const router = express.Router();

const handleError = (res, error, fallbackMessage) => {
  if (error instanceof SubscriptionError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
    error: error.message
  });
};

// Public plan catalog (pricing page)
router.get('/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC']]
    });
    plans.forEach(normalizePlan);

    res.json({ success: true, data: { plans } });
  } catch (error) {
    handleError(res, error, 'Error fetching plans');
  }
});

// Current user's subscription, plan and usage
router.get('/me', protect, async (req, res) => {
  try {
    const { subscription, usage } = await getSubscriptionDetails(req.user.id);

    res.json({
      success: true,
      data: {
        subscription,
        plan: subscription.plan,
        usage
      }
    });
  } catch (error) {
    handleError(res, error, 'Error fetching subscription');
  }
});

// Usage summary for the current period
router.get('/usage', protect, async (req, res) => {
  try {
    const { subscription, usage } = await getSubscriptionDetails(req.user.id);

    res.json({
      success: true,
      data: { usage, limits: subscription.plan?.limits || {} }
    });
  } catch (error) {
    handleError(res, error, 'Error fetching usage');
  }
});

// Change plan (simulated checkout)
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { planSlug, billingInterval } = req.body;

    if (!planSlug) {
      return res.status(400).json({ success: false, message: 'planSlug is required' });
    }

    const { subscription, payment } = await subscribeToPlan(
      req.user.id,
      planSlug,
      billingInterval || 'monthly'
    );

    const details = await getSubscriptionDetails(req.user.id);

    res.json({
      success: true,
      message: payment
        ? `Subscribed to the ${subscription.plan.name} plan successfully`
        : `Switched to the ${subscription.plan.name} plan`,
      data: {
        subscription: details.subscription,
        plan: details.subscription.plan,
        usage: details.usage,
        payment
      }
    });
  } catch (error) {
    handleError(res, error, 'Error subscribing to plan');
  }
});

// Cancel at period end
router.post('/cancel', protect, async (req, res) => {
  try {
    const subscription = await cancelSubscription(req.user.id);

    res.json({
      success: true,
      message: 'Subscription canceled. It stays active until the end of the current billing period.',
      data: { subscription }
    });
  } catch (error) {
    handleError(res, error, 'Error canceling subscription');
  }
});

// Undo a scheduled cancellation
router.post('/resume', protect, async (req, res) => {
  try {
    const subscription = await resumeSubscription(req.user.id);

    res.json({
      success: true,
      message: 'Subscription resumed',
      data: { subscription }
    });
  } catch (error) {
    handleError(res, error, 'Error resuming subscription');
  }
});

// Billing history
router.get('/payments', protect, async (req, res) => {
  try {
    const payments = await listPayments(req.user.id);

    res.json({ success: true, data: { payments } });
  } catch (error) {
    handleError(res, error, 'Error fetching payments');
  }
});

// Admin: overview of every subscription
router.get('/admin/all', protect, async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const subscriptions = await listAllSubscriptions();

    res.json({ success: true, data: { subscriptions } });
  } catch (error) {
    handleError(res, error, 'Error fetching subscriptions');
  }
});

export default router;
