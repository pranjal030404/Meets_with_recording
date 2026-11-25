import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, Check, Sparkles, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore } from '../store/subscriptionStore'
import branding from '../config/branding'
import BrandMark from '../components/BrandMark'

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
    <div className="min-h-screen bg-dark-100 text-white">

      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <BrandMark />
            <span className="text-xl font-semibold font-display">{branding.appName}</span>
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
<h1 className="text-4xl sm:text-5xl font-semibold font-display leading-tight">
          Plans and pricing
        </h1>
        <p className="text-gray-400 mt-5 max-w-xl mx-auto">
          Start free, upgrade when you need recording, transcription, and bigger rooms.
          Cancel anytime.
        </p>

        {/* Billing interval toggle */}
        <div className="mt-8 tabs">
          {['monthly', 'yearly'].map((interval) => (
            <button
              key={interval}
              onClick={() => setBillingInterval(interval)}
              className={`tab ${
                billingInterval === interval
                  ? 'tab-active'
                  : ''
              }`}
            >
              {interval === 'monthly' ? 'Monthly' : 'Yearly'}
              {interval === 'yearly' && (
                <span className="ml-2 text-[11px] font-semibold text-emerald-300">2 months free</span>
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
                className={`relative rounded-2xl p-7 flex flex-col ${
                  isPopular
                    ? 'card !border-primary-500/60'
                    : 'card'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-4 py-1 text-xs font-semibold text-ink">
                    Most popular
                  </span>
                )}

                <h3 className="text-lg font-semibold font-display">{plan.name}</h3>
                <p className="text-gray-400 text-sm mt-1.5 min-h-[40px]">{plan.description}</p>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-4xl font-semibold font-display">
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
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.5} />
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
          Checkout is in demo mode. No real payment is processed.
        </p>
      </section>
    </div>
  )
}
