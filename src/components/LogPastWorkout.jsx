import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Sheet, IconButton, Chip, ExerciseRow } from './ui/index.js'
import { EXERCISES, MUSCLES, getExerciseIcon } from '../lib/data.js'
import { exerciseMode, roundSecs } from '../lib/sets.js'
import { useUnit } from '../lib/units.js'

const INPUT = 'bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-lg px-2 h-10 text-sm font-semibold tabular-nums outline-none transition-colors'
const MAX_MINUTES = 240 // the same 4-hour limit a live workout has
const emptySets = () => [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }]
const lookup = name => EXERCISES.find(e => e.name === name) ?? { name, muscle: '', icon: 'mdi:dumbbell' }

// Turn the form into a workout_logs entry. Rows left empty are skipped; weight is typed in the
// person's unit and stored in lb; timed moves keep seconds as a live workout does (sets.js).
export function pastEntry({ date, name, minutes, exercises, toLb }) {
  const sets = []
  for (const ex of exercises) {
    const timed = exerciseMode(lookup(ex.name)) === 'time'
    let n = 0
    for (const row of ex.sets) {
      const weight = toLb(parseFloat(row.weight) || 0)
      if (timed) {
        const secs = roundSecs(row.reps)
        if (secs > 0) sets.push({ ex: ex.name, set: ++n, weight, reps: 0, secs })
      } else {
        const reps = parseInt(row.reps) || 0
        if (reps > 0) sets.push({ ex: ex.name, set: ++n, weight, reps })
      }
    }
  }
  const mins = Math.min(MAX_MINUTES, Math.max(1, parseInt(minutes) || 0))
  const volume = sets.reduce((a, s) => a + s.weight * s.reps, 0)
  return { date, name: name.trim() || 'Workout', duration: `${mins}min`, volume, sets }
}

