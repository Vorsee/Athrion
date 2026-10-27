import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, Segmented, Fact, ExerciseRow, InlineError } from '../components/ui/index.js'
import { EXERCISES, getExerciseIcon } from '../lib/data.js'
import { fetchCustomWorkouts, saveCustomWorkout } from '../lib/api.js'
import { GUIDE_GOALS, GUIDE_PLACES, guidePlan, guideWorkoutName, rememberGuidePick, clearGuidePick } from '../lib/guidePlans.js'
import { FREE_WORKOUT_LIMIT, TRIAL_DAYS } from '../lib/pricing.js'
import Brand from '../components/Brand.jsx'

const PROGRESS = [
  ['mdi:arrow-up-bold-outline', 'Hit the top of the rep range on every set, then add a little weight or a harder variation.'],
  ['mdi:gauge', 'Stop each set with 1–2 good reps left. Hard, not ugly.'],
  ['mdi:notebook-outline', 'Log every set, so next week you know exactly what to beat.'],
]

// Adds the three sessions as saved workouts, skipping ones already there and stopping at the free limit
async function addPlanWorkouts(plan, isPro) {
  const existing = await fetchCustomWorkouts()
  const names = new Set(existing.map(w => w.name))
  let room = isPro ? Infinity : FREE_WORKOUT_LIMIT - existing.length
  let added = 0, skipped = 0
  for (const d of plan.days.filter(d => d.type === 'workout')) {
    const name = guideWorkoutName(d.title)
    if (names.has(name)) continue
    if (room <= 0) { skipped++; continue }
    await saveCustomWorkout(name, d.exercises.map(e => e.name))
    room--; added++
  }
  return { added, skipped }
}

