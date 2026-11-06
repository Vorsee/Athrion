import { Icon } from '@iconify/react'
import { LandingReviews } from '../components/Reviews.jsx'
import { Button } from '../components/ui/index.js'
import { PLANS, PRO_FEATURES, TRIAL_DAYS, FREE_WORKOUT_LIMIT, money, annualPerMonth, annualSavingPct } from '../lib/pricing.js'
import Brand from '../components/Brand.jsx'
import FriendsWorkoutDemo from '../components/FriendsWorkoutDemo.jsx'
import { SwimDemo, RunDemo } from '../components/CardioDemo.jsx'
import { PlanDemo, ScanDemo } from '../components/PlanScanDemo.jsx'

// The three things ATHRION does
const PILLARS = [
  { icon: 'mdi:dumbbell', title: 'Train',
    body: 'Get a weekly plan built for your goal, your days and where you train. Log every set in seconds and see your last numbers and PRs as you lift. The plan adapts each week from how you trained.',
    tags: ['Weekly plan', 'Set logging', 'PRs', 'Train with friends'] },
  { icon: 'mdi:food-apple-outline', title: 'Eat',
    body: 'Daily calories and protein worked out from your body and your goal. Follow a ready meal plan in grams, or log food by barcode, by hand or from a photo.',
    tags: ['Calorie targets', 'Meal plan', 'Barcode', 'Photo logging'] },
  { icon: 'mdi:chart-line', title: 'Progress',
    body: 'Set a target weight and a date. A progress ring shows how far you are, whether you are on track, and every weigh-in and workout along the way.',
    tags: ['Goal ring', 'Target date', 'Weight chart', 'Timeline'] },
]

const FREE = ['A starter workout for your goal', 'Workout log with PRs', 'Calorie logging, barcode and a food library', 'Progress and weight tracking', 'Swim and run logs, swim teams', 'Train with friends and the monthly leaderboard']

// The public page in front of sign-in: what ATHRION is and what it costs
export default function Landing({ onCreateAccount, onSignIn }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm pt-safe pb-safe overflow-x-clip">
      <header className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Brand />
        <nav aria-label="On this page" className="ml-auto mr-2 hidden sm:flex items-center">
          {[['#pricing', 'Pricing'], ['#questions', 'Questions']].map(([href, label]) => (
            <a key={href} href={href} className="min-h-[44px] px-3 inline-flex items-center text-sm font-semibold text-ink-2 hover:text-ink">{label}</a>
          ))}
        </nav>
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
          <p className="mt-7 text-lg xs:text-xl text-ink-2 max-w-xl mx-auto">
            A personal trainer that plans your week, a workout and calorie log, and swim and run tracking. In one app, free to start.
          </p>
          <div className="mt-8 max-w-xs mx-auto">
            <Button full onClick={onCreateAccount}>Create free account</Button>
            <p className="text-sm text-muted mt-3">No card needed. Pro is optional, with a {TRIAL_DAYS}-day free trial.</p>
          </div>
          <TrainTogether />
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

        <PlanAndScan onStart={onCreateAccount} />

        {/* Pricing */}
        <section id="pricing" className="max-w-5xl mx-auto px-4 pb-20 scroll-mt-4" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight">Free to start. <span className="text-neon-ink">Pro</span> when you want more.</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <div className="bg-surface border border-line rounded-2xl p-6">
              <div className="font-semibold text-lg">Free</div>
              <div className="font-bold text-3xl mt-2">$0</div>
              <div className="text-sm text-muted mt-1">Forever, no card.</div>
              <ul className="mt-5 space-y-2.5">
                {FREE.map(f => <Check key={f}>{f}</Check>)}
              </ul>
              <p className="text-xs text-muted mt-5">Free accounts save up to {FREE_WORKOUT_LIMIT} workouts and get one photo scan a day.</p>
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
              <div className="text-sm text-neon-ink font-semibold mt-1">Yearly works out at {money(annualPerMonth)} a month, {annualSavingPct}% less.</div>
              <ul className="mt-5 space-y-2.5">
                <Check>Everything in Free</Check>
                {PRO_FEATURES.map(f => <Check key={f.title}>{f.title}</Check>)}
              </ul>
              <p className="text-xs text-muted mt-5">
                Free for {TRIAL_DAYS} days, then {money(PLANS.monthly.price)} a month (or {money(PLANS.annual.price)} a year) starting on day {TRIAL_DAYS + 1}.
                Cancel before then and you pay nothing. The trial is for first-time subscribers.
              </p>
              <Button full onClick={onCreateAccount} className="mt-5">Start free, try Pro later</Button>
            </div>
          </div>
        </section>

        {/* Swim and run */}
        <SwimAndRun onStart={onCreateAccount} />

        <LandingReviews />

        <InstallAndTrust />

        <Faq />

        {/* Closing */}
        <section className="bg-surface border-t border-line">
          <div className="max-w-5xl mx-auto px-4 py-14 flex flex-wrap items-center justify-between gap-6">
            <h2 className="font-bold text-3xl">Your first workout is free.</h2>
            <div className="w-full max-w-xs">
              <Button full onClick={onCreateAccount}>Create free account</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 flex flex-wrap gap-x-4 text-xs text-muted">
        <a href="/privacypolicy.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Privacy policy</a>
        <a href="/terms.html" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Terms of use</a>
        <a href="mailto:athrionsportapp@gmail.com" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">athrionsportapp@gmail.com</a>
        <a href="/privacypolicy.html#health-data" className="underline underline-offset-2 hover:text-ink-2 min-h-[44px] inline-flex items-center">Consumer health data</a>
      </footer>
    </div>
  )
}