// Add a workout to a day already gone (or earlier today), in two steps: tap the exercises
// from the whole list (or fill them from My workouts), then type each one's weights and reps.
export default function LogPastWorkout({ date, customWorkouts = [], onSave, onClose }) {
  const { unit, toLb } = useUnit()
  const [step, setStep] = useState('pick') // pick | sets
  const [name, setName] = useState('Workout')
  const [minutes, setMinutes] = useState('45')
  const [exercises, setExercises] = useState([]) // [{ name, sets: [{ weight, reps }] }]
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('All')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const entry = pastEntry({ date, name, minutes, exercises, toLb })
  const q = search.trim().toLowerCase()
  const list = EXERCISES.filter(e => (!q || e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q)) && (muscle === 'All' || e.muscle === muscle))
  const added = new Set(exercises.map(e => e.name))

  function fillFrom(w) {
    setName(w.name)
    setExercises((w.exercises || []).map(n => ({ name: n, sets: emptySets() })))
    setStep('sets')
  }
  // Tap to add, tap again to take it out; sets already typed stay while it's in
  const toggle = ex => setExercises(cur => (cur.some(e => e.name === ex.name)
    ? cur.filter(e => e.name !== ex.name)
    : [...cur, { name: ex.name, sets: emptySets() }]))
  const changeEx = (i, sets) => setExercises(cur => cur.map((e, j) => (j === i ? { ...e, sets } : e)))
  const removeEx = i => setExercises(cur => cur.filter((_, j) => j !== i))

  async function save() {
    if (!entry.sets.length) return
    setSaving(true); setError('')
    try {
      await onSave(entry)
      onClose()
    } catch {
      setError("Couldn't save it. Check your connection and try again.")
      setSaving(false)
    }
  }

  const count = exercises.length
  const footer = step === 'pick' ? (
    <Button full iconRight="mdi:chevron-right" onClick={() => setStep('sets')} disabled={!count}>
      {count ? `Next: weights and reps · ${count} ${count === 1 ? 'exercise' : 'exercises'}` : 'Tap exercises to add them'}
    </Button>
  ) : (
    <>
      {error && <p role="alert" className="text-sm text-danger mb-2">{error}</p>}
      <Button full icon="mdi:check" onClick={save} disabled={saving || !entry.sets.length}>
        {saving ? 'Saving...' : entry.sets.length ? `Save workout · ${entry.sets.length} ${entry.sets.length === 1 ? 'set' : 'sets'}` : 'Fill in reps to save'}
      </Button>
    </>
  )

  return (
    <Sheet title={`Log a workout · ${day}`} onClose={onClose} footer={footer}>
      {step === 'pick' ? (
        <>
          {customWorkouts.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-1.5">Same as one of My workouts?</div>
              <div className="flex flex-wrap gap-1.5">
                {customWorkouts.map(w => <Chip key={w.id} onClick={() => fillFrom(w)}>{w.name}</Chip>)}
              </div>
            </div>
          )}
          <div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercises" aria-label="Search exercises"
              className={`${INPUT} w-full px-3 font-normal mb-2`} />
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {['All', ...MUSCLES.filter(m => m !== 'All')].map(m => (
                <Chip key={m} selected={muscle === m} onClick={() => setMuscle(m)}>{m}</Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {list.map(ex => {
              const on = added.has(ex.name)
              return (
                <ExerciseRow key={ex.name} icon={getExerciseIcon(ex)} name={ex.name} meta={ex.muscle}>
                  {on
                    ? <Button size="sm" variant="secondary" icon="mdi:check" onClick={() => toggle(ex)} aria-label={`Remove ${ex.name}`} aria-pressed="true">Added</Button>
                    : <Button size="sm" icon="mdi:plus" onClick={() => toggle(ex)} aria-label={`Add ${ex.name}`}>Add</Button>}
                </ExerciseRow>
              )
            })}
            {list.length === 0 && <p className="text-sm text-muted text-center py-4">No exercises found.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
            <label className="block">
              <span className="text-sm font-semibold text-ink-2 block mb-1">Name</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={80} className={`${INPUT} w-full px-3`} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-2 block mb-1">Minutes</span>
              <input type="number" inputMode="numeric" min="1" max={MAX_MINUTES} value={minutes} onChange={e => setMinutes(e.target.value)} className={`${INPUT} w-full px-3`} />
            </label>
          </div>

          {exercises.map((ex, i) => {
            const info = lookup(ex.name)
            const timed = exerciseMode(info) === 'time'
            const setRow = (k, patch) => changeEx(i, ex.sets.map((r, j) => (j === k ? { ...r, ...patch } : r)))
            return (
              <section key={ex.name} aria-label={ex.name} className="bg-surface border border-line rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon icon={getExerciseIcon(info)} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-ink break-words">{ex.name}</span>
                  <IconButton icon="mdi:close" label={`Remove ${ex.name}`} tone="danger" onClick={() => removeEx(i)} className="w-9 h-9" />
                </div>
                <div className="grid grid-cols-[2rem_1fr_1fr_2.25rem] gap-2 text-xs text-muted px-0.5" aria-hidden="true">
                  <span>Set</span><span>{unit}</span><span>{timed ? 'Seconds' : 'Reps'}</span><span />
                </div>
                {ex.sets.map((r, k) => (
                  <div key={k} className="grid grid-cols-[2rem_1fr_1fr_2.25rem] gap-2 items-center">
                    <span className="text-sm font-semibold text-ink-2 tabular-nums">{k + 1}</span>
                    <input type="number" inputMode="decimal" min="0" placeholder="0" value={r.weight}
                      aria-label={`${ex.name}, set ${k + 1} weight in ${unit}`}
                      onChange={e => setRow(k, { weight: e.target.value })} className={`${INPUT} w-full min-w-0 text-center`} />
                    <input type="number" inputMode={timed ? 'decimal' : 'numeric'} min="0" placeholder="0" value={r.reps}
                      aria-label={`${ex.name}, set ${k + 1} ${timed ? 'seconds' : 'reps'}`}
                      onChange={e => setRow(k, { reps: e.target.value })} className={`${INPUT} w-full min-w-0 text-center`} />
                    {ex.sets.length > 1
                      ? <IconButton icon="mdi:minus-circle-outline" label={`Remove set ${k + 1} of ${ex.name}`} onClick={() => changeEx(i, ex.sets.filter((_, j) => j !== k))} className="w-9 h-9" />
                      : <span />}
                  </div>
                ))}
                <Button size="sm" variant="secondary" icon="mdi:plus" onClick={() => changeEx(i, [...ex.sets, { ...ex.sets[ex.sets.length - 1] }])}>Add set</Button>
              </section>
            )
          })}

          <Button variant="secondary" full icon="mdi:plus" onClick={() => setStep('pick')}>
            {count ? 'Add more exercises' : 'Pick exercises'}
          </Button>
        </>
      )}
    </Sheet>
  )
}
