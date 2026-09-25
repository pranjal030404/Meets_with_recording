import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Video,
  CreditCard,
  CalendarDays,
  Loader2,
  ArrowUpRight,
  Ban,
  RotateCcw,
  Users,
  Clock,
  Video as VideoIcon,
  Receipt,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSubscriptionStore } from '../store/subscriptionStore'

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

function UsageMeter({ icon: Icon, label, used, limit, note }) {
  const unlimited = limit === -1 || limit === undefined
  const pct = unlimited ? 0 : Math.min(100, limit > 0 ? (used / limit) * 100 : 0)
  const barColor = pct >= 100 ? 'from-red-500 to-red-600' : pct >= 80 ? 'from-amber-400 to-orange-500' : 'from-primary-400 to-accent-600'

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/15 border border-primary-500/30">
            <Icon className="w-4.5 h-4.5 text-primary-300" />
          </span>
          <span className="text-sm font-medium text-gray-300">{label}</span>
        </div>
        <span className="text-sm font-semibold">
          {Number(used || 0).toLocaleString()}
          <span className="text-gray-400 font-normal"> / {unlimited ? '∞' : Number(limit).toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        {unlimited ? (
          <div className="h-full w-full bg-gradient-to-r from-emerald-400/40 to-emerald-500/20" />
        ) : (
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">{note || (unlimited ? 'Unlimited on your plan' : `${Math.max(0, limit - used)} remaining this period`)}</p>
    </div>
  )
}

export default function Billing() {
  const navigate = useNavigate()
  const {
    subscription,
    plan,
    usage,
    payments,
    isLoading,
    fetchSubscription,
    fetchPayments,
    cancel,
    resume
  } = useSubscriptionStore()

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSubscription()
    fetchPayments()
  }, [])

  const handleCancel = async () => {
    setBusy(true)
    const result = await cancel()
    setBusy(false)
    result.success ? toast.success(result.message) : toast.error(result.message)
  }

  const handleResume = async () => {
    setBusy(true)
    const result = await resume()
    setBusy(false)
    result.success ? toast.success(result.message) : toast.error(result.message)
  }

  if (isLoading && !plan) {
    return (
      <div className="min-h-screen bg-dark-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  const limits = plan?.limits || {}
  const isPaid = Number(plan?.monthlyPrice) > 0
  const interval = subscription?.billingInterval || 'monthly'
  const amount = Number(subscription?.amount || 0)

  return (
    <div className="min-h-screen bg-dark-100 aurora-bg noise text-white">
      <div className="blob -top-40 left-1/4 h-[30rem] w-[30rem] bg-primary-600/20 animate-aurora" />
      <div className="blob top-1/3 -right-32 h-96 w-96 bg-accent-600/15 animate-aurora-slow" />

      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-400/30 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/app" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-all duration-300 group-hover:scale-105">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight">MeetClone</span>
          </Link>
          <Link to="/pricing" className="btn btn-primary">
            Change plan
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Current plan */}
        <section className="gradient-border rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="blob -top-24 -right-24 h-72 w-72 bg-primary-600/15 animate-aurora" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Current plan</p>
              <h1 className="text-3xl font-bold font-display">{plan?.name || 'Free'}</h1>
              <p className="text-gray-400 mt-2">{plan?.description}</p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-sm">
                <span className="flex items-center gap-2 text-gray-300">
                  <CreditCard className="w-4 h-4 text-primary-300" />
                  {isPaid ? `$${amount.toFixed(0)} / ${interval === 'yearly' ? 'year' : 'month'}` : 'Free of charge'}
                </span>
                <span className="flex items-center gap-2 text-gray-300">
                  <CalendarDays className="w-4 h-4 text-primary-300" />
                  {isPaid
                    ? subscription?.cancelAtPeriodEnd
                      ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
                      : `Renews on ${formatDate(subscription.currentPeriodEnd)}`
                    : 'No billing period'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                    subscription?.cancelAtPeriodEnd
                      ? 'bg-amber-500/10 border-amber-400/25 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {subscription?.cancelAtPeriodEnd ? 'Canceling' : 'Active'}
                </span>
              </div>
            </div>

            {isPaid && (
              <div className="flex flex-col gap-2.5">
                {subscription?.cancelAtPeriodEnd ? (
                  <button onClick={handleResume} disabled={busy} className="btn btn-secondary">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Resume subscription
                  </button>
                ) : (
                  <button onClick={handleCancel} disabled={busy} className="btn btn-ghost">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                    Cancel subscription
                  </button>
                )}
                <p className="text-xs text-gray-500 max-w-[220px] text-right">
                  {subscription?.cancelAtPeriodEnd
                    ? 'Your plan stays active until the period ends, then moves to Free.'
                    : 'You keep access until the end of the paid period.'}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Usage this period */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-display">Usage this period</h2>
            <span className="text-xs text-gray-500">
              {formatDate(usage?.periodStart)} — {formatDate(usage?.periodEnd)}
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <UsageMeter icon={Users} label="Meetings created" used={usage?.meetingsCreated} limit={limits.meetingsPerMonth} />
            <UsageMeter
              icon={Clock}
              label="Meeting minutes"
              used={usage?.meetingMinutes}
              limit={-1}
              note={limits.meetingDurationMinutes === -1 ? 'No per-meeting length cap' : `Up to ${limits.meetingDurationMinutes} minutes per meeting`}
            />
            <UsageMeter icon={VideoIcon} label="Recording minutes" used={usage?.recordingMinutes} limit={limits.recordingMinutesPerMonth} />
          </div>
          {!limits.canRecord && (
            <p className="mt-3 text-sm text-amber-200/90">
              Recording and transcription are not included in the {plan?.name} plan — upgrade to unlock them.
            </p>
          )}
        </section>

        {/* Payment history */}
        <section>
          <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary-300" />
            Billing history
          </h2>
          {payments.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-gray-400 text-sm">
              No payments yet. {isPaid ? '' : 'You are on the Free plan.'}
            </div>
          ) : (
            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-white/10">
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Description</th>
                    <th className="px-5 py-3.5">Amount</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5 text-gray-300">{formatDate(payment.paidAt || payment.createdAt)}</td>
                      <td className="px-5 py-3.5">{payment.description}</td>
                      <td className="px-5 py-3.5 font-semibold">
                        ${Number(payment.amount).toFixed(2)} <span className="text-gray-500 font-normal">{payment.currency}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            payment.status === 'paid'
                              ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
                              : payment.status === 'failed'
                                ? 'bg-red-500/10 border-red-400/25 text-red-200'
                                : 'bg-white/5 border-white/10 text-gray-300'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
