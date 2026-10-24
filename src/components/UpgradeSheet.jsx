import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { Button } from './ui/index.js'
import { fetchTrialEligible } from '../lib/api.js'
import { PLANS, PRO_FEATURES, TRIAL_DAYS, annualPerMonth, annualSavingPct, money } from '../lib/pricing.js'

// Shown before Stripe: what Pro gives, which plan, and exactly when the first charge happens
export default function UpgradeSheet({ onClose, onCheckout, busy = false, error = '' }) {
  const [plan, setPlan] = useState('annual')
  const [trial, setTrial] = useState(true)

  useEffect(() => {
    let live = true
    fetchTrialEligible().then(ok => { if (live) setTrial(ok) })
    return () => { live = false }
  }, [])

  const chosen = PLANS[plan]
  const firstCharge = new Date(Date.now() + TRIAL_DAYS * 86400000)
    .toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  return (
    <Sheet title="ATHRION Pro" onClose={onClose}>
      <p className="text-ink-2 text-sm">
        {trial ? `Try everything free for ${TRIAL_DAYS} days.` : 'Everything in ATHRION, built around your goal.'}
      </p>

      <ul className="space-y-3">
        {PRO_FEATURES.map(f => (
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

      <div role="radiogroup" aria-label="Plan" className="space-y-2">
        <PlanOption selected={plan === 'annual'} onSelect={() => setPlan('annual')}
          title={`${PLANS.annual.label} · ${money(PLANS.annual.price)}`}
          detail={`${money(annualPerMonth)} a month, billed once a year`} tag={`Save ${annualSavingPct}%`} />
        <PlanOption selected={plan === 'monthly'} onSelect={() => setPlan('monthly')}
          title={`${PLANS.monthly.label} · ${money(PLANS.monthly.price)}`}
          detail="Billed every month" />
      </div>

      {error && <div role="alert" className="text-sm text-danger">{error}</div>}

      <div>
        <Button full onClick={() => onCheckout(plan)} disabled={busy}>
          {busy ? 'Opening secure checkout…' : trial ? `Start ${TRIAL_DAYS}-day free trial` : 'Continue to payment'}
        </Button>
        <p className="text-xs text-muted text-center mt-3">
          {trial
            ? `Free until ${firstCharge}, then ${money(chosen.price)} a ${chosen.per}. Cancel before then and you won't be charged.`
            : `${money(chosen.price)} a ${chosen.per}. Cancel anytime from your profile.`}
        </p>
        <p className="text-xs text-muted text-center mt-1">Workout logging, calorie logging and progress stay free.</p>
      </div>
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
