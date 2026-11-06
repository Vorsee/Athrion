import { Icon } from '@iconify/react'
import { TRIAL_DAYS, PLANS, money } from '../lib/pricing.js'

// A Pro-only page: the upgrade card, then the page itself shown for real but faded and inert
// title names the outcome ("Get a plan built for your goal"), not the paywall
// perks: up to 3 short lines on what Pro gives on this page
// secondary: an optional { label, onClick } for a free step before paying
export default function ProLock({ title = 'Get more with Pro', description, perks = [], onUpgrade, secondary, children }) {
  return (
    <div className="space-y-5">
      {/* The card comes first, in the page flow, so no bar or heading ever covers it */}
      <div className="bg-overlay border border-neon-stroke/30 rounded-3xl p-6 max-[359px]:p-4 w-full max-w-md mx-auto"
        style={{ boxShadow: 'var(--sheet-shadow)' }}>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-neon bg-neon rounded-full px-2.5 py-1">
          <Icon icon="mdi:star-four-points-outline" width={14} aria-hidden="true" />ATHRION Pro
        </span>
        <h2 className="font-bold text-[1.625rem] leading-[1.15] tracking-tight text-ink mt-3">{title}</h2>
        {/* Narrow screens keep the perks and the price in view; the description is the part to drop */}
        {description && <p className={`text-ink-2 text-sm leading-relaxed mt-2 ${perks.length ? 'max-[359px]:hidden' : ''}`}>{description}</p>}
        {perks.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {perks.map(p => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
                <span className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-neon-tint border border-neon-stroke/30 flex items-center justify-center">
                  <Icon icon="mdi:check" width={13} className="text-neon-ink" aria-hidden="true" />
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-bold text-3xl text-ink tabular-nums tracking-tight">{money(PLANS.monthly.price)}</span>
          <span className="text-sm text-muted">a month, or {money(PLANS.annual.price)} a year</span>
        </div>
        <button onClick={onUpgrade}
          className="press mt-4 w-full min-h-[48px] px-4 bg-neon active:bg-neon-press text-on-neon font-semibold rounded-xl text-base">
          Get Pro
        </button>
        {secondary && (
          <button onClick={secondary.onClick}
            className="press w-full min-h-[44px] mt-2 text-sm font-semibold text-ink-2 hover:text-ink">
            {secondary.label}
          </button>
        )}
        <p className="text-xs text-muted mt-3 text-center">
          First time? {TRIAL_DAYS} days free, charged on day {TRIAL_DAYS + 1}. Cancel before then and you pay nothing.
        </p>
      </div>

      {/* Below it, the real page with the example, faded out toward the bottom and inert */}
      <div aria-hidden="true" inert="" className="pointer-events-none select-none opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]">
        {children}
      </div>
    </div>
  )
}
