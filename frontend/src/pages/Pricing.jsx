import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, Check, Sparkles, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore } from '../store/subscriptionStore'

export default function Pricing() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const {
    plans,
    subscription,
    fetchPlans,
    fetchSubscription,
    subscribe,
    isLoading
  } = useSubscriptionStore()

  const [billingInterval, setBillingInterval] = useState('monthly')

  useEffect(() => {
    fetchPlans()
    if (isAuthenticated) fetchSubscription()
  }, [isAuthenticated])

  const currentPlanSlug = subscription?.plan?.slug

  const handleSubscribe = async (plan) => {
    if (!isAuthenticated) {
      navigate('/signup')
      return
    }

    const result = await subscribe(plan.slug, billingInterval)

    if (result.success) {
      toast.success(result.message)
      navigate('/billing')
    } else {
      toast.error(result.message)
    }
  }

  const priceFor = (plan) =>
    billingInterval === 'yearly' ? Number(plan.yearlyPrice) : Number(plan.monthlyPrice)

  const perMonthEquivalent = (plan) =>
    billingInterval === 'yearly' ? Number(plan.yearlyPrice) / 12 : Number(plan.monthlyPrice)

  return (
    <div className="min-h-screen bg-dark-100 aurora-bg noise text-white">
      {/* Animated aurora background */}
      <div className="blob -top-40 left-1/4 h-[30rem] w-[30rem] bg-primary-600/20 animate-aurora" />
      <div className="blob top-1/3 -right-32 h-96 w-96 bg-accent-600/15 animate-aurora-slow" />

      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-400/30 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-all duration-300 group-hover:scale-105">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight">MeetClone</span>
          </Link>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to="/billing" className="btn btn-ghost hidden sm:inline-flex">
                Billing
              </Link>
            ) : (
              <Link to="/login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
            )}
            <Link to={isAuthenticated ? '/app' : '/signup'} className="btn btn-primary">
              {isAuthenticated ? 'Open app' : 'Start free'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold text-primary-200 mb-6 animate-fade-in">
          <Sparkles className="h-4 w-4" />
          Pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold font-display leading-tight animate-fade-in-up">
          Plans that scale with <span className="gradient-text">your meetings</span>
        </h1>
        <p className="text-gray-400 mt-5 max-w-xl mx-auto animate-fade-in-up stagger-1">
          Start free, upgrade when you need recording, transcription, and bigger rooms.
          Cancel anytime — no hidden fees.
        </p>

        {/* Billing interval toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-full glass p-1 animate-fade-in-up stagger-2">
          {['monthly', 'yearly'].map((interval) => (
            <button
              key={interval}
              onClick={() => setBillingInterval(interval)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                billingInterval === interval
                  ? 'bg-gradient-to-r from-primary-500 to-accent-600 text-white shadow-lg shadow-primary-500/25'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {interval === 'monthly' ? 'Monthly' : 'Yearly'}
              {interval === 'yearly' && (
                <span className="ml-2 text-[11px] font-bold text-emerald-300">2 months free</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Plan cards */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {plans.map((plan, i) => {
            const isCurrent = isAuthenticated && currentPlanSlug === plan.slug
            const isPopular = plan.slug === 'pro'
            const isFree = Number(plan.monthlyPrice) === 0

            return (
              <div
                key={plan.slug}
                className={`relative rounded-3xl p-7 flex flex-col animate-fade-in-up stagger-${Math.min(i + 1, 6)} ${
                  isPopular
                    ? 'gradient-border bg-dark-200/60 shadow-glow'
                    : 'glass rounded-3xl'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-500 to-accent-600 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-primary-500/30">
                    MOST POPULAR
                  </span>
                )}

                <h3 className="text-lg font-semibold font-display">{plan.name}</h3>
                <p className="text-gray-400 text-sm mt-1.5 min-h-[40px]">{plan.description}</p>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-4xl font-bold font-display tracking-tight">
                    ${priceFor(plan).toFixed(0)}
                  </span>
                  <span className="text-sm text-gray-400 mb-1.5">
                    /{billingInterval === 'yearly' ? 'year' : 'month'}
                  </span>
                </div>
                {billingInterval === 'yearly' && !isFree && (
                  <p className="text-xs text-emerald-300 mt-1">
                    ${perMonthEquivalent(plan).toFixed(2)}/month billed annually
                  </p>
                )}

                <ul className="mt-6 space-y-3 flex-1">
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-200">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/15 border border-primary-500/30 shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-primary-300" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCurrent || isLoading}
                  className={`mt-7 w-full btn ${isPopular ? 'btn-primary' : 'btn-secondary'} justify-center ${
                    isCurrent ? 'opacity-60 cursor-default' : ''
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    'Current plan'
                  ) : isFree ? (
                    isAuthenticated ? 'Switch to Free' : 'Start for free'
                  ) : (
                    `Choose ${plan.name}`
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <p className="mt-10 flex items-center justify-center gap-2 text-sm text-gray-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Checkout is currently in demo mode — no real payment is processed.
        </p>
      </section>
    </div>
  )
}
