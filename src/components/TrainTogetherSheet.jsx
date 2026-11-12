import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Sheet } from './ui/index.js'
import { roomPlanFromExercises, roomPlanFromLog } from '../lib/groupPlan.js'

// Train's Train together (R3): tap the button, pick the workout, tap Invite. The room is made
// with that workout and the share sheet opens with its link; friends can join any time.
// today: { name, exercises } (today's plan day or Train's workout of the day); last: the latest
// logged workout. Free is always there: everyone picks their own exercises as they go.
export default function TrainTogetherSheet({ today, last, onInvite, onClose }) {
  const todayPlan = today?.exercises?.length ? roomPlanFromExercises(today.exercises) : []
  const lastPlan = last ? roomPlanFromLog(last) : []
  const options = [
    todayPlan.length && { id: 'today', icon: 'mdi:calendar-today', title: today.name || "Today's workout", meta: `Today's workout · ${count(todayPlan)}`, host: { plan: todayPlan } },
    lastPlan.length && { id: 'last', icon: 'mdi:history', title: last.name || 'Your last workout', meta: `Repeat your last workout · ${count(lastPlan)}`, host: { plan: lastPlan } },
    { id: 'free', icon: 'mdi:plus-circle-outline', title: 'Free workout', meta: 'Everyone picks their own exercises as they go', host: { free: { sets: 3, rest: 60 } } },
  ].filter(Boolean)
  const [pick, setPick] = useState(options[0].id)
  const chosen = options.find(o => o.id === pick) ?? options[0]

  return (
    <Sheet title="Train together" onClose={onClose}
      footer={<>
        <Button full icon="mdi:share-variant-outline" className="h-14 text-base" onClick={() => onInvite(chosen.host)}>Invite friends</Button>
        <p className="text-xs text-muted text-center mt-2">Opens your room and the share sheet. Friends can join after you start too.</p>
      </>}>
      <p className="text-sm text-ink-2">Pick the workout. Everyone in the room sees each set live.</p>
      <div role="radiogroup" aria-label="Workout" className="space-y-2">
        {options.map((o, i) => {
          const on = o.id === chosen.id
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setPick(o.id)}
              className={`press rise w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${on ? 'bg-neon-tint border-neon-stroke/50' : 'bg-raised border-line hover:border-neon-stroke/30'}`}
              style={{ '--i': i }}>
              <Icon icon={o.icon} width={24} className={`flex-shrink-0 ${on ? 'text-neon-ink' : 'text-muted'}`} aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold text-ink break-words">{o.title}</span>
                <span className="block text-xs text-muted break-words">{o.meta}</span>
              </span>
              <span aria-hidden="true" className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${on ? 'border-neon-stroke' : 'border-line-strong'}`}>
                {on && <span className="w-2.5 h-2.5 rounded-full bg-neon pop-in" />}
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

function count(plan) {
  const sets = plan.reduce((a, e) => a + e.sets.length, 0)
  return `${plan.length} exercise${plan.length === 1 ? '' : 's'}, ${sets} sets`
}