// Public free-week page (athrion.app/workout). Signed out it leads to sign-up; signed in it saves the workouts.
export default function Guide({ signedIn = false, isPro = false, initialPick, onStart, onSignIn, onDone }) {
  const params = new URLSearchParams(window.location.search)
  const [goal, setGoal]   = useState(initialPick?.goal || params.get('goal') || 'muscle')
  const [place, setPlace] = useState(initialPick?.place || params.get('place') || 'gym')
  const [save, setSave]   = useState({ step: 'idle' }) // idle | working | done | error
  const plan = guidePlan(goal, place)
  const sessions = plan.days.filter(d => d.type === 'workout')

  function start() {
    rememberGuidePick(plan.goal, plan.place)
    onStart?.()
  }

  async function add() {
    setSave({ step: 'working' })
    try {
      const res = await addPlanWorkouts(plan, isPro)
      clearGuidePick()
      setSave({ step: 'done', ...res })
    } catch {
      setSave({ step: 'error' })
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm">
      <header className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
        <Brand />
        {signedIn
          ? <button onClick={onDone} className="press min-h-[44px] px-3 text-sm font-semibold text-ink-2 hover:text-ink">Open app</button>
          : <button onClick={onSignIn} className="press min-h-[44px] px-3 text-sm font-semibold text-ink-2 hover:text-ink">Sign in</button>}
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-40 space-y-6">
        <section className="pt-4">
          <span className="inline-flex text-xs font-semibold text-on-neon bg-neon rounded-md px-2 py-0.5">Free plan</span>
          <h1 className="font-bold text-[2.25rem] xs:text-5xl leading-[1.05] tracking-tight mt-3">Your 7-day workout plan</h1>
          <p className="text-ink-2 text-base mt-4">Pick your goal and where you train. Every session with sets, reps and rest, ready to follow.</p>
        </section>

        <section className="space-y-3" aria-label="Choose your plan">
          <Segmented kind="choice" label="Goal" options={GUIDE_GOALS} value={plan.goal} onChange={g => { setGoal(g); setSave({ step: 'idle' }) }} />
          <Segmented kind="choice" label="Where you train" options={GUIDE_PLACES} value={plan.place} onChange={p => { setPlace(p); setSave({ step: 'idle' }) }} />
        </section>

        <Card hero>
          <div className="flex flex-wrap gap-1.5">
            <Fact icon="mdi:dumbbell">{sessions.length} workouts</Fact>
            <Fact icon="mdi:timer-outline">40–55 min</Fact>
            <Fact icon="mdi:account-check-outline">Beginner friendly</Fact>
          </div>
          <p className="text-sm text-ink-2 mt-3">{plan.intro}</p>
        </Card>

        <ol className="space-y-3" aria-label="Your week">
          {plan.days.map(d => <DayCard key={d.day} day={d} />)}
        </ol>

        <Card>
          <h2 className="font-bold text-lg">How to progress</h2>
          <ul className="mt-3 space-y-3">
            {PROGRESS.map(([icon, text]) => (
              <li key={icon} className="flex gap-3 text-sm text-ink-2">
                <Icon icon={icon} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card tone="neon">
          <h2 className="font-bold text-lg">Want week two built around you?</h2>
          <p className="text-sm text-ink-2 mt-1.5">
            ATHRION Pro writes a plan from your goal, schedule and equipment, sets your calories, and adjusts both every week.
            Free for {TRIAL_DAYS} days.
          </p>
        </Card>
      </main>

      {/* The one action, always in reach */}
      <div className="fixed bottom-0 inset-x-0 bg-canvas/95 backdrop-blur border-t border-line" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          {!signedIn && <>
            <Button full onClick={start}>Start this plan free</Button>
            <p className="text-xs text-muted text-center">Free account, no card. The {sessions.length} workouts land in your Train tab.</p>
          </>}
          {signedIn && save.step === 'done' && <>
            <p role="status" className="text-sm text-ink text-center">
              {save.added
                ? `Added ${save.added} workout${save.added === 1 ? '' : 's'} to Train.`
                : save.skipped ? 'No room for new workouts.' : 'These workouts are already in Train.'}
              {save.skipped > 0 && ` Free accounts keep ${FREE_WORKOUT_LIMIT} saved workouts; delete one or get Pro for the rest.`}
            </p>
            <Button full onClick={onDone}>Open Train</Button>
          </>}
          {signedIn && save.step === 'error' && (
            <InlineError onRetry={add}>Could not save the workouts.</InlineError>
          )}
          {signedIn && (save.step === 'idle' || save.step === 'working') && <>
            <Button full onClick={add} disabled={save.step === 'working'}>
              {save.step === 'working' ? 'Adding…' : 'Add to my workouts'}
            </Button>
            <p className="text-xs text-muted text-center">Saves the {sessions.length} sessions to your Train tab.</p>
          </>}
        </div>
      </div>
    </div>
  )
}

function DayCard({ day }) {
  if (day.type !== 'workout') return (
    <li className="flex gap-3 items-start bg-surface border border-line rounded-2xl px-4 py-3.5">
      <Icon icon={day.type === 'cardio' ? 'mdi:walk' : 'mdi:sleep'} width={22} className="text-muted flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <div className="text-sm font-semibold text-ink">Day {day.day} · {day.title}</div>
        <p className="text-xs text-muted mt-0.5">{day.note}</p>
      </div>
    </li>
  )
  return (
    <li>
      <Card>
        <div className="text-xs font-semibold text-neon-ink">Day {day.day}</div>
        <h2 className="font-bold text-xl mt-0.5">{day.title}</h2>
        <div className="space-y-1.5 mt-3">
          {day.exercises.map(e => {
            const ex = EXERCISES.find(x => x.name === e.name)
            return (
              <ExerciseRow key={e.name} icon={ex ? getExerciseIcon(ex) : 'mdi:dumbbell'} name={e.name}
                meta={`Rest ${e.rest}`} value={`${e.sets} × ${e.reps}`} />
            )
          })}
        </div>
      </Card>
    </li>
  )
}
