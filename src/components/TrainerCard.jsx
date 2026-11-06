import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Card, Button, Fact } from './ui/index.js'
import { fetchMyTrainer, fetchMyAssignments } from '../lib/clientsApi.js'
import { todayKey } from '../lib/data.js'

const dayLabel = d => {
  if (!d) return null
  if (d === todayKey()) return 'Today'
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Train's "From your trainer": workouts a coach assigned (031) and hasn't seen done yet,
// today's first, each started in one tap. Nothing shows without a trainer or an open workout.
export default function TrainerCard({ onStart }) {
  const [state, setState] = useState(null) // { trainer, list }
  useEffect(() => {
    let alive = true
    fetchMyTrainer()
      .then(trainer => (trainer ? fetchMyAssignments().then(list => ({ trainer, list })) : null))
      .then(v => alive && setState(v))
      .catch(() => {})
    return () => { alive = false }
  }, [])
  if (!state?.list?.length) return null
  const today = todayKey()
  const list = [...state.list].sort((a, b) => (a.day === today ? -1 : b.day === today ? 1 : 0))

  return (
    <Card className="fade-in">
      <div className="text-sm font-semibold text-neon-ink">From your trainer</div>
      <div className="font-bold text-xl text-ink break-words">{state.trainer.display_name}</div>
      <ul className="mt-3 space-y-2">
        {list.map(a => (
          <li key={a.id} className="bg-raised rounded-2xl p-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="grow basis-0 min-w-[8rem]">
                <div className="font-semibold text-ink break-words">{a.title}</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {a.day && <Fact icon="mdi:calendar">{dayLabel(a.day)}</Fact>}
                  <Fact icon="mdi:dumbbell">{a.exercises?.length ?? 0} exercises</Fact>
                </div>
              </div>
              <Button size="sm" icon="mdi:play" onClick={() => onStart(a)}>Start</Button>
            </div>
            {a.note && (
              <p className="text-sm text-ink-2 mt-2 flex gap-2"><Icon icon="mdi:message-text-outline" width={18} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />{a.note}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
