import { Op, fn, col } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import SubscriptionPlan, { normalizePlan } from '../models/SubscriptionPlan.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import UsageLog from '../models/UsageLog.js';

const FREE_PLAN_SLUG = 'free';

class SubscriptionError extends Error {
  constructor(message, statusCode = 400, code = 'SUBSCRIPTION_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d;
};

const addYears = (date, years) => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
};

// Period usage window. Paid plans renew on their billing anniversary; the
// free plan (no period end) is metered per calendar month.
const getPeriodBounds = (subscription) => {
  if (subscription?.currentPeriodStart && subscription?.currentPeriodEnd) {
    return {
      start: new Date(subscription.currentPeriodStart),
      end: new Date(subscription.currentPeriodEnd)
    };
  }
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
};

const getPlanBySlug = async (slug) => {
  const plan = await SubscriptionPlan.findOne({ where: { slug, isActive: true } });
  if (!plan) {
    throw new SubscriptionError(`Plan "${slug}" not found or inactive`, 404, 'PLAN_NOT_FOUND');
  }
  return plan;
};

const ensureSubscription = async (userId) => {
  let subscription = await Subscription.findOne({
    where: { userId },
    include: [{ model: SubscriptionPlan, as: 'plan' }]
  });

  if (!subscription) {
    const freePlan = await getPlanBySlug(FREE_PLAN_SLUG);
    const created = await Subscription.create({
      userId,
      planId: freePlan.id,
      status: 'active',
      billingInterval: 'monthly',
      amount: 0,
      currency: freePlan.currency,
      paymentMethod: 'none'
    });
    subscription = await Subscription.findByPk(created.id, {
      include: [{ model: SubscriptionPlan, as: 'plan' }]
    });
  }

  // afterFind hooks don't fire for eagerly included models, normalize manually
  if (subscription?.plan) normalizePlan(subscription.plan);

  return subscription;
};

const getUsageSummary = async (userId, subscription) => {
  const { start, end } = getPeriodBounds(subscription);

  const rows = await UsageLog.findAll({
    where: {
      userId,
      createdAt: { [Op.gte]: start, [Op.lt]: end }
    },
    attributes: [
      'type',
      [fn('SUM', col('amount')), 'total']
    ],
    group: ['type'],
    raw: true
  });

  const totals = { meetingsCreated: 0, meetingMinutes: 0, recordingMinutes: 0 };
  for (const row of rows) {
    if (row.type === 'meeting_created') totals.meetingsCreated = parseInt(row.total) || 0;
    if (row.type === 'meeting_minutes') totals.meetingMinutes = parseInt(row.total) || 0;
    if (row.type === 'recording_minutes') totals.recordingMinutes = parseInt(row.total) || 0;
  }

  return { periodStart: start, periodEnd: end, ...totals };
};

const getSubscriptionDetails = async (userId) => {
  const subscription = await ensureSubscription(userId);
  const usage = await getUsageSummary(userId, subscription);
  return { subscription, usage };
};

const assertCanCreateMeeting = async (userId) => {
  const subscription = await ensureSubscription(userId);
  const limits = subscription.plan?.limits || {};

  if (limits.meetingsPerMonth === -1) {
    return { allowed: true, subscription, limits };
  }

  const usage = await getUsageSummary(userId, subscription);
  if (usage.meetingsCreated >= (limits.meetingsPerMonth || 0)) {
    return {
      allowed: false,
      subscription,
      limits,
      reason: `Your ${subscription.plan.name} plan allows ${limits.meetingsPerMonth} meetings per month (this period: ${usage.meetingsCreated}). Upgrade your plan to create more meetings.`
    };
  }

  return { allowed: true, subscription, limits };
};

const assertCanRecord = async (userId, durationMinutes = 0) => {
  const subscription = await ensureSubscription(userId);
  const limits = subscription.plan?.limits || {};

  if (!limits.canRecord) {
    return {
      allowed: false,
      subscription,
      limits,
      reason: `Recording is not available on the ${subscription.plan.name} plan. Upgrade to Pro or higher to record meetings.`
    };
  }

  if (limits.recordingMinutesPerMonth === -1) {
    return { allowed: true, subscription, limits };
  }

  const usage = await getUsageSummary(userId, subscription);
  if (usage.recordingMinutes + durationMinutes > limits.recordingMinutesPerMonth) {
    return {
      allowed: false,
      subscription,
      limits,
      reason: `Your ${subscription.plan.name} plan includes ${limits.recordingMinutesPerMonth} recording minutes per month and you have used ${usage.recordingMinutes}. Upgrade for more recording time.`
    };
  }

  return { allowed: true, subscription, limits };
};

