import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useOnScreen, reducedMotion } from './CardioDemo.jsx'
import { ChristmasLights } from './Festive.jsx'
import { THEMES, themeClasses } from '../lib/theme.js'

// The landing page's theme scene: a drawn Train screen that fades through every colour theme,
// each one drawn with its real tokens (the theme's classes on the frame). Christmas lingers,
// with lights along the top and snow settling on the tab bar. Plays while on screen and starts
// again from Dark when it comes back; reduced motion holds Christmas, still.

const HOLD = { christmas: 4200 }
const STEP_MS = 2200
const TABS = ['mdi:dumbbell', 'mdi:account-group-outline', 'mdi:calendar-check-outline', 'mdi:food-apple-outline', 'mdi:heart-pulse']
const FLAKES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37) % 100, size: 2 + (i % 3), delay: -((i * 0.53) % 3.2), dur: 3.2 + (i % 4) * 0.6,
}))

export default function ThemeDemo() {
  const [ref, { visible, round }] = useOnScreen()
  const still = reducedMotion()
  const last = THEMES.length - 1
  const [i, setI] = useState(still ? last : 0)

  useEffect(() => {
    if (still || !visible) return
    setI(0)
  }, [still, visible, round])
  useEffect(() => {
    if (still || !visible) return
    const t = setTimeout(() => setI(n => (n >= last ? 0 : n + 1)), HOLD[THEMES[i].id] ?? STEP_MS)
    return () => clearTimeout(t)
  }, [still, visible, i, last])

  const theme = THEMES[i]
  const xmas = theme.id === 'christmas'

  return (
    <div ref={ref} aria-hidden="true" className={`flex flex-col items-center ${visible || still ? '' : 'paused'}`} data-demo="themes">
      <div className={`${theme.id === 'dark' ? 'theme-dark' : themeClasses(theme.id)} theme-mock relative w-full max-w-[17rem] h-[22rem] rounded-[2rem] border-4 border-line-strong bg-canvas overflow-hidden text-left`}>
        {/* Header */}
        <div className="relative h-11 px-3 flex items-center gap-1.5 bg-surface border-b border-line">
          <span className="font-bold text-sm text-ink tracking-tight">ATHRION</span>
          <span className="text-2xs font-semibold text-neon-ink border border-neon-stroke/40 px-1 rounded">Pro</span>
          <span className="ml-auto w-6 h-6 rounded-full bg-raised border border-line-strong" />
          {xmas && <ChristmasLights show className="top-full" />}
        </div>

        {/* Today */}
        <div className="px-3 pt-4 space-y-2.5">
          <div className="font-bold text-xl text-ink">Today</div>
          <div className="bg-surface border border-line rounded-2xl p-3">
            <div className="text-xs text-muted">Push day</div>
            <div className="font-semibold text-sm text-ink mt-0.5">Bench press, 5 × 5</div>
            <div className="mt-2.5 h-8 rounded-xl bg-neon text-on-neon text-xs font-semibold flex items-center justify-center">Start workout</div>
          </div>
          <div className="bg-raised rounded-2xl px-3 py-2.5 text-xs text-ink-2 flex items-center justify-between">
            <span>Streak</span><span className="font-bold text-neon-ink">12 days</span>
          </div>
          <div className="h-1.5 rounded-full bg-inset"><div className="h-1.5 w-2/3 rounded-full bg-neon-stroke" /></div>
        </div>

        {/* Snow, falling and settling on the tab bar */}
        {xmas && !still && FLAKES.map((f, k) => (
          <span key={k} className="mock-flake" style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }} />
        ))}

        {/* Tab bar */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-surface border-t border-line grid grid-cols-5">
          {xmas && <span className={`mock-drift ${still ? '' : 'mock-drift-grow'}`} />}
          {xmas && <ChristmasLights show className="top-0" />}
          {TABS.map((icon, k) => (
            <span key={icon} className={`flex items-center justify-center ${k === 0 ? 'text-ink' : 'text-muted'}`}>
              <Icon icon={icon} width={18} />
            </span>
          ))}
        </div>
      </div>

      {/* Which theme is showing */}
      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {THEMES.map(t => (
          <span key={t.id} className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors duration-300 ${t.id === theme.id ? 'bg-neon text-on-neon border-transparent' : 'text-muted border-line'}`}>
            {t.label}{t.pro ? ' · Pro' : t.seasonal ? ' · Free' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
