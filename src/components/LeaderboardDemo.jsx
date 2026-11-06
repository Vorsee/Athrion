import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useOnScreen, reducedMotion } from './CardioDemo.jsx'

// The landing page's monthly race: four friends' points climbing as they train, rows sliding
// past each other, and "you" ending in the top 3 that wins a free month of Pro. Drawn, loops
// while on screen, holds the finish for reduced motion.

const PEOPLE = [
  { name: 'You', tone: 'bg-neon', me: true },
  { name: 'Sam', tone: 'bg-info' },
  { name: 'Maya', tone: 'bg-rose' },
  { name: 'Leo', tone: 'bg-lilac' },
]
const START = [120, 190, 155, 140] // ends: Sam 200, you 190, Maya 185, Leo 165
// Each tick: who earned what (a workout day 10, a full week 20, a room together 15)
const EVENTS = [[0, 15], [3, 10], [0, 20], [2, 10], [0, 10], [1, 10], [3, 15], [0, 15], [2, 20], [0, 10]]
const WHY = { 10: 'workout day', 15: 'trained in a room', 20: 'full week' }
const ROW = 60 // px per row, so rows can slide by transform
const TICK = 1100
const HOLD = 3

function scores(step) {
  const p = [...START]
  for (const [i, pts] of EVENTS.slice(0, step)) p[i] += pts
  return p
}

function Scene({ still }) {
  const [step, setStep] = useState(still ? EVENTS.length : 0)
  useEffect(() => {
    if (still) return
    const t = setInterval(() => setStep(s => (s >= EVENTS.length + HOLD ? 0 : s + 1)), TICK)
    return () => clearInterval(t)
  }, [still])
  const shown = Math.min(step, EVENTS.length)
  const pts = scores(shown)
  const order = PEOPLE.map((_, i) => i).sort((a, b) => pts[b] - pts[a])
  const place = i => order.indexOf(i)
  const last = shown > 0 ? EVENTS[shown - 1] : null
  const finished = step > EVENTS.length

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="grow min-w-0">
          <div className="text-xs font-semibold text-muted">This month · friends</div>
          <div className="font-bold text-2xl leading-tight text-ink">Leaderboard</div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-neon-ink border border-neon-stroke/30 rounded-full px-2.5 py-1">
          <Icon icon="mdi:trophy-outline" width={14} />Top 3 win a free month
        </span>
      </div>

      <ol className="relative mt-4" style={{ height: ROW * PEOPLE.length }}>
        {PEOPLE.map((p, i) => {
          const rank = place(i)
          const hit = last && last[0] === i && !finished
          return (
            <li key={p.name} className="absolute inset-x-0 transition-transform duration-700" style={{ transform: `translateY(${rank * ROW}px)`, height: ROW - 8 }}>
              <div className={`h-full rounded-2xl px-3 flex items-center gap-3 transition-colors duration-500 ${p.me ? 'bg-neon-tint border border-neon-stroke/30' : 'bg-raised'}`}>
                <span className={`w-6 text-center font-bold tabular-nums ${rank < 3 ? 'text-neon-ink' : 'text-muted'}`}>{rank + 1}</span>
                <span className={`w-9 h-9 rounded-full ${p.tone} text-on-neon font-bold flex items-center justify-center flex-shrink-0`}>{p.name[0]}</span>
                <span className="grow min-w-0 font-bold text-ink truncate">{p.name}</span>
                {hit && <span key={shown} className="pop-in text-xs font-bold text-on-neon bg-neon rounded-md px-1.5 py-0.5 tabular-nums">+{last[1]}</span>}
                <span className="font-bold text-lg text-ink tabular-nums">{pts[i]}</span>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Fixed height, so the card doesn't jump as the line changes */}
      <div className="mt-3 h-12 flex items-center overflow-hidden">
        {finished ? (
          <div key="done" className="slide-up flex items-center gap-2 text-base font-bold text-neon-ink">
            <Icon icon="mdi:medal-outline" width={22} />You're in the top 3
          </div>
        ) : last && (
          <div key={shown} className="slide-up flex items-center gap-2 text-sm text-ink-2 min-w-0">
            <Icon icon="mdi:arrow-up-bold-circle-outline" width={20} className="text-neon-ink flex-shrink-0" />
            <span><span className="font-semibold text-ink">{PEOPLE[last[0]].name}</span> +{last[1]} · {WHY[last[1]]}</span>
          </div>
        )}
      </div>
    </>
  )
}

export default function LeaderboardDemo() {
  const [ref, { visible, round }] = useOnScreen()
  const still = reducedMotion()
  return (
    <div ref={ref} aria-hidden="true" className={`bg-surface border border-line rounded-3xl p-4 xs:p-5 text-left w-full max-w-md mx-auto ${visible || still ? '' : 'paused'}`}>
      <Scene key={still ? 'still' : visible ? round : 'idle'} still={still || !visible} />
    </div>
  )
}
