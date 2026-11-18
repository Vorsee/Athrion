import { Icon } from '@iconify/react'
import { LandingReviews } from '../components/Reviews.jsx'
import { Button } from '../components/ui/index.js'
import { PLANS, COACH_PLANS, PRO_FEATURES, COACH_FEATURES, COACH_ROOM_SIZE, COACH_PLAN_ON_SALE, TRIAL_DAYS, FREE_WORKOUT_LIMIT, money, annualPerMonth, annualSavingPct } from '../lib/pricing.js'
import { ROOM_SIZE } from '../lib/groupApi.js'
import { POINT_RULES, LEVELS, PRIZE_PLACES } from '../lib/points.js'
import Brand from '../components/Brand.jsx'
import FriendsWorkoutDemo from '../components/FriendsWorkoutDemo.jsx'
import LeaderboardDemo from '../components/LeaderboardDemo.jsx'
import { SwimDemo, RunDemo } from '../components/CardioDemo.jsx'
import { PlanDemo, ScanDemo } from '../components/PlanScanDemo.jsx'
import ThemeDemo from '../components/ThemeDemo.jsx'
import { ChristmasLights } from '../components/Festive.jsx'

const FREE = ['Live rooms with your friends', 'Friends and the monthly leaderboard', 'A starter workout for your goal', 'Workout log with PRs', 'Calorie logging, barcode and a food library', 'Progress and weight tracking', 'Swim and run logs, swim teams']

// The public page in front of sign-in: what ATHRION is and what it costs
export default function Landing({ onCreateAccount, onSignIn }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm pt-safe pb-safe overflow-x-clip">
      <header className="relative max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <ChristmasLights className="top-full" />
        <Brand />
        <nav aria-label="On this page" className="ml-auto mr-2 hidden sm:flex items-center">
          {[['#how', 'How it works'], ['#pricing', 'Pricing'], ['#questions', 'Questions']].map(([href, label]) => (
            <a key={href} href={href} className="min-h-[44px] px-3 inline-flex items-center text-sm font-semibold text-ink-2 hover:text-ink">{label}</a>
          ))}
        </nav>
        <button onClick={onSignIn} className="press min-h-[44px] px-4 rounded-xl border border-line-strong text-sm font-semibold text-ink hover:border-muted/50">Sign in</button>
      </header>

      <main>
        {/* Hero: working out together, shown as a live room */}
        <section className="max-w-5xl mx-auto px-4 pt-10 pb-20 grid gap-12 md:gap-10 md:grid-cols-2 md:items-center text-center md:text-left">
          <div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-3 py-1">
              <Icon icon="mdi:account-group-outline" width={18} aria-hidden="true" />Rooms, friends and the board are free
            </span>
            <h1 className="font-bold text-[3rem] xs:text-6xl lg:text-7xl leading-[0.98] tracking-tight mt-5">
              Train with your <span className="text-neon-ink">friends</span>.
            </h1>
            <p className="mt-6 text-lg xs:text-xl text-ink-2 max-w-md mx-auto md:mx-0">
              Open a room, send the code, and watch every set your friends finish, live. Same gym or different cities.
            </p>
            <div className="mt-8 max-w-xs mx-auto md:mx-0">
              <Button full onClick={onCreateAccount}>Create free account</Button>
              <p className="text-sm text-muted mt-3">No card needed. Your friends don't need Pro to train with you.</p>
            </div>
          </div>
          <FriendsWorkoutDemo />
        </section>

        <HowItWorks />

        <TrainTogether />

        <Crew />

        <PlanAndScan onStart={onCreateAccount} />

        <Themes />

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
              <p className="text-xs text-muted mt-5">Free accounts save up to {FREE_WORKOUT_LIMIT} workouts and get one photo scan a day. Open as many rooms as you like, up to {ROOM_SIZE} people in each, and add as many friends.</p>
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
          {/* The coach and club plan (039): for whoever runs the group, once it's on sale */}
          {COACH_PLAN_ON_SALE && <div className="bg-surface border border-line rounded-2xl p-6 mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="font-semibold text-lg">Coach and club</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-2xl">{money(COACH_PLANS.coach_monthly.price)}</span>
                <span className="text-sm text-muted">a month, or {money(COACH_PLANS.coach_annual.price)} a year</span>
              </div>
            </div>
            <p className="text-sm text-ink-2 mt-2">For trainers, coaches and anyone who runs a group. The people in your club and rooms stay free.</p>
            <ul className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}>
              {COACH_FEATURES.map(f => <Check key={f.title}>{f.title}</Check>)}
            </ul>
            <p className="text-xs text-muted mt-4">The same {TRIAL_DAYS}-day free trial for first-time subscribers. Already on Pro? Switch in You, then Coaching; you pay the difference by the day.</p>
          </div>}
        </section>

        {/* Swim and run */}
        <SwimAndRun onStart={onCreateAccount} />

        <LandingReviews />

        <InstallAndTrust />

        <Faq />

        {/* Closing */}
        <section className="bg-surface border-t border-line">
          <div className="max-w-5xl mx-auto px-4 py-14 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="font-bold text-3xl">Bring a friend to your next workout.</h2>
              <p className="text-ink-2 mt-2">Free for both of you. Takes a minute to start.</p>
            </div>
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

