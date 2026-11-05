import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'

// The landing page's swim and run cards: a swimmer doing lengths with splits coming in, and a
// run route drawing itself, the runner on its tip, while the distance counts up. Drawn, not screenshots. Each starts
// over in step whenever it comes back on screen, rests off screen, and holds its finished
// state for reduced motion.

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// round: goes up each time the card comes on screen, so the scene remounts and its CSS motion
// and counters start together
function useOnScreen() {
  const ref = useRef(null)
  const [state, setState] = useState({ visible: false, round: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setState({ visible: true, round: 1 }); return }
    const io = new IntersectionObserver(([e]) => setState(s => (e.isIntersecting === s.visible ? s
      : { visible: e.isIntersecting, round: s.round + (e.isIntersecting ? 1 : 0) })), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, state]
}

const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

// ── Swim ─────────────────────────────────────────────────────────────────────
const SPLITS = [52, 51, 50, 51, 49, 50, 48, 47] // seconds per 50 m length
const POOL = 50

function SwimScene({ still }) {
  const [lengths, setLengths] = useState(still ? SPLITS.length : 0)
  const done = SPLITS.slice(0, lengths)
  const total = done.reduce((a, b) => a + b, 0)
  const finished = lengths === SPLITS.length
  // A length is done each time the swimmer reaches a wall; after the last one it starts over.
  // Only the lane's own animation counts (the swimmer's turn inside it bubbles up too).
  const turn = e => { if (e.target === e.currentTarget) setLengths(n => (n >= SPLITS.length ? 1 : n + 1)) }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-muted">Freestyle · {POOL} m pool</span>
        <span className="text-sm font-semibold text-ink-2 tabular-nums">Length {Math.max(1, Math.min(lengths + (finished ? 0 : 1), SPLITS.length))} of {SPLITS.length}</span>
      </div>

      <div className="relative mt-3 h-16 rounded-xl bg-info/10 overflow-hidden">
        <span className="absolute inset-x-0 top-0 border-t-2 border-dashed border-info/40" />
        <span className="absolute inset-x-0 bottom-0 border-b-2 border-dashed border-info/40" />
        <span className="absolute inset-y-3 left-1/2 border-l border-info/20" />
        <div className={`absolute inset-0 flex items-center ${still ? '' : 'lane-swim'}`} onAnimationIteration={turn}>
          <span className={`w-10 h-10 flex items-center justify-center text-info ${still ? '' : 'lane-flip'}`}>
            <Icon icon="mdi:swim" width={32} />
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="font-bold text-4xl leading-none text-ink tabular-nums">{lengths * POOL}<span className="text-lg text-muted ml-1">m</span></div>
          <div className="text-xs text-muted mt-1">Swum</div>
        </div>
        <div>
          <div className="font-bold text-2xl leading-none text-neon-ink tabular-nums">{done.length ? clock((total / done.length) * (100 / POOL)) : '–'}</div>
          <div className="text-xs text-muted mt-1">Pace per 100 m</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {SPLITS.map((s, i) => (
          <span key={i} className={`h-8 rounded-lg flex items-center justify-center text-sm font-semibold tabular-nums ${i < lengths ? `bg-raised text-ink ${i === lengths - 1 && !still ? 'pop-in' : ''}` : 'bg-line/50 text-transparent'}`}>
            {clock(s)}
          </span>
        ))}
      </div>

      <div className="mt-3 h-9 flex items-center">
        {finished && (
          <span key="pr" className="pop-in inline-flex items-center gap-1.5 text-sm font-bold text-on-neon bg-neon rounded-lg px-2.5 py-1.5">
            <Icon icon="mdi:trophy-outline" width={18} />New PR · 400 m in {clock(total)}
          </span>
        )}
      </div>
    </>
  )
}

export function SwimDemo() {
  const [ref, { visible, round }] = useOnScreen()
  const still = reducedMotion()
  return (
    <div ref={ref} aria-hidden="true" className={`bg-surface border border-line rounded-3xl p-4 xs:p-5 text-left ${visible || still ? '' : 'paused'}`}>
      <SwimScene key={still ? 'still' : round} still={still} />
    </div>
  )
}

// ── Run ──────────────────────────────────────────────────────────────────────
const ROUTE = 'M20 108 C 60 108, 58 46, 104 48 S 160 112, 204 84 S 246 24, 282 30'
const LOOP_MS = 6000
const RUN_SHARE = 0.85 // of the loop spent running; the rest holds the finish
const RUN_KM = 5
const RUN_SECS = 27 * 60
const WEEK = [['M', 0], ['T', 6], ['W', 0], ['T', 8], ['F', 0], ['S', 5], ['S', 0]] // km

function RunScene({ still }) {
  const pathRef = useRef(null)
  const [f, setF] = useState(still ? 1 : 0)
  const [dot, setDot] = useState({ x: 282, y: 30 })
  // One clock drives the line, the runner and the numbers, so they always agree
  useEffect(() => {
    if (still) return
    const start = performance.now()
    let raf
    const frame = now => {
      setF(Math.min(1, (((now - start) % LOOP_MS) / LOOP_MS) / RUN_SHARE))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [still])
  useEffect(() => {
    const p = pathRef.current
    if (!p?.getTotalLength) return
    const pt = p.getPointAtLength(p.getTotalLength() * f)
    setDot({ x: pt.x, y: pt.y })
  }, [f])
  const top = Math.max(...WEEK.map(([, km]) => km))

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-muted">Morning run</span>
        <span className="text-sm font-semibold text-neon-ink tabular-nums">5:24 /km</span>
      </div>

      <svg viewBox="0 0 300 130" className="mt-2 w-full h-auto" role="presentation">
        <path d={ROUTE} fill="none" stroke="rgb(var(--line))" strokeWidth="8" strokeLinecap="round" />
        <path ref={pathRef} d={ROUTE} fill="none" stroke="rgb(var(--neon-stroke))" strokeWidth="8" strokeLinecap="round"
          pathLength="1" strokeDasharray="1" strokeDashoffset={1 - f} />
        <circle cx="20" cy="108" r="7" fill="rgb(var(--surface))" stroke="rgb(var(--neon-stroke))" strokeWidth="3" />
        <circle r="10" cx={dot.x} cy={dot.y} fill="rgb(var(--ink))" stroke="rgb(var(--neon-stroke))" strokeWidth="4" />
      </svg>

      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="font-bold text-4xl leading-none text-ink tabular-nums">{(RUN_KM * f).toFixed(2)}<span className="text-lg text-muted ml-1">km</span></div>
          <div className="text-xs text-muted mt-1">Distance</div>
        </div>
        <div>
          <div className="font-bold text-2xl leading-none text-ink tabular-nums">{clock(RUN_SECS * f)}</div>
          <div className="text-xs text-muted mt-1">Time</div>
        </div>
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        {WEEK.map(([d, km], i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className={`w-full rounded-md ${km ? 'bg-neon grow-y' : 'bg-line'}`}
              style={{ height: km ? Math.round((km / top) * 48) : 4, animationDelay: km ? `${i * 90}ms` : undefined }} />
            <span className="text-xs text-muted">{d}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-sm text-ink-2"><span className="font-bold text-ink tabular-nums">19 km</span> this week · 3 runs</div>
    </>
  )
}

export function RunDemo() {
  const [ref, { visible, round }] = useOnScreen()
  const still = reducedMotion()
  return (
    <div ref={ref} aria-hidden="true" className={`bg-surface border border-line rounded-3xl p-4 xs:p-5 text-left ${visible || still ? '' : 'paused'}`}>
      <RunScene key={still ? 'still' : round} still={still} />
    </div>
  )
}
