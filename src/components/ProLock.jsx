import { Icon } from '@iconify/react'
import { TRIAL_DAYS, annualPerMonth, money } from '../lib/pricing.js'

// A Pro-only page shown for real but dimmed and inert, with an upgrade card kept in view
// title names the outcome ("Get a plan built for your goal"), not the paywall
// secondary: an optional { label, onClick } for a free step before paying
export default function ProLock({ title = 'Get more with Pro', description, onUpgrade, secondary, children }) {
  return (
    <div className="relative min-h-[70dvh]">
      <div aria-hidden="true" inert="" className="pointer-events-none select-none">
        {children}
      </div>

      <div className="absolute inset-0 bg-canvas/50 rounded-2xl" />
      <div className="absolute inset-0 px-4">
        <div className="sticky top-[calc(var(--header-h)+env(safe-area-inset-top)+4rem)] pt-16">
          <div className="bg-overlay border border-line rounded-2xl p-6 w-full max-w-sm mx-auto text-center"
            style={{ boxShadow: 'var(--sheet-shadow)' }}>
            <div className="w-14 h-14 rounded-2xl bg-neon-tint border border-neon-stroke/25 flex items-center justify-center mx-auto mb-4">
              <Icon icon="mdi:lock-outline" width={26} className="text-neon-ink" />
            </div>
            <h2 className="font-bold text-[1.625rem] leading-[1.15] text-ink mb-2">{title}</h2>
            <p className="text-ink-2 text-sm leading-relaxed mb-5">{description}</p>
            <button onClick={onUpgrade}
              className="press w-full h-12 bg-neon active:bg-neon-press text-on-neon font-semibold rounded-xl text-sm">
              Get Pro
            </button>
            {secondary && (
              <button onClick={secondary.onClick}
                className="press w-full min-h-[44px] mt-2 text-sm font-semibold text-ink-2 hover:text-ink">
                {secondary.label}
              </button>
            )}
            <div className="text-xs text-muted mt-3">{TRIAL_DAYS}-day free trial for new members, then from {money(annualPerMonth)} a month. Cancel anytime.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