const STEPS = [
  { icon: 'mdi:account-plus-outline', title: 'Add your friends',
    body: 'Pick a nickname and send your link. Friends who open it can add you in one tap.', Visual: InviteVisual },
  { icon: 'mdi:door-open', title: 'Open a room',
    body: 'Plan the exercises set by set, or make it a free workout where everyone picks their own. Share the six-letter code.', Visual: RoomVisual },
  { icon: 'mdi:lightning-bolt-outline', title: 'Train live',
    body: 'Each on your own phone, every set shows up for everyone as it lands. Training together earns extra points.', Visual: FeedVisual },
]

// Three steps from sign-up to a shared workout, each with a small drawn piece of the app
function HowItWorks() {
  return (
    <section id="how" className="max-w-5xl mx-auto px-4 pb-20 scroll-mt-4" aria-labelledby="how-title">
      <h2 id="how-title" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight text-center">
        Three steps to a <span className="text-neon-ink">shared</span> workout.
      </h2>
      <ol className="mt-12 grid gap-10 md:gap-6 md:grid-cols-3">
        {STEPS.map(({ icon, title, body, Visual }, i) => (
          <li key={title} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-neon text-on-neon font-bold text-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">{i + 1}</span>
              <h3 className="font-bold text-2xl leading-tight">{title}</h3>
              <Icon icon={icon} width={24} className="text-neon-ink ml-auto flex-shrink-0" aria-hidden="true" />
            </div>
            <p className="text-ink-2 mt-3">{body}</p>
            <div className="mt-5 grow flex"><Visual /></div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function VisualCard({ children }) {
  return <div aria-hidden="true" className="w-full bg-surface border border-line rounded-3xl p-4 space-y-2.5 self-stretch">{children}</div>
}

function InviteVisual() {
  return (
    <VisualCard>
      <div className="text-xs font-semibold text-muted">Your link</div>
      <div className="flex flex-wrap items-center gap-2 bg-raised rounded-2xl px-3 py-2.5">
        <span className="font-semibold text-ink break-all grow min-w-0">athrion.app/add/you</span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-on-neon bg-neon rounded-lg px-2 py-1"><Icon icon="mdi:share-variant-outline" width={14} />Share</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-raised rounded-2xl px-3 py-2.5">
        <span className="w-9 h-9 rounded-full bg-info text-on-neon font-bold flex items-center justify-center flex-shrink-0">S</span>
        <span className="grow min-w-0 text-sm text-ink-2"><span className="font-semibold text-ink">@sam</span> added you</span>
        <span className="text-xs font-semibold text-neon-ink">Friends</span>
      </div>
    </VisualCard>
  )
}

function RoomVisual() {
  return (
    <VisualCard>
      <div className="text-xs font-semibold text-muted">Room code</div>
      <div className="font-bold text-3xl tracking-[0.2em] text-neon-ink tabular-nums">K7P2QX</div>
      <div className="grid grid-cols-2 gap-1 bg-raised rounded-xl p-1 text-sm font-semibold text-center">
        <span className="rounded-lg bg-neon text-on-neon py-1.5">Planned</span>
        <span className="rounded-lg text-ink-2 py-1.5">Free workout</span>
      </div>
      <div className="text-sm text-ink-2">Squat · 4 sets · 90 s rest</div>
    </VisualCard>
  )
}

function FeedVisual() {
  const rows = [['Maya', 'bg-rose', 'Squat · 135 lb × 5'], ['Leo', 'bg-lilac', 'Squat · 185 lb × 5'], ['You', 'bg-neon', 'Squat · 155 lb × 5']]
  return (
    <VisualCard>
      {rows.map(([name, tone, set]) => (
        <div key={name} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-raised rounded-2xl px-3 py-2.5">
          <span className={`w-9 h-9 rounded-full ${tone} text-on-neon font-bold flex items-center justify-center flex-shrink-0`}>{name[0]}</span>
          <span className="grow min-w-0 text-sm"><span className="font-semibold text-ink">{name}</span> <span className="text-ink-2">{set}</span></span>
          <Icon icon="mdi:check-circle" width={18} className="text-neon-ink flex-shrink-0" />
        </div>
      ))}
      <div className="text-sm font-semibold text-neon-ink">+15 points · trained together</div>
    </VisualCard>
  )
}

// The monthly race that keeps everyone coming back, with the real point rules
function TrainTogether() {
  return (
    <section className="bg-surface border-y border-line" aria-labelledby="together">
      <div className="max-w-5xl mx-auto px-4 py-20 grid gap-12 md:gap-10 md:grid-cols-2 md:items-center text-center md:text-left">
        <div className="md:order-2">
          <h2 id="together" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight">
            Race your <span className="text-neon-ink">friends</span>.
          </h2>
          <p className="text-lg text-ink-2 mt-4 max-w-md mx-auto md:mx-0">
            Every workout counts, alone or together. Points reset on the 1st, and the top {PRIZE_PLACES} on the Everyone board win a free month of Pro.
          </p>
          <ul className="mt-6 space-y-2.5 max-w-sm mx-auto md:mx-0 text-left" aria-label="How points are earned">
            {POINT_RULES.map(([icon, pts, rule]) => (
              <li key={rule} className="flex items-center gap-3 bg-raised rounded-2xl px-3 py-2.5">
                <Icon icon={icon} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                <span className="font-bold text-lg text-ink tabular-nums w-8 flex-shrink-0">{pts}</span>
                <span className="text-sm text-ink-2 min-w-0">{rule}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted mt-4 max-w-sm mx-auto md:mx-0">
            Your points add up to a level, from {LEVELS[0].name} to {LEVELS.at(-1).name}.
          </p>
        </div>
        <div className="md:order-1"><LeaderboardDemo /></div>
      </div>
    </section>
  )
}

const CREW = [
  { icon: 'mdi:account-multiple-outline', title: 'Friends',
    body: 'A friends board of your own, every month. Outside a room they see your nickname, points and level, never your weight or meals.' },
  { icon: 'mdi:swim', title: 'Swim teams',
    body: 'Your coach posts the day\'s practice, you log it in one tap, and see teammates and team results.' },
  { icon: 'mdi:whistle-outline', title: 'Your trainer',
    body: 'Working with a coach? They send a link, assign your workouts, and see how you are doing.' },
]

// The other ways ATHRION is shared: friends, swim teams and a trainer
function Crew() {
  return (
    <section className="max-w-5xl mx-auto px-4 py-20" aria-labelledby="crew">
      <h2 id="crew" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight text-center">
        Bring your whole <span className="text-neon-ink">crew</span>.
      </h2>
      <ul className="mt-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
        {CREW.map(({ icon, title, body }) => (
          <li key={title} className="bg-surface border border-line rounded-2xl p-5">
            <span className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon-stroke/30 flex items-center justify-center">
              <Icon icon={icon} width={26} className="text-neon-ink" aria-hidden="true" />
            </span>
            <h3 className="font-bold text-2xl mt-4">{title}</h3>
            <p className="text-ink-2 mt-2">{body}</p>
          </li>
        ))}
      </ul>
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
        <p className="text-lg text-ink-2 mt-4 max-w-lg mx-auto">For the days you train alone: a plan that knows what you lifted, and meals logged from a photo.</p>
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

// Pro colour themes: the scene fades through each one on a drawn Train screen
function Themes() {
  return (
    <section className="max-w-5xl mx-auto px-4 pb-20" aria-labelledby="themes-title">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-3 py-1">
            <Icon icon="mdi:palette-outline" width={18} aria-hidden="true" />Colour themes
          </span>
          <h2 id="themes-title" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight mt-4">
            Make it <span className="text-neon-ink">yours</span>.
          </h2>
          <p className="text-lg text-ink-2 mt-4">
            Dark, Light and the seasonal Christmas theme, with lights along the top and snow piling up on your tabs, are free. Pro adds Blossom, Blue and Mono.
            Switch any time in You, then Appearance.
          </p>
        </div>
        <ThemeDemo />
      </div>
    </section>
  )
}

const TRUST = [
  ['mdi:eye-off-outline', 'No third-party trackers'],
  ['mdi:download-outline', 'Download or delete your data'],
  ['mdi:import', 'Import from Strong or Hevy'],
  ['mdi:account-check-outline', 'Under 16 only with a parent\'s OK'],
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
  ['Do my friends need Pro to train with me?', `No. Rooms, friends and the leaderboard are free for everyone. Open as many rooms as you like; each holds up to ${ROOM_SIZE} people${COACH_PLAN_ON_SALE ? `, or ${COACH_ROOM_SIZE} when the host has the coach and club plan` : ''}.`],
  ['Do we have to be at the same gym?', 'No. Each of you trains on your own phone, wherever you are, and every set shows up in the room as it happens.'],
  ['What do my friends see?', 'Your nickname, monthly points, workout days and level. In a room you share, they also see the sets you log there. Your weight, meals and body stats stay private. You can hide from the Everyone board and still show up for friends.'],
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
