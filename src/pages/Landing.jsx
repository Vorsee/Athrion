import { Icon } from '@iconify/react'
import { Button } from '../components/ui/index.js'
import { PLANS, PRO_FEATURES, TRIAL_DAYS, annualSavingPct, money, priceLine } from '../lib/pricing.js'
import Brand from '../components/Brand.jsx'

const PAINS = [
  { icon: 'mdi:clipboard-text-outline', pain: "I don't know what to do today.",
    fix: 'Your plan lays out every session: exercises, sets and rest. Open it and start.' },
  { icon: 'mdi:scale-bathroom', pain: "My calories came from a formula and the scale isn't moving.",
    fix: 'After about 10 logged days and 3 weigh-ins, ATHRION estimates what you really burn and resets your target.' },
  { icon: 'mdi:swap-horizontal', pain: 'I pay for a workout app and a food app, and they never talk.',
    fix: 'Both live here. The weekly check-in adjusts training and food together.' },
  { icon: 'mdi:barcode-scan', pain: 'Logging food takes forever.',
    fix: 'Scan the barcode, type it in, or snap a photo for an estimate you can edit.' },
]

const STEPS = [
  ['Answer a few questions', 'Your goal, experience, how many days you train, and where.'],
  ['Get your plan and targets', 'A week of sessions plus daily calories and macros, in about 30 seconds.'],
  ['Log, check in, repeat', 'Log workouts and meals. Each week ATHRION adjusts the next one to how you did.'],
]

const FREE = ['Workout log with PRs and last-session numbers', 'Calorie and macro logging, barcode scanner', 'Progress: weight, measurements, photos', 'Train with friends, live standings', '3 saved workouts']

// The public page in front of sign-in: what ATHRION is, for whom, and what it costs
export default function Landing({ onCreateAccount, onSignIn }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm">
      <header className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Brand />
        <button onClick={onSignIn} className="press min-h-[44px] px-3 text-sm font-semibold text-ink-2 hover:text-ink">Sign in</button>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 pt-8 pb-16 grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <div>
            <h1 className="font-bold text-[2.5rem] xs:text-5xl leading-[1.05] tracking-tight">
              A training plan and calorie targets that adjust every week
            </h1>
            <p className="text-ink-2 text-base mt-5 max-w-md">
              Tell ATHRION your goal and schedule. It builds your sessions and daily calories,
              then updates both from your workouts, meals and weigh-ins.
            </p>
            <div className="mt-8 max-w-xs">
              <Button full onClick={onCreateAccount}>Create free account</Button>
            </div>
            <p className="text-xs text-muted mt-3">
              Free workout and calorie logging. Pro is {priceLine()}, with a {TRIAL_DAYS}-day free trial.
            </p>
          </div>
          <ProductPreview />
        </section>

        {/* Pains and fixes */}
        <section className="bg-surface border-y border-line">
          <div className="max-w-5xl mx-auto px-4 py-14">
            <h2 className="font-bold text-2xl xs:text-3xl leading-tight max-w-lg">Three apps, three subscriptions, and none of them talk</h2>
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 mt-10">
              {PAINS.map(p => (
                <div key={p.pain} className="flex gap-4">
                  <Icon icon={p.icon} width={24} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-ink">“{p.pain}”</div>
                    <p className="text-sm text-muted mt-1.5">{p.fix}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="font-bold text-2xl xs:text-3xl">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-6 mt-8">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex md:block gap-4">
                <div className="w-10 h-10 rounded-full bg-neon text-on-neon font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                <div className="md:mt-4">
                  <div className="font-semibold text-ink">{title}</div>
                  <p className="text-sm text-muted mt-1">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section className="max-w-5xl mx-auto px-4 pb-16" aria-labelledby="pricing">
          <h2 id="pricing" className="font-bold text-2xl xs:text-3xl">Free to start. Pro when you want the plan.</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <div className="bg-surface border border-line rounded-2xl p-6">
              <div className="font-semibold text-lg">Free</div>
              <div className="font-bold text-3xl mt-2">$0</div>
              <ul className="mt-5 space-y-2.5">
                {FREE.map(f => <Check key={f}>{f}</Check>)}
              </ul>
            </div>
            <div className="bg-surface border border-neon-stroke/40 rounded-2xl p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-lg">Pro</div>
                <span className="text-xs font-semibold text-on-neon bg-neon rounded-md px-2 py-0.5">{TRIAL_DAYS}-day free trial</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-3xl">{money(PLANS.monthly.price)}</span>
                <span className="text-sm text-muted">a month, or {money(PLANS.annual.price)} a year (save {annualSavingPct}%)</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                <Check>Everything in Free</Check>
                {PRO_FEATURES.map(f => <Check key={f.title}>{f.title}</Check>)}
              </ul>
              <p className="text-xs text-muted mt-5">Billed by Stripe after the trial. Cancel anytime from your profile.</p>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="bg-surface border-t border-line">
          <div className="max-w-5xl mx-auto px-4 py-14 text-center">
            <h2 className="font-bold text-2xl xs:text-3xl">Start with the free log. Add the plan when you're ready.</h2>
            <div className="mt-8 max-w-xs mx-auto">
              <Button full onClick={onCreateAccount}>Create free account</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>Your photos and logs are private to your account.</span>
        <span className="flex flex-wrap gap-x-4">
          <a href="/privacypolicy.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Privacy policy</a>
          <a href="/terms.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Terms of use</a>
          <a href="/privacypolicy.html#health-data" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Consumer health data</a>
        </span>
      </footer>
    </div>
  )
}

function Check({ children }) {
  return (
    <li className="flex gap-2.5 text-sm text-ink-2">
      <Icon icon="mdi:check" width={18} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

// A drawn example of the Today view, so the hero shows the product without screenshots
function ProductPreview() {
  const kcal = 1840, goal = 2600
  const r = 34, c = 2 * Math.PI * r
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[320px]">
      <div className="bg-surface border border-line rounded-[28px] p-4 space-y-3" style={{ boxShadow: 'var(--sheet-shadow)' }}>
        <div className="text-sm text-muted px-1">Good evening, Alex</div>
        <div className="bg-raised border border-line rounded-2xl p-4">
          <div className="text-xs text-neon-ink">Today's training</div>
          <div className="font-bold text-lg mt-1">Upper body · 45 min</div>
          {[['Bench press', '4 × 8', '+2.5 kg'], ['Bent-over row', '4 × 10', ''], ['Overhead press', '3 × 8', '']].map(([n, s, pr]) => (
            <div key={n} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0">
              <span className="text-ink-2">{n}</span>
              <span className="flex items-center gap-2">
                {pr && <span className="text-xs text-neon-ink">{pr}</span>}
                <span className="text-muted">{s}</span>
              </span>
            </div>
          ))}
          <div className="mt-3 h-10 rounded-xl bg-neon text-on-neon text-sm font-semibold flex items-center justify-center">Start workout</div>
        </div>
        <div className="bg-raised border border-line rounded-2xl p-4 flex items-center gap-4">
          <svg width="80" height="80" viewBox="0 0 80 80" className="flex-shrink-0">
            <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="8" />
            <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--neon))" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - kcal / goal)} transform="rotate(-90 40 40)" />
          </svg>
          <div>
            <div className="font-bold text-2xl leading-none">{goal - kcal}</div>
            <div className="text-xs text-muted mt-1">kcal left today</div>
            <div className="text-xs text-ink-2 mt-2">Target adjusted to your trend</div>
          </div>
        </div>
      </div>
    </div>
  )
}
