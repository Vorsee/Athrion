import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'

// The landing page's Train together scene: three friends in one live room, finishing sets one
// after another. Drawn, not a screenshot; it loops, pauses off screen and holds still for
// reduced motion.

const FRIENDS = [
  { name: 'Sam', tone: 'bg-info', lifts: [225, 155] },
  { name: 'Maya', tone: 'bg-rose', lifts: [135, 115] },
  { name: 'Leo', tone: 'bg-lilac', lifts: [185, 135] },
]
const EXERCISES = [['Squat', 5], ['Romanian deadlift', 8]] // [name, reps]
const SETS_EACH = 4
const TOTAL = EXERCISES.length * SETS_EACH // per friend
// Who finishes the next set: everyone ends on TOTAL, the lead changes hands on the way
const ORDER = [0, 1, 2, 0, 2, 1, 0, 2, 2, 1, 0, 1, 2, 2, 0, 1, 0, 1, 2, 1, 0, 2, 1, 0]
const TICK_MS = 1400
const HOLD = 3 // ticks on the finished screen before it starts again
const START_SECS = 14 * 60 + 20

const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function counts(step) {
  const done = FRIENDS.map(() => 0)
  for (const i of ORDER.slice(0, step)) done[i]++
  return done
}

function useStep() {
  const ref = useRef(null)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [step, setStep] = useState(reduced ? 14 : 3)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !visible) return
    const t = setInterval(() => setStep(s => (s >= ORDER.length + HOLD ? 0 : s + 1)), TICK_MS)
    return () => clearInterval(t)
  }, [reduced, visible])

  return [ref, Math.min(step, ORDER.length), step > ORDER.length]
}

export default function FriendsWorkoutDemo() {
  const [ref, step, finished] = useStep()
  const done = counts(step)
  const top = Math.max(...done)
  const leader = done.filter(d => d === top).length === 1 ? done.indexOf(top) : -1
  const last = step > 0 ? ORDER[step - 1] : null
  const lastSet = last !== null ? done[last] : 0
  const [lastEx, lastReps] = EXERCISES[Math.min(EXERCISES.length - 1, Math.floor((lastSet - 1) / SETS_EACH))] ?? EXERCISES[0]
  const lastWeight = last !== null ? FRIENDS[last].lifts[Math.floor((lastSet - 1) / SETS_EACH)] : 0

  return (
    <div ref={ref} aria-hidden="true" className="bg-surface border border-line rounded-3xl p-4 xs:p-5 text-left w-full max-w-md mx-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="grow min-w-0">
          <div className="text-xs font-semibold text-muted">Room · 3 friends</div>
          <div className="font-bold text-2xl leading-tight text-ink">Leg day</div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-neon-ink">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-neon animate-ping opacity-60" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-neon" />
          </span>
          Live
          <span className="text-muted font-medium tabular-nums">{fmtClock(START_SECS + step * 45)}</span>
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {FRIENDS.map((f, i) => {
          const n = done[i]
          const ex = EXERCISES[Math.min(EXERCISES.length - 1, Math.floor(n / SETS_EACH))]
          const now = n >= TOTAL ? 'All sets done' : `${ex[0]} · set ${(n % SETS_EACH) + 1} of ${SETS_EACH}`
          return (
            <li key={f.name} className={`rounded-2xl p-3 transition-colors duration-500 ${last === i && !finished ? 'bg-neon-tint' : 'bg-raised'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`w-11 h-11 rounded-full ${f.tone} text-on-neon font-bold text-lg flex items-center justify-center flex-shrink-0`}>{f.name[0]}</span>
                <div className="grow basis-0 min-w-[6rem]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-lg text-ink">{f.name}</span>
                    {leader === i && <span key={step} className="pop-in text-xs font-bold text-on-neon bg-neon rounded-md px-1.5 py-0.5">1st</span>}
                  </div>
                  <div className="text-sm text-muted break-words">{now}</div>
                </div>
                <div className="font-bold text-2xl text-ink tabular-nums ml-auto">{n}<span className="text-base text-muted">/{TOTAL}</span></div>
              </div>
              <div className="mt-2.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${TOTAL}, 1fr)` }}>
                {Array.from({ length: TOTAL }, (_, k) => (
                  <span key={k} className={`h-2 rounded-full ${k < n ? `bg-neon ${k === n - 1 && last === i ? 'pop-in' : ''}` : 'bg-line'} ${k === SETS_EACH ? 'ml-1' : ''}`} />
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Fixed height, so the card doesn't jump as the line changes */}
      <div className="mt-4 h-12 flex items-center overflow-hidden">
        {finished ? (
          <div key="done" className="slide-up flex items-center gap-2 text-base font-bold text-neon-ink">
            <Icon icon="mdi:trophy-outline" width={22} />Done together · {TOTAL * FRIENDS.length} sets
          </div>
        ) : last !== null && (
          <div key={step} className="slide-up flex items-center gap-2 text-sm text-ink-2 min-w-0">
            <Icon icon="mdi:check-circle" width={20} className="text-neon-ink flex-shrink-0" />
            <span className="break-words"><span className="font-semibold text-ink">{FRIENDS[last].name}</span> finished {lastEx.toLowerCase()} · {lastWeight} lb × {lastReps}</span>
          </div>
        )}
      </div>
    </div>
  )
}
