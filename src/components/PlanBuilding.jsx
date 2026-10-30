import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

// While the AI writes a plan (30-60 s): a full-screen pop-up that asks the person to stay put,
// shows where it's up to, and gives a coaching tip that changes every few seconds.
const STEPS = ['Reading your goal and stats', 'Choosing your exercises', 'Setting sets, reps and rest', 'Fitting it to your week']
const TIPS = [
  ['Progressive overload', 'Add a rep or a little weight only when every set feels controlled. Small jumps, every week, add up.'],
  ['Leave reps in the tank', 'Finish most sets with 1 or 2 good reps left. Going to failure every set slows recovery more than it builds muscle.'],
  ['Spread your protein', 'Three or four meals with about 25-40 g of protein each support muscle better than one big serving.'],
  ['Sleep is training', 'Seven to nine hours is when your body repairs and adapts. Short sleep shows up as weaker sessions.'],
  ['Warm up with the lift', 'Two or three lighter sets of your first exercise prepare the joints and double as technique practice.'],
  ['Consistency wins', 'Three steady sessions every week beat one heroic week followed by a missed one.'],
  ['Read the trend, not the day', 'Body weight swings with water and salt. Judge progress by the weekly average.'],
  ['Rest for the big lifts', 'Two to three minutes between heavy compound sets; 60 to 90 seconds is enough on smaller moves.'],
  ['Technique when fresh', 'In the pool, swim drills early and easy. Technique practised tired does not stick.'],
]

export default function PlanBuilding({ open, adapting = false }) {
  const [step, setStep] = useState(0)
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))

  useEffect(() => {
    if (!open) return
    setStep(0)
    const s = setInterval(() => setStep(n => Math.min(STEPS.length - 1, n + 1)), 9000)
    const t = setInterval(() => setTip(n => (n + 1) % TIPS.length), 8000)
    // Leaving the page now would drop the request
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => { clearInterval(s); clearInterval(t); window.removeEventListener('beforeunload', warn) }
  }, [open])

  if (!open) return null
  const [tipTitle, tipBody] = TIPS[tip]
  // On document.body, above the header and the bottom bar (a page's slide-in would otherwise contain it)
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="plan-building-title"
      className="fixed inset-0 z-[70] bg-canvas/95 backdrop-blur flex items-center justify-center px-5 fade-in">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* A neon arc turning around a dumbbell */}
        <div className="relative w-28 h-28 mx-auto" aria-hidden="true">
          <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full">
            <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="8" className="text-raised" />
          </svg>
          <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full animate-[spin_1.4s_linear_infinite] motion-reduce:animate-none">
            <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray="90 212" className="text-neon-stroke" />
          </svg>
          <Icon icon="mdi:dumbbell" width={36} className="absolute inset-0 m-auto text-neon-ink animate-pulse motion-reduce:animate-none" />
        </div>

        <div>
          <h2 id="plan-building-title" className="font-bold text-2xl text-ink tracking-tight">{adapting ? 'Updating your plan' : 'Building your plan'}</h2>
          <p className="text-sm text-ink-2 mt-2">Stay on this screen. It takes about a minute, and leaving now can stop it.</p>
        </div>

        <ol className="text-left space-y-2 max-w-[17rem] mx-auto" aria-live="polite">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-2.5 text-sm transition-colors ${i < step ? 'text-ink-2' : i === step ? 'text-ink font-semibold' : 'text-muted'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${i < step ? 'bg-neon text-on-neon' : i === step ? 'border-2 border-neon-stroke' : 'border border-line-strong'}`}>
                {i < step && <Icon icon="mdi:check" width={14} aria-hidden="true" />}
                {i === step && <span className="w-1.5 h-1.5 rounded-full bg-neon-stroke animate-pulse motion-reduce:animate-none" />}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div key={tip} className="fade-in rounded-2xl border border-neon-stroke/30 bg-neon-tint p-4 text-left">
          <div className="text-xs font-semibold text-neon-ink flex items-center gap-1.5">
            <Icon icon="mdi:lightbulb-on-outline" width={16} aria-hidden="true" />Coach's tip · {tipTitle}
          </div>
          <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{tipBody}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
