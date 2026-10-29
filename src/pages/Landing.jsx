import { Icon } from '@iconify/react'
import { LandingReviews } from '../components/Reviews.jsx'
import { Button } from '../components/ui/index.js'
import { PLANS, PRO_FEATURES, TRIAL_DAYS, money } from '../lib/pricing.js'
import Brand from '../components/Brand.jsx'

// The three things ATHRION does
const PILLARS = [
  { icon: 'mdi:dumbbell', title: 'Train',
    body: 'Get a weekly plan built for your goal, schedule and equipment. Log every set in seconds and see your last numbers and PRs as you lift. The plan adapts each week from how you trained.',
    tags: ['Weekly plan', 'Set logging', 'PRs', 'Train with friends'] },
  { icon: 'mdi:food-apple-outline', title: 'Eat',
    body: 'Daily calories and protein worked out from your body and your goal. Follow a ready meal plan in grams, or log food by barcode, by hand or from a photo.',
    tags: ['Calorie targets', 'Meal plan', 'Barcode', 'Photo logging'] },
  { icon: 'mdi:chart-line', title: 'Progress',
    body: 'Set a target weight and a date. A progress ring shows how far you are, whether you are on track, and every weigh-in and workout along the way.',
    tags: ['Goal ring', 'Target date', 'Weight chart', 'Timeline'] },
]

const FREE = ['Workout log with PRs', 'Calorie logging and barcode scanner', 'Progress and weight tracking', 'Swim log and teams', 'Train with friends']

// The public page in front of sign-in: what ATHRION is and what it costs
export default function Landing({ onCreateAccount, onSignIn, onWriteReview }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm pt-safe pb-safe">
      <header className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Brand />
        <button onClick={onSignIn} className="press min-h-[44px] px-4 rounded-xl border border-line-strong text-sm font-semibold text-ink hover:border-muted/50">Sign in</button>
      </header>

      <main>
        {/* Hero: three words */}
        <section className="max-w-5xl mx-auto px-4 pt-10 pb-20 grid md:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <h1 className="font-bold text-[3.5rem] xs:text-7xl md:text-8xl leading-[0.95] tracking-tight text-left">
              <span className="block">Train.</span>
              <span className="block">Eat.</span>
              <span className="block text-neon-ink">Progress.</span>
            </h1>
            <div className="mt-10 max-w-xs mx-auto">
              <Button full onClick={onCreateAccount}>Create free account</Button>
            </div>
          </div>
          <ProductPreview />
        </section>

        {/* Pillars */}
        <section className="bg-surface border-y border-line">
          <div className="max-w-5xl mx-auto px-4 py-16 grid gap-14 md:gap-8 md:grid-cols-3">
            {PILLARS.map(p => (
              <div key={p.title} className="flex flex-col items-center text-center">
                <span className="w-16 h-16 rounded-2xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center">
                  <Icon icon={p.icon} width={32} className="text-neon-ink" aria-hidden="true" />
                </span>
                <h2 className="font-bold text-3xl mt-4">{p.title}</h2>
                <p className="text-ink-2 mt-3 max-w-sm">{p.body}</p>
                <ul className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {p.tags.map(t => <li key={t} className="text-xs font-semibold text-neon-ink border border-neon-stroke/30 rounded-md px-2 py-1">{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Swim */}
        <section className="max-w-5xl mx-auto px-4 py-14" aria-labelledby="swim">
          <div className="flex flex-wrap items-center gap-4">
            <Icon icon="mdi:swim" width={36} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
            <div className="grow basis-0 min-w-[14rem]">
              <h2 id="swim" className="font-bold text-2xl">Swim teams</h2>
              <p className="text-ink-2 mt-1">Every stroke, every PR. Coaches see their whole team.</p>
            </div>
            <Button variant="secondary" icon="mdi:swim" onClick={onCreateAccount} className="w-full sm:w-auto">Start swimming</Button>
          </div>
        </section>

        <LandingReviews onWrite={onWriteReview ?? onSignIn} />

        {/* Pricing */}
        <section className="max-w-5xl mx-auto px-4 pb-16" aria-labelledby="pricing">
          <h2 id="pricing" className="font-bold text-3xl">Pricing</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
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
                <span className="text-sm text-muted">a month, or {money(PLANS.annual.price)} a year</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                <Check>Everything in Free</Check>
                {PRO_FEATURES.map(f => <Check key={f.title}>{f.title}</Check>)}
              </ul>
              <p className="text-xs text-muted mt-5">Cancel anytime.</p>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="bg-surface border-t border-line">
          <div className="max-w-5xl mx-auto px-4 py-14 flex flex-wrap items-center justify-between gap-6">
            <h2 className="font-bold text-3xl">Start today.</h2>
            <div className="w-full max-w-xs">
              <Button full onClick={onCreateAccount}>Create free account</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 flex flex-wrap gap-x-4 text-xs text-muted">
        <a href="/privacypolicy.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Privacy policy</a>
        <a href="/terms.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Terms of use</a>
        <a href="/privacypolicy.html#health-data" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Consumer health data</a>
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
          </div>
        </div>
      </div>
    </div>
  )
}
