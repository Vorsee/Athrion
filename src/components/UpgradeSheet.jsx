import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { Button, Segmented } from './ui/index.js'
import { fetchTrialEligible } from '../lib/api.js'
import { PLANS, COACH_PLANS, PRO_FEATURES, COACH_FEATURES, COACH_PLAN_ON_SALE, TRIAL_DAYS, annualPerMonth, annualSavingPct, money } from '../lib/pricing.js'

// Shown before Stripe: what Pro (or the coach and club plan, 039) gives, which plan, and exactly
// when the first charge happens. Someone already subscribed switches in place (no new checkout).
// minor: an account under 16 (032) can't buy; the sheet says so and shows nothing to buy.
export default function UpgradeSheet({ onClose, onCheckout, busy = false, error = '', minor = false, initialKind = 'pro', isPro = false, coachPlan = false, switched = false }) {
  const offerCoach = COACH_PLAN_ON_SALE || coachPlan // not on sale: Pro only
  const [kind, setKind] = useState(initialKind === 'coach' && offerCoach ? 'coach' : 'pro')
  const [period, setPeriod] = useState('annual')
  const [trial, setTrial] = useState(true)

  useEffect(() => {
    let live = true
    fetchTrialEligible().then(ok => { if (live) setTrial(ok) })
    return () => { live = false }
  }, [])

  if (minor) return (
    <Sheet title="ATHRION Pro" onClose={onClose}>
      <p role="status" className="text-sm text-ink-2">Pro can't be bought on an account under 16. Everything free stays open to you: workouts, food logging, swims and runs.</p>
      <Button full variant="secondary" onClick={onClose}>Got it</Button>
    </Sheet>
  )

  const coach = kind === 'coach'
  const plans = coach ? COACH_PLANS : PLANS
  const annual = coach ? plans.coach_annual : plans.annual
  const monthly = coach ? plans.coach_monthly : plans.monthly
  const chosen = period === 'annual' ? annual : monthly
  const perMonth = Math.floor((annual.price / 12) * 100) / 100
  const saving = Math.round((1 - annual.price / (monthly.price * 12)) * 100)
  const features = coach ? COACH_FEATURES : PRO_FEATURES
  // Already paying: the subscription moves to the new price (prorated), no new trial
  const moving = isPro && !trial
  const already = coach ? coachPlan : isPro && !coachPlan
  const firstCharge = new Date(Date.now() + TRIAL_DAYS * 86400000)
    .toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  return (
    <Sheet title={coach ? 'Coach and club plan' : 'ATHRION Pro'} onClose={onClose}>
      {offerCoach && <Segmented kind="choice" label="Plan" scroll={false} options={[['pro', 'Pro'], ['coach', 'Coach and club']]} value={kind} onChange={setKind} />}
      <p className="text-ink-2 text-sm">
        {coach ? 'For trainers, coaches and anyone who runs a group. Members of your club and rooms stay free.'
          : trial ? `Try everything free for ${TRIAL_DAYS} days.` : 'Everything in ATHRION, built around your goal.'}
      </p>

      <ul className="space-y-3">
        {features.map(f => (
          <li key={f.title} className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-neon-tint border border-neon-stroke/25 flex items-center justify-center flex-shrink-0">
              <Icon icon={f.icon} width={18} className="text-neon-ink" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{f.title}</div>
              <div className="text-xs text-muted">{f.body}</div>
            </div>
          </li>
        ))}
      </ul>

      {switched ? (
        <p role="status" className="text-sm text-neon-ink bg-neon-tint rounded-xl p-3">Done: your subscription moved to the new plan. It shows here in a moment.</p>
      ) : already ? (
        <p role="status" className="text-sm text-ink-2 bg-raised rounded-xl p-3">{coach ? "You're on the coach and club plan." : "You're on Pro."} Manage it in You, then Subscription.</p>
      ) : (
      <>
      <div role="radiogroup" aria-label="Billing" className="space-y-2">
        <PlanOption selected={period === 'annual'} onSelect={() => setPeriod('annual')}
          title={`${annual.label} · ${money(annual.price)}`}
          detail={`${money(coach ? perMonth : annualPerMonth)} a month, billed once a year`} tag={`Save ${coach ? saving : annualSavingPct}%`} />
        <PlanOption selected={period === 'monthly'} onSelect={() => setPeriod('monthly')}
          title={`${monthly.label} · ${money(monthly.price)}`}
          detail="Billed every month" />
      </div>

      {error && <div role="alert" className="text-sm text-danger">{error}</div>}

      <div>
        <Button full onClick={() => onCheckout(chosen.id)} disabled={busy}>
          {busy ? (moving ? 'Switching…' : 'Opening secure checkout…') : moving ? `Switch to ${coach ? 'the coach plan' : 'Pro'}` : trial ? `Start ${TRIAL_DAYS}-day free trial` : 'Continue to payment'}
        </Button>
        <p className="text-xs text-muted text-center mt-3">
          {moving
            ? `Your subscription moves to ${money(chosen.price)} a ${chosen.per} straight away; the difference for the rest of this period is worked out by the day on your next bill.`
            : trial
            ? `Free until ${firstCharge}, then ${money(chosen.price)} a ${chosen.per}, renewing automatically until you cancel. Cancel before then and you won't be charged.`
            : `${money(chosen.price)} a ${chosen.per}, renewing automatically until you cancel. Cancel anytime from your profile.`}
        </p>
        <p className="text-xs text-muted text-center mt-1">
          By continuing you agree to the <a href="/terms.html" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink-2">Terms of use</a>.
        </p>
        <p className="text-xs text-muted text-center mt-1">Workout logging, calorie logging and progress stay free.</p>
      </div>
      </>
      )}
    </Sheet>
  )
}

function PlanOption({ selected, onSelect, title, detail, tag }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={`press w-full flex items-center gap-3 text-left rounded-xl border px-4 py-3 min-h-[56px] transition-colors
        ${selected ? 'border-neon-stroke bg-neon-tint' : 'border-line bg-raised'}`}>
      <Icon icon={selected ? 'mdi:radiobox-marked' : 'mdi:radiobox-blank'} width={20}
        className={selected ? 'text-neon-ink' : 'text-muted'} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
      {tag && <span className="text-xs font-semibold text-on-neon bg-neon rounded-md px-2 py-0.5 flex-shrink-0">{tag}</span>}
    </button>
  )
}
