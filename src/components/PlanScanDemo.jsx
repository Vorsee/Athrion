import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useOnScreen, reducedMotion } from './CardioDemo.jsx'

// The landing page's Pro scenes, drawn rather than screenshots: a plan day with next-session
// targets, a missed day moved and the Sunday review; and a photo scan whose amount gets edited.
// Each one plays while on screen, starts again in step when it comes back, and holds its
// finished state for reduced motion.

function useTicks(still, last, ms, hold = 3) {
  const [step, setStep] = useState(still ? last : 0)
  useEffect(() => {
    if (still) return
    const t = setInterval(() => setStep(s => (s >= last + hold ? 0 : s + 1)), ms)
    return () => clearInterval(t)
  }, [still, last, ms, hold])
  return Math.min(step, last)
}

function Frame({ children, label }) {
  const [ref, { visible, round }] = useOnScreen()
  const still = reducedMotion()
  return (
    <div ref={ref} aria-hidden="true" className={`bg-surface border border-line rounded-3xl p-4 xs:p-5 text-left w-full ${visible || still ? '' : 'paused'}`} data-demo={label}>
      {visible || still ? children({ key: still ? 'still' : round, still }) : children({ key: 'idle', still: true, idle: true })}
    </div>
  )
}

// ── Plan ─────────────────────────────────────────────────────────────────────
const LIFTS = [
  ['Squat', '135 × 8', '140 × 8'],
  ['Romanian deadlift', '115 × 10', '115 × 12'],
  ['Walking lunge', '30 × 10', '30 × 12'],
]
const WEEK = ['done', 'moved', 'done', 'today', 'rest', 'plan', 'rest'] // Mon → Sun

function PlanScene({ still }) {
  const step = useTicks(still, 6, 900)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="grow min-w-0">
          <div className="text-xs font-semibold text-muted">Thursday · week 3</div>
          <div className="font-bold text-2xl leading-tight text-ink">Lower body</div>
        </div>
        {step >= 4 && (
          <span className="pop-in inline-flex items-center gap-1 text-xs font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-2.5 py-1">
            <Icon icon="mdi:calendar-arrow-right" width={14} />Moved from Tuesday
          </span>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {LIFTS.map(([name, last, next], i) => (
          <li key={name} className="bg-raised rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="grow basis-0 min-w-[7rem] font-semibold text-ink">{name}</span>
            <span className="text-sm text-muted tabular-nums">Last {last}</span>
            <span className={`text-sm font-bold tabular-nums ${step > i ? 'text-neon-ink pop-in' : 'text-transparent'}`}>
              <Icon icon="mdi:arrow-right" width={14} className="inline -mt-0.5 mr-1" />{next}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {WEEK.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted">{'MTWTFSS'[i]}</span>
            <span className={`w-full h-2 rounded-full ${d === 'done' ? 'bg-neon' : d === 'today' ? (step >= 4 ? 'bg-neon pop-in' : 'bg-neon/30') : d === 'moved' ? (step >= 4 ? 'bg-line' : 'bg-danger/40') : d === 'plan' ? 'bg-neon/30' : 'bg-line'}`} />
          </div>
        ))}
      </div>

      {/* Fixed height, so the card doesn't jump when the review slides in */}
      <div className="mt-4 min-h-[3.5rem] flex items-center">
        {step >= 5 && (
          <div className="slide-up flex items-start gap-2 text-sm text-ink-2">
            <Icon icon="mdi:message-text-outline" width={20} className="text-neon-ink flex-shrink-0 mt-0.5" />
            <span><span className="font-semibold text-ink">Sunday review:</span> 3 of 3 done. Squat is up 10 lb this month. Next week, add a set of lunges.</span>
          </div>
        )}
      </div>
    </>
  )
}

export function PlanDemo() {
  return <Frame label="plan">{({ key, still }) => <PlanScene key={key} still={still} />}</Frame>
}

// ── Photo scan ───────────────────────────────────────────────────────────────
const FOODS = [
  ['Grilled chicken', 150, 1.65],
  ['White rice', 180, 1.3],
  ['Broccoli', 90, 0.35],
]
const EDITED = 120 // the rice, weighed: 180 g → 120 g

function ScanScene({ still }) {
  const step = useTicks(still, 6, 1000)
  const scanning = step === 0
  const rice = step >= 5 ? EDITED : FOODS[1][1]
  const rows = FOODS.map(([n, g, k], i) => [n, i === 1 ? rice : g, Math.round((i === 1 ? rice : g) * k)])
  const shown = rows.slice(0, Math.max(0, Math.min(3, step)))
  const total = shown.reduce((a, r) => a + r[2], 0)

  return (
    <>
      <div className="flex items-center gap-3">
        {/* The plate: drawn, with the scan line sweeping while it reads it */}
        <div className="relative w-24 h-24 xs:w-28 xs:h-28 rounded-2xl bg-raised overflow-hidden flex-shrink-0">
          <div className="absolute inset-2 rounded-full bg-line" />
          <div className="absolute inset-4 rounded-full bg-overlay" />
          <span className="absolute w-[34%] h-[26%] rounded-xl bg-ember/80 left-[22%] top-[28%] rotate-[-12deg]" />
          <span className="absolute w-[30%] h-[30%] rounded-full bg-ink/80 right-[20%] top-[24%]" />
          <span className="absolute w-[26%] h-[22%] rounded-full bg-neon/70 left-[36%] bottom-[20%]" />
          {scanning && !still && (
            <div className="absolute inset-0 scan-sweep">
              <div className="h-0.5 bg-neon" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted">{scanning ? 'Reading your plate' : 'Found 3 foods'}</div>
          <div className="font-bold text-3xl text-ink tabular-nums leading-tight">{scanning ? '...' : total}<span className="text-base text-muted font-semibold"> kcal</span></div>
        </div>
      </div>

      <ul className="mt-4 space-y-2 min-h-[9.75rem]">
        {shown.map(([name, g, kcal], i) => {
          const editing = i === 1 && step === 4
          const edited = i === 1 && step >= 5
          return (
            <li key={name} className={`pop-in rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 transition-colors duration-500 ${editing || edited ? 'bg-neon-tint' : 'bg-raised'}`}>
              <div className="grow basis-0 min-w-[6rem]">
                <div className="font-semibold text-ink">{name}</div>
                <div className={`text-sm tabular-nums ${edited ? 'text-neon-ink font-semibold' : 'text-muted'}`}>{g} g</div>
              </div>
              <span className="font-bold text-ink tabular-nums">{kcal} kcal</span>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center ${editing ? 'bg-neon text-on-neon pop-in' : 'text-muted'}`}>
                <Icon icon={edited ? 'mdi:check' : 'mdi:pencil-outline'} width={18} />
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 min-h-[1.5rem] text-sm text-ink-2">
        {step >= 5 && <span key="edit" className="slide-up inline-block">Weighed the rice: 120 g. Everything else updates.</span>}
      </div>
    </>
  )
}

export function ScanDemo() {
  return <Frame label="scan">{({ key, still }) => <ScanScene key={key} still={still} />}</Frame>
}
