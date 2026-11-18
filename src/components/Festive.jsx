import { useEffect, useRef, useState } from 'react'
import { useActiveTheme } from '../lib/theme.js'

// The Christmas theme's extras (Pro, lib/theme.js): light strings along the header, the tab bar
// and the top of sheets, and snow that falls over the app and piles up on top of the tab bar.
// Colours are in src/index.css (.xmas-*). Nothing here takes taps.

const GAP = 26 // px between bulbs

// A sagging wire with bulbs hanging from it, as wide as its parent.
// className places it (e.g. "top-full" under the header, "top-0" along the tab bar).
// show: draw them whatever the theme (the landing page's theme scene)
export function ChristmasLights({ className = '', style, skipCenter = 0, show = false }) {
  const theme = useActiveTheme()
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [theme])
  if (theme !== 'christmas' && !show) return null

  const n = Math.max(2, Math.floor(width / GAP))
  const step = width / n
  // The wire hangs between hooks at y=2 and dips to y=7 where each bulb hangs
  let wire = 'M0 2'
  const bulbs = []
  for (let i = 0; i < n; i++) {
    const x0 = i * step, mid = x0 + step / 2, x1 = x0 + step
    wire += ` Q${(x0 + mid) / 2} 7.5 ${mid} 7 Q${(mid + x1) / 2} 7.5 ${x1} 2`
    // skipCenter: no bulbs this close to the middle (a sheet's drag handle sits there)
    if (Math.abs(mid - width / 2) >= skipCenter) bulbs.push({ x: mid, tilt: i % 2 ? 12 : -12, c: i % 4 })
  }
  return (
    <div ref={ref} aria-hidden="true" className={`xmas-lights ${className}`} style={style}>
      {width > 0 && (
        <svg viewBox={`0 0 ${width} 18`}>
          <path className="xmas-wire" d={wire} />
          {bulbs.map((b, i) => (
            <g key={i} transform={`rotate(${b.tilt} ${b.x} 7)`}>
              <rect className="xmas-cap" x={b.x - 1.6} y={6.5} width={3.2} height={2.4} rx={0.6} />
              <ellipse className={`xmas-bulb b${b.c}`} cx={b.x} cy={12.4} rx={2.9} ry={4.2} />
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

// Snow over the whole app. Flakes that reach the tab bar (the element marked data-snow-ledge)
// settle there and build up a drift along its top edge, which slowly melts so it stays a cap.
// Reduced motion: no falling, just a still cap of snow on the bar.
const COL = 4          // px per drift column
const MAX_DRIFT = 14   // px, the highest the drift gets
const MELT = 0.0006    // px per frame
const BASE = 3         // px of snow already on the bar when the theme starts

export function Snow() {
  const theme = useActiveTheme()
  const ref = useRef(null)

  useEffect(() => {
    if (theme !== 'christmas') return
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, flakes = [], drift = [], ledge = null, raf = 0, frame = 0

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cols = Math.ceil(w / COL) + 1
      drift = Array.from({ length: cols }, (_, i) => drift[i] ?? (still ? 5 + 3 * Math.sin(i / 3) + 2 * Math.sin(i / 1.3) : BASE + Math.sin(i / 2.3) + 0.6 * Math.sin(i / 0.9)))
      const count = still ? 0 : Math.min(70, Math.round(w / 7))
      while (flakes.length < count) flakes.push(flake(true))
      flakes.length = count
    }
    function flake(anywhere) {
      const r = 0.8 + Math.random() * 2
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -6, r, vy: 0.35 + r * 0.28, sway: Math.random() * Math.PI * 2, a: 0.55 + Math.random() * 0.4 }
    }
    function findLedge() {
      const el = document.querySelector('[data-snow-ledge]')
      const top = el?.getBoundingClientRect().top
      ledge = top > 0 && top < h ? top : null
    }

    function settle(x) {
      const i = Math.max(0, Math.min(drift.length - 1, Math.round(x / COL)))
      drift[i] = Math.min(MAX_DRIFT, drift[i] + 1.8)
      // Slide off steep sides so the drift stays rounded
      for (let k = 0; k < 3; k++) for (let j = 1; j < drift.length; j++) {
        const d = drift[j] - drift[j - 1]
        if (Math.abs(d) > 1.5) { const m = (Math.abs(d) - 1.5) / 2 * Math.sign(d); drift[j] -= m; drift[j - 1] += m }
      }
    }

    function drawDrift() {
      if (ledge == null) return
      ctx.beginPath()
      ctx.moveTo(0, ledge + 1)
      for (let i = 0; i < drift.length; i++) ctx.lineTo(i * COL, ledge + 1 - drift[i])
      ctx.lineTo(w, ledge + 1)
      ctx.closePath()
      ctx.fillStyle = 'rgba(248, 251, 255, 0.95)'
      ctx.fill()
    }

    function tick() {
      frame++
      if (frame % 30 === 1) findLedge()
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#FFFFFF'
      for (const f of flakes) {
        f.sway += 0.012
        f.y += f.vy
        f.x += Math.sin(f.sway) * 0.35
        const floor = ledge != null ? ledge + 1 - (drift[Math.round(f.x / COL)] ?? 0) : h + 6
        if (f.y + f.r >= floor) {
          if (ledge != null && f.x > 0 && f.x < w) settle(f.x)
          Object.assign(f, flake(false))
        }
        if (f.x < -6) f.x = w + 4; else if (f.x > w + 6) f.x = -4
        ctx.globalAlpha = f.a
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      for (let i = 0; i < drift.length; i++) if (drift[i] > BASE) drift[i] = Math.max(BASE, drift[i] - MELT)
      drawDrift()
      raf = requestAnimationFrame(tick)
    }

    function start() {
      cancelAnimationFrame(raf)
      if (document.hidden) return
      if (still) { findLedge(); ctx.clearRect(0, 0, w, h); drawDrift(); return }
      raf = requestAnimationFrame(tick)
    }
    function onResize() { size(); start() }

    size(); start()
    // Reduced motion draws once, so redraw when the bar moves (the minimised workout bar)
    const poll = still ? setInterval(start, 1000) : 0
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', start)
    return () => {
      cancelAnimationFrame(raf); clearInterval(poll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', start)
    }
  }, [theme])

  if (theme !== 'christmas') return null
  // Above the header and tab bar (z-50) so the drift sits on the bar, under sheets (z-60)
  return <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-[55]" />
}

// Food's tab icon in the Christmas theme: a gingerbread man, drawn in the mdi line style
// (24 grid, 2px strokes, current colour); mdi has no gingerbread icon
export function GingerbreadIcon({ width = 24 }) {
  return (
    <svg width={width} height={width} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="3" />
      <path d="M9.6 7.4C8 8.4 7.7 9.3 5.6 9.4a1.6 1.6 0 0 0 0 3.2c1.4 0 2.2-.5 3.4-1.2v2.4l-2.3 4.7a1.6 1.6 0 0 0 2.9 1.3L12 16.4l2.4 3.4a1.6 1.6 0 0 0 2.9-1.3L15 13.8v-2.4c1.2.7 2 1.2 3.4 1.2a1.6 1.6 0 0 0 0-3.2c-2.1-.1-2.4-1-4-2" />
      <circle cx="12" cy="11.2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10.9" cy="4.5" r="0.45" fill="currentColor" stroke="none" />
      <circle cx="13.1" cy="4.5" r="0.45" fill="currentColor" stroke="none" />
    </svg>
  )
}
