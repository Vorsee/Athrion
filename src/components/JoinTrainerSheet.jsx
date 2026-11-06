import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Sheet, Button } from './ui/index.js'
import { Avatar } from './Shop.jsx'
import { trainerByCode, joinTrainer, fetchMyTrainer } from '../lib/clientsApi.js'

const SEES = [
  ['mdi:dumbbell', 'Your workouts: exercises, sets, weights and reps'],
  ['mdi:scale-bathroom', 'Your weigh-ins and your goal'],
  ['mdi:clipboard-text-outline', 'They can send you workouts, which show on Train'],
]

// Opened from a coach's invite link (/trainer/<code>): who it is, what they'll see, and a clear yes
export default function JoinTrainerSheet({ code, onClose }) {
  const [coach, setCoach] = useState(undefined)
  const [current, setCurrent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    trainerByCode(code).then(c => setCoach(c ?? null)).catch(() => setCoach(null))
    fetchMyTrainer().then(setCurrent).catch(() => {})
  }, [code])

  async function join() {
    setBusy(true); setErr('')
    try { await joinTrainer(code); setDone(true) } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title="Your trainer" onClose={onClose}>
      {coach === undefined ? <p className="text-sm text-muted">Loading...</p>
        : coach === null ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">This invite link no longer works. Ask your trainer for a new one.</p>
            <Button full variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <Icon icon="mdi:check-circle-outline" width={44} className="mx-auto text-neon-ink" />
            <p className="font-bold text-xl text-ink">{coach.display_name} is your trainer</p>
            <p className="text-sm text-ink-2">Workouts they send show on Train. You can stop any time in You, Your trainer.</p>
            <Button full onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar coach={coach} size={52} />
              <div className="min-w-0">
                <div className="font-bold text-xl text-ink break-words">{coach.display_name}</div>
                {coach.specialties?.length > 0 && <div className="text-xs text-muted">{coach.specialties.join(' · ')}</div>}
              </div>
            </div>
            <p className="text-sm text-ink-2">wants to coach you on ATHRION. If you agree, they'll see:</p>
            <ul className="space-y-2">
              {SEES.map(([icon, t]) => (
                <li key={t} className="flex gap-2.5 text-sm text-ink"><Icon icon={icon} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />{t}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">Not your food log, photos or messages. You can stop any time.</p>
            {current && current.coach_id !== coach.coach_id && (
              <p className="text-sm text-warn">This replaces {current.display_name} as your trainer.</p>
            )}
            {err && <p role="alert" className="text-xs text-danger">{err}</p>}
            <Button full onClick={join} disabled={busy}>{busy ? 'Joining...' : `Train with ${coach.display_name}`}</Button>
            <Button full variant="ghost" onClick={onClose}>Not now</Button>
          </div>
        )}
    </Sheet>
  )
}
