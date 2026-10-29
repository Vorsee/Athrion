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
        {/* Hero: three words, centered, with one card for each underneath */}
        <section className="max-w-5xl mx-auto px-4 pt-12 pb-20 text-center">
          <h1 className="font-bold text-[3.25rem] xs:text-7xl lg:text-8xl leading-[0.95] tracking-tight">
            <span className="block md:inline">Train. </span>
            <span className="block md:inline">Eat. </span>
            <span className="block md:inline text-neon-ink">Progress.</span>
          </h1>
          <div className="mt-10 max-w-xs mx-auto">
            <Button full onClick={onCreateAccount}>Create free account</Button>
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

// Drawn examples of the app, one per headline word, so the hero shows the product without screenshots
function ProductPreview() {
  const ring = (pct, size = 76, stroke = 8) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--neon))" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
    )
  }
  const card = 'bg-surface border border-line rounded-3xl p-5 text-left'
  return (
    <div aria-hidden="true" className="mt-14 grid gap-4 md:grid-cols-3 max-w-sm md:max-w-none mx-auto">
      <div className={card}>
        <div className="text-xs font-semibold text-neon-ink">Train</div>
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
      </div>
      <div className={card}>
        <div className="text-xs font-semibold text-neon-ink">Eat</div>
        <div className="flex items-center gap-4 mt-2">
          {ring(1840 / 2600)}
          <div>
            <div className="font-bold text-2xl leading-none">760</div>
            <div className="text-xs text-muted mt-1">kcal left today</div>
          </div>
        </div>
        <div className="mt-3 text-sm flex justify-between border-t border-line pt-2"><span className="text-ink-2">Lunch · chicken, rice</span><span className="text-muted">640 kcal</span></div>
      </div>
      <div className={card}>
        <div className="text-xs font-semibold text-neon-ink">Progress</div>
        <div className="flex items-center gap-4 mt-2">
          <div className="relative">
            {ring(0.36)}
            <span className="absolute inset-0 flex items-center justify-center font-bold text-base">36%</span>
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Lose 16 lb</div>
            <div className="text-xs text-muted mt-1">71 days left · on track</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {['done', 'missed', 'done', 'today', 'plan', 'rest', 'rest'].map((d, i) => (
            <span key={i} className={`h-2 rounded-full ${d === 'done' ? 'bg-neon' : d === 'missed' ? 'bg-danger/40' : d === 'today' || d === 'plan' ? 'bg-neon/30' : 'bg-line'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