const recordUsage = async (userId, type, amount = 1, meetingId = null, metadata = {}) => {
  if (!['meeting_created', 'meeting_minutes', 'recording_minutes'].includes(type)) {
    throw new SubscriptionError(`Unknown usage type: ${type}`);
  }
  await UsageLog.create({ userId, type, amount: Math.max(0, Math.round(amount)), meetingId, metadata });
};

// Payments are simulated (demo gateway). Swap this block for a real
// provider (Stripe/Razorpay) — the Payment row and period assignment stay the same.
const activatePaidPlan = async (userId, subscription, plan, interval) => {
  const now = new Date();
  const periodEnd = interval === 'yearly' ? addYears(now, 1) : addMonths(now, 1);
  const amount = interval === 'yearly' ? Number(plan.yearlyPrice) : Number(plan.monthlyPrice);

  const payment = await Payment.create({
    userId,
    subscriptionId: subscription.id,
    planId: plan.id,
    amount,
    currency: plan.currency,
    status: 'paid',
    method: 'demo-card',
    transactionId: `txn_${uuidv4()}`,
    description: `${plan.name} plan — ${interval} subscription`,
    periodStart: now,
    periodEnd,
    paidAt: now
  });

  await subscription.update({
    planId: plan.id,
    status: 'active',
    billingInterval: interval,
    amount,
    currency: plan.currency,
    paymentMethod: 'demo-card',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null
  });

  return { subscription, payment };
};

const subscribeToPlan = async (userId, planSlug, billingInterval = 'monthly') => {
  const plan = await getPlanBySlug(planSlug);
  const interval = billingInterval === 'yearly' ? 'yearly' : 'monthly';
  const subscription = await ensureSubscription(userId);

  if (plan.slug === FREE_PLAN_SLUG) {
    await subscription.update({
      planId: plan.id,
      status: 'active',
      billingInterval: interval,
      amount: 0,
      currency: plan.currency,
      paymentMethod: 'none',
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null
    });
    return { subscription, payment: null };
  }

  return activatePaidPlan(userId, subscription, plan, interval);
};

const cancelSubscription = async (userId) => {
  const subscription = await ensureSubscription(userId);

  if (!subscription.currentPeriodEnd) {
    throw new SubscriptionError('The Free plan cannot be canceled — there is nothing billed.');
  }
  if (subscription.cancelAtPeriodEnd) {
    throw new SubscriptionError('Subscription is already scheduled to cancel.');
  }

  await subscription.update({ cancelAtPeriodEnd: true, canceledAt: new Date() });
  return subscription;
};

const resumeSubscription = async (userId) => {
  const subscription = await ensureSubscription(userId);

  if (!subscription.cancelAtPeriodEnd) {
    throw new SubscriptionError('Subscription is not scheduled to cancel.');
  }

  await subscription.update({ cancelAtPeriodEnd: false, canceledAt: null });
  return subscription;
};

// Downgrade every lapsed paid subscription back to Free. Safe to call often.
const processExpiries = async () => {
  const lapsed = await Subscription.findAll({
    where: {
      status: { [Op.in]: ['active', 'past_due'] },
      currentPeriodEnd: { [Op.ne]: null, [Op.lt]: new Date() }
    }
  });

  if (lapsed.length === 0) return 0;

  const freePlan = await SubscriptionPlan.findOne({ where: { slug: FREE_PLAN_SLUG } });
  if (!freePlan) return 0;

  for (const subscription of lapsed) {
    await subscription.update({
      planId: freePlan.id,
      status: 'active',
      billingInterval: 'monthly',
      amount: 0,
      paymentMethod: 'none',
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null
    });
  }

  return lapsed.length;
};

const listPayments = async (userId) => {
  return Payment.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 50
  });
};

const listAllSubscriptions = async () => {
  const subscriptions = await Subscription.findAll({
    include: [
      { model: SubscriptionPlan, as: 'plan' },
      { model: Payment, as: 'invoices' }
    ],
    order: [['createdAt', 'DESC']],
    limit: 200
  });

  subscriptions.forEach((sub) => normalizePlan(sub.plan));
  return subscriptions;
};

export {
  SubscriptionError,
  ensureSubscription,
  getSubscriptionDetails,
  getUsageSummary,
  assertCanCreateMeeting,
  assertCanRecord,
  recordUsage,
  subscribeToPlan,
  cancelSubscription,
  resumeSubscription,
  processExpiries,
  listPayments,
  listAllSubscriptions
};