const TOGETHER_STEPS = [
  ['mdi:door-open', 'Open a room'],
  ['mdi:link-variant', 'Send the link'],
  ['mdi:account-group-outline', 'Lift together, live'],
]

// Right under the hero's button: working out with friends, told big and shown as a live room
function TrainTogether() {
  return (
    <section className="mt-24 grid gap-14 md:gap-10 md:grid-cols-2 md:items-center md:text-left" aria-labelledby="together">
      <div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-3 py-1">
          <Icon icon="mdi:account-group-outline" width={18} aria-hidden="true" />Free with every account
        </span>
        <h2 id="together" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight mt-4">
          Train with <span className="text-neon-ink">friends</span>.
        </h2>
        <p className="text-lg text-ink-2 mt-4 max-w-md mx-auto md:mx-0">
          One workout, everyone in it. Every set your friends finish shows up live.
        </p>
        <ul className="mt-6 space-y-3 max-w-xs mx-auto md:mx-0 text-left">
          {TOGETHER_STEPS.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center flex-shrink-0">
                <Icon icon={icon} width={22} className="text-neon-ink" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-ink">{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted mt-7 max-w-md mx-auto md:mx-0">
          Plus a monthly leaderboard with your friends and everyone. The top 3 win a free month of Pro.
        </p>
      </div>
      <FriendsWorkoutDemo />
    </section>
  )
}

const CARDIO = [
  { id: 'swim', icon: 'mdi:swim', title: 'Swim', Demo: SwimDemo, cta: 'Start swimming',
    body: 'Log a swim or a whole interval set by stroke. Your best pace for every stroke, and every PR, as you get faster.',
    points: ['Pace and PRs for each stroke', 'Interval sets like 10 × 100 on 1:50', 'Teams: your coach posts the practice, you log it'] },
  { id: 'run', icon: 'mdi:run', title: 'Run', Demo: RunDemo, cta: 'Start running',
    body: 'Log the distance and the time, and see your week: how far, how fast, and your longest run.',
    points: ['Weekly distance, best pace, a pace chart', 'Runs count as training days', 'Your plan is built around your runs'] },
]

// Swim and run, each told in a few words and shown moving
function SwimAndRun({ onStart }) {
  return (
    <section className="max-w-5xl mx-auto px-4 py-20" aria-labelledby="cardio">
      <div className="text-center">
        <h2 id="cardio" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight">
          Swim and <span className="text-neon-ink">run</span>.
        </h2>
        <p className="text-lg text-ink-2 mt-4 max-w-lg mx-auto">Every length and every kilometre, logged in seconds. Watch your pace drop week by week.</p>
      </div>
      <div className="mt-12 grid gap-14 md:gap-8 md:grid-cols-2">
        {CARDIO.map(({ id, icon, title, Demo, cta, body, points }) => (
          <div key={id} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center flex-shrink-0">
                <Icon icon={icon} width={26} className="text-neon-ink" aria-hidden="true" />
              </span>
              <h3 className="font-bold text-3xl">{title}</h3>
            </div>
            <p className="text-lg text-ink-2 mt-3">{body}</p>
            <ul className="mt-4 space-y-2">
              {points.map(p => <Check key={p}>{p}</Check>)}
            </ul>
            <div className="mt-6 grow"><Demo /></div>
            <Button variant="secondary" icon={icon} onClick={() => onStart(id)} className="mt-5 w-full">{cta}</Button>
          </div>
        ))}
      </div>
    </section>
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
        {[['Bench press', '4 × 8', '+5 lb'], ['Bent-over row', '4 × 10', ''], ['Overhead press', '3 × 8', '']].map(([n, s, pr]) => (
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

// The Pro side, shown: the plan day that coaches you and the photo scan you can correct
const SHOWCASE = [
  { icon: 'mdi:calendar-check-outline', title: 'A plan that moves with you.', Demo: PlanDemo,
    body: 'A target on every exercise for next time. Missed a day? It moves to your next free one. Every fifth week is lighter, and each Sunday you get a short review of what went well and what to change.' },
  { icon: 'mdi:camera-outline', title: 'Snap your plate.', Demo: ScanDemo,
    body: 'Take a photo of your meal and get calories and macros in seconds. Weighed something? Tap the pencil, change the grams, and everything updates. Free accounts get one scan a day.' },
]

function PlanAndScan({ onStart }) {
  return (
    <section className="max-w-5xl mx-auto px-4 py-20" aria-labelledby="showcase">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-3 py-1">
          <Icon icon="mdi:star-four-points-outline" width={18} aria-hidden="true" />ATHRION Pro
        </span>
        <h2 id="showcase" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight mt-4">
          A coach in your <span className="text-neon-ink">pocket</span>.
        </h2>
      </div>
      <div className="mt-12 grid gap-14 md:gap-8 md:grid-cols-2">
        {SHOWCASE.map(({ icon, title, body, Demo }) => (
          <div key={title} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center flex-shrink-0">
                <Icon icon={icon} width={26} className="text-neon-ink" aria-hidden="true" />
              </span>
              <h3 className="font-bold text-2xl xs:text-3xl leading-tight">{title}</h3>
            </div>
            <p className="text-lg text-ink-2 mt-3">{body}</p>
            <div className="mt-6 grow"><Demo /></div>
          </div>
        ))}
      </div>
      <div className="mt-10 max-w-xs mx-auto">
        <Button full variant="secondary" onClick={onStart}>Start free</Button>
      </div>
    </section>
  )
}

const TRUST = [
  ['mdi:eye-off-outline', 'No third-party trackers'],
  ['mdi:download-outline', 'Download or delete your data'],
  ['mdi:import', 'Import from Strong or Hevy'],
  ['mdi:account-check-outline', 'Ages 16 and up'],
]
const INSTALL = [
  ['iPhone', 'mdi:apple-ios', 'Open athrion.app in Safari, tap Share, then Add to Home Screen.'],
  ['Android', 'mdi:android', 'Open athrion.app in Chrome and tap Install, or the menu, then Add to Home screen.'],
]

// It's a web app: how to keep it on the home screen, said plainly, and why it's safe to try
function InstallAndTrust() {
  return (
    <section className="bg-surface border-y border-line" aria-labelledby="install">
      <div className="max-w-5xl mx-auto px-4 py-16 grid gap-12 md:grid-cols-2 md:items-center">
        <div>
          <h2 id="install" className="font-bold text-3xl xs:text-4xl leading-tight tracking-tight">Add ATHRION to your <span className="text-neon-ink">home screen</span>.</h2>
          <p className="text-ink-2 mt-3">No app store needed. It opens full screen like any app, and a workout logged without signal saves when you are back online. App store versions are not out yet.</p>
          <ul className="mt-6 space-y-3">
            {INSTALL.map(([os, icon, how]) => (
              <li key={os} className="flex items-start gap-3 bg-raised rounded-2xl p-4">
                <Icon icon={icon} width={24} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div><div className="font-semibold text-ink">{os}</div><div className="text-sm text-ink-2 mt-0.5">{how}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }} aria-label="Your data">
          {TRUST.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-3 border border-line rounded-2xl p-4">
              <span className="w-10 h-10 rounded-xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center flex-shrink-0">
                <Icon icon={icon} width={22} className="text-neon-ink" aria-hidden="true" />
              </span>
              <span className="font-semibold text-ink">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export const FAQ = [
  ['Is it really free?', `Yes. The workout log, a starter workout for your goal, calorie logging with barcode and the food library, progress and weight tracking, swim and run logs, swim teams and training with friends are free. Pro adds the coaching plan, the AI meal plan, calorie targets that follow your weight, unlimited photo scans and unlimited saved workouts.`],
  ['Do I need a gym?', 'No. Tell ATHRION where you train, at a gym, at home or outdoors, and your workouts are built for it.'],
  ['Is there an app?', 'ATHRION runs in your phone\'s browser and adds to your home screen like an app. App Store and Google Play versions are not out yet.'],
  ['Can I cancel Pro?', `Yes, any time in the app. Cancel during the ${TRIAL_DAYS}-day trial and you pay nothing. The trial is for first-time subscribers.`],
  ['Can I bring my history from Strong or Hevy?', 'Yes. Export a CSV from Strong or Hevy, then in ATHRION open You, then Your data, and import it.'],
  ['What happens to my data?', 'It is used to run the app and build your plan, never sold, and there are no third-party trackers. You can download all of it or delete your account in the app.'],
]

function Faq() {
  return (
    <section id="questions" className="max-w-3xl mx-auto px-4 py-20 scroll-mt-4" aria-labelledby="questions-title">
      <h2 id="questions-title" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight">Questions</h2>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="press list-none cursor-pointer min-h-[56px] py-4 flex items-center justify-between gap-4 font-semibold text-lg text-ink [&::-webkit-details-marker]:hidden">
              {q}
              <Icon icon="mdi:plus" width={22} className="text-neon-ink flex-shrink-0 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
            </summary>
            <p className="pb-5 text-ink-2 fade-in">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
