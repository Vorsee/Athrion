import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, PageSkeleton, InlineError, InfoButton, Fact, PageHeader, IconButton, ExerciseRow, ActionRow, BigNumber, StatTiles } from '../components/ui/index.js'
import { getExerciseIcon } from '../lib/data.js'
import Sheet from '../components/Sheet.jsx'
import { DemoButton, SwapSheet } from '../components/ExerciseDemo.jsx'
import {
  fetchActivePlan, fetchLatestNutritionTarget, fetchLatestCheckin, saveCheckin,
  fetchFitnessProfile, saveFitnessProfile, saveNutritionTarget, generatePlan,
  dbProfileToPayload, dbNutritionToPayload, updatePlanData,
} from '../lib/fitnessApi.js'
import { saveGoals, saveProfileWeight } from '../lib/api.js'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS, healthFrom } from '../lib/nutrition.js'
import { SAMPLE_PLAN } from '../lib/samplePlan.js'
import ProLock from '../components/ProLock.jsx'
import { useUnit } from '../lib/units.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TODAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]

// "3 sets × 10 · 60s rest · Dumbbells", dropping parts that don't apply
function formatVolume(ex) {
  return ex.sets > 1 ? `${ex.sets} × ${ex.reps}` : ex.reps
}

// One line per exercise: name, sets × reps in neon, actions. Notes open from ⓘ.
function PlanExerciseCard({ ex, onSwap }) {
  const [swapping, setSwapping] = useState(false)
  const notes = [ex.intensityNote, ex.formTip, ex.easierVersion && `Easier: ${ex.easierVersion}`, ex.swappedFrom && `Swapped from ${ex.swappedFrom}`].filter(Boolean)
  return (
    <ExerciseRow icon={getExerciseIcon(ex)} name={ex.name} meta={ex.restSeconds > 0 && `${ex.restSeconds}s rest`} value={formatVolume(ex)}>
        {notes.length > 0 && (
          <InfoButton title={ex.name} label={`Notes for ${ex.name}`}>
            <ul className="space-y-2 text-sm text-ink-2">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </InfoButton>
        )}
        <DemoButton name={ex.name} />
        {onSwap && (
          <button onClick={() => setSwapping(true)} aria-label={`Swap ${ex.name}`}
            className="press w-9 h-9 rounded-lg bg-line hover:bg-line-strong flex items-center justify-center text-muted hover:text-neon-ink transition-colors">
            <Icon icon="mdi:swap-horizontal" width={18} />
          </button>
        )}
      {swapping && (
        <SwapSheet exercise={ex} onClose={() => setSwapping(false)}
          onSwap={name => { setSwapping(false); onSwap(name) }} />
      )}
    </ExerciseRow>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// No Plan State — with regenerate button
// ─────────────────────────────────────────────────────────────────────────────
function NoPlan({ onRegenerate, generating, genError }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-5 px-4">
      <Icon icon="mdi:clipboard-text-outline" width={48} className="mx-auto text-muted" />
      <div className="font-bold text-xl text-ink">No active plan</div>
      <p className="text-sm text-muted max-w-xs">
        Your preferences were saved but the plan generation didn't finish. Tap below to try again — it takes about 15–30 seconds.
      </p>

      {genError && <InlineError className="w-full text-left">{genError}</InlineError>}

      <Button full onClick={onRegenerate} disabled={generating} className="max-w-xs">
        {generating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-on-neon/30 border-t-on-neon rounded-full animate-spin" />
            Building your plan...
          </>
        ) : 'Generate my plan'}
      </Button>

      {generating && (
        <p className="text-xs text-muted">Writing your plan...</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's Workout
// ─────────────────────────────────────────────────────────────────────────────
function TodayWorkout({ dayData, onGoToWorkout, onStartWorkout, onSwap }) {
  if (!dayData) return null

  const isRest = dayData.type !== 'workout'
  const exercises = dayData.workout?.exercises ?? []
  const warmup = dayData.workout?.warmup ?? []
  const cooldown = dayData.workout?.cooldown ?? []

  return (
    <Card hero={!isRest}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neon-ink mb-1">Today</div>
          <div className="font-bold text-2xl text-ink leading-tight break-words">{dayData.title}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {isRest
              ? <Fact icon="mdi:sleep">{dayData.type.replace('_', ' ')}</Fact>
              : <><Fact icon="mdi:clock-outline">{dayData.durationMinutes} min</Fact><Fact icon="mdi:dumbbell">{exercises.length} exercises</Fact></>}
          </div>
        </div>
        {(warmup.length > 0 || cooldown.length > 0 || (isRest && dayData.recoveryNotes)) && (
          <InfoButton title={isRest ? 'Recovery' : 'Warm-up and cool-down'}>
            {isRest && <p className="text-sm text-ink-2">{dayData.recoveryNotes}</p>}
            {[['Warm-up', warmup], ['Cool-down', cooldown]].map(([label, items]) => items.length > 0 && (
              <div key={label}>
                <div className="text-sm font-semibold text-ink mb-1.5">{label}</div>
                <ul className="space-y-1.5">
                  {items.map((w, i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm"><span className="text-ink-2">{w.name}</span><span className="text-muted flex-shrink-0">{w.duration}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </InfoButton>
        )}
      </div>

      {!isRest && exercises.length > 0 && (
        <div className="space-y-2">
          {exercises.map((ex, i) => (
            <PlanExerciseCard key={i} ex={ex} onSwap={onSwap && (name => onSwap(dayData.day, i, name))} />
          ))}
        </div>
      )}

      {isRest
        ? onGoToWorkout && <Button variant="secondary" full onClick={onGoToWorkout} className="mt-4">Train anyway</Button>
        : (onStartWorkout || onGoToWorkout) && exercises.length > 0 && (
          <Button full icon="mdi:play" onClick={() => (onStartWorkout ? onStartWorkout(dayData) : onGoToWorkout())} className="mt-4">Start this workout</Button>
        )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutrition Targets Card
// ─────────────────────────────────────────────────────────────────────────────
function NutritionCard({ planNutrition, dbNutrition }) {
  const n = planNutrition ?? dbNutrition
  if (!n) return null
  // The latest saved target wins: adaptive updates change it without a new plan
  const cals = dbNutrition?.calorie_target ?? n.dailyCalories
  const protein = dbNutrition?.protein_grams ?? n.proteinGrams
  const carbs = dbNutrition?.carb_grams ?? n.carbGrams
  const fat = dbNutrition?.fat_grams ?? n.fatGrams
  const hydration = n.hydrationAdvice ?? n.hydration_advice

  return (
    <Card>
      <SectionTitle action={hydration && <InfoButton title="Hydration">{<p className="text-sm text-ink-2">{hydration}</p>}</InfoButton>}>
        Daily targets
      </SectionTitle>
      <BigNumber value={cals} unit="kcal" />
      <StatTiles className="mt-3" items={[['Protein', `${protein}g`], ['Carbs', `${carbs}g`], ['Fat', `${fat}g`]]} />
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly adaptation
// ─────────────────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000

// This week: the check-in and the adapt action together; what changed sits behind ⓘ
function AdaptCard({ plan, checkin, checkinFresh, generating, onAdapt, onCheckin }) {
  const adaptation = plan.plan_data?.adaptation
  const week = plan.plan_data?.week ?? 1
  const planAgeDays = (Date.now() - new Date(plan.created_at).getTime()) / DAY_MS
  const checkinSincePlan = checkin && new Date(checkin.created_at) > new Date(plan.created_at)
  const ready = planAgeDays >= 6 || checkinSincePlan
  const nextDate = new Date(new Date(plan.created_at).getTime() + 7 * DAY_MS)
  const hasChanges = adaptation?.summary || adaptation?.changes?.length

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-2xl text-ink">Week {week}</span>
          {week > 1 && <Fact icon="mdi:refresh">Adapted</Fact>}
          {plan.ai_model?.startsWith('fallback') && <span className="text-xs text-muted">Standard plan</span>}
        </div>
        {hasChanges && (
          <InfoButton title={`What changed in week ${week}`}>
            {adaptation.summary && <p className="text-sm text-ink-2">{adaptation.summary}</p>}
            {adaptation.changes?.length > 0 && (
              <ul className="space-y-2">
                {adaptation.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                    <Icon icon="mdi:refresh" width={16} className="text-neon-ink mt-0.5 flex-shrink-0" /><span className="break-words">{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoButton>
        )}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button variant={checkinFresh ? 'secondary' : 'primary'} icon={checkinFresh ? 'mdi:check' : 'mdi:clipboard-text-outline'} onClick={onCheckin}>
          {checkinFresh ? 'Checked in' : 'Check in'}
        </Button>
        <Button variant={ready && checkinFresh ? 'primary' : 'secondary'} icon="mdi:auto-fix" onClick={onAdapt} disabled={generating || !ready}>
          {generating ? 'Adapting…' : `Adapt week ${week + 1}`}
        </Button>
      </div>
      {!ready && (
        <p className="text-xs text-muted mt-2 text-center">Adapting opens {nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, or after a check-in</p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Schedule
// ─────────────────────────────────────────────────────────────────────────────
function WeeklySchedule({ schedule, onSwap }) {
  const [openDay, setOpenDay] = useState(null)
  if (!schedule?.length) return null
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return (
    <Card>
      <SectionTitle>Weekly schedule</SectionTitle>
      <div className="space-y-1.5">
        {DAYS.map(day => {
          const d = schedule.find(s => s.day === day)
          if (!d) return null
          const isToday = day === TODAY_NAME
          const isWorkout = d.type === 'workout'
          const exercises = d.workout?.exercises ?? []
          const open = openDay === day
          return (
            <div key={day} className={`rounded-xl transition-all ${isToday ? 'bg-neon/10 border border-neon-stroke/20' : ''}`}>
              <button onClick={() => setOpenDay(open ? null : day)}
                className="w-full flex items-center justify-between gap-2 py-2 px-3 text-left">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`text-sm font-bold w-9 flex-shrink-0 ${isToday || isWorkout ? 'text-neon-ink' : 'text-muted'}`}>
                    {day.slice(0, 3)}
                  </div>
                  <div className={`text-sm break-words ${isWorkout ? 'text-ink font-semibold' : 'text-muted'}`}>{d.title}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isWorkout && d.durationMinutes > 0 && (
                    <span className="text-xs text-muted">{d.durationMinutes}m</span>
                  )}
                  <span className={`w-2 h-2 rounded-full ${isWorkout ? 'bg-neon' : 'bg-line-strong'}`} />
                  <Icon icon={open ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={16} className="text-muted" />
                </div>
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-2">
                  {exercises.length > 0
                    ? exercises.map((ex, i) => <PlanExerciseCard key={i} ex={ex} onSwap={onSwap && (name => onSwap(day, i, name))} />)
                    : <p className="text-xs text-muted px-1">{d.recoveryNotes || 'Rest day.'}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Advice Card
// ─────────────────────────────────────────────────────────────────────────────
// Priorities, sleep and progression live in one sheet instead of three cards of text
function CoachNotes({ advice, progression }) {
  const [open, setOpen] = useState(false)
  const tips = advice?.topPriorities ?? []
  if (!tips.length && !advice?.sleepAdvice && !progression?.weeklyStrategy) return null
  return (
    <>
      <ActionRow icon="mdi:lightbulb-on-outline" title="Coach notes" onClick={() => setOpen(true)}
        badge={tips.length > 0 && <Fact>{tips.length} priorities</Fact>} />
      {open && (
        <Sheet title="Coach notes" onClose={() => setOpen(false)}>
          {tips.length > 0 && (
            <ol className="space-y-3">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-neon text-on-neon flex items-center justify-center flex-shrink-0 text-xs font-bold">{i + 1}</span>
                  <p className="text-sm text-ink-2">{tip}</p>
                </li>
              ))}
            </ol>
          )}
          {advice?.sleepAdvice && <NoteBlock icon="mdi:sleep" title="Sleep">{advice.sleepAdvice}</NoteBlock>}
          {progression?.weeklyStrategy && <NoteBlock icon="mdi:trending-up" title="Progression">{progression.weeklyStrategy}{progression.deloadGuidance ? ` ${progression.deloadGuidance}` : ''}</NoteBlock>}
        </Sheet>
      )}
    </>
  )
}

function NoteBlock({ icon, title, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon icon={icon} width={20} className="text-neon-ink mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div><div className="text-sm font-semibold text-ink">{title}</div><p className="text-sm text-ink-2 mt-0.5">{children}</p></div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety Card
// ─────────────────────────────────────────────────────────────────────────────
// Kept visible, as one tap: the count shows there is something to read
function SafetyCard({ safety }) {
  const [open, setOpen] = useState(false)
  const items = [...(safety?.warnings ?? []), ...(safety?.exercisesToAvoid?.length ? [`Avoid: ${safety.exercisesToAvoid.join(', ')}`] : [])]
  if (!items.length) return null
  return (
    <>
      <ActionRow tone="warn" icon="mdi:alert-outline" title={`Safety notes · ${items.length}`} onClick={() => setOpen(true)} />
      {open && (
        <Sheet title="Safety notes" onClose={() => setOpen(false)}>
          <ul className="space-y-2">{items.map((w, i) => <li key={i} className="text-sm text-ink-2">{w}</li>)}</ul>
          {safety.professionalAdviceRecommended && <p className="text-sm font-semibold text-warn">Get professional guidance before starting.</p>}
        </Sheet>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-in Modal
// ─────────────────────────────────────────────────────────────────────────────
const SLIDER_FIELDS = [
  { key: 'energyLevel',  label: 'Energy level',  min: 1, max: 5 },
  { key: 'sleepQuality', label: 'Sleep quality',  min: 1, max: 5 },
  { key: 'soreness',     label: 'Soreness',       min: 1, max: 5 },
  { key: 'stressLevel',  label: 'Stress level',   min: 1, max: 5 },
]

function CheckinModal({ planId, onClose, onSaved, onProfileChange }) {
  const { unit, toLb } = useUnit()
  const [vals, setVals]     = useState({ energyLevel: 3, sleepQuality: 3, soreness: 2, stressLevel: 2 })
  const [weight, setWeight] = useState('')
  const [notes, setNotes]   = useState('')
  const [workouts, setWorkouts] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await saveCheckin({
        fitness_plan_id: planId,
        weight_lb: weight ? toLb(weight) : null,
        energy_level: vals.energyLevel,
        sleep_quality: vals.sleepQuality,
        soreness_level: vals.soreness,
        stress_level: vals.stressLevel,
        workouts_completed: workouts ? Number(workouts) : null,
        notes: notes.trim().slice(0, 1000),
      })
      // Today's weight is the newest one, so it's the profile weight now
      if (weight) await saveProfileWeight(toLb(weight)).then(() => onProfileChange?.()).catch(() => {})
      onSaved()
      onClose()
    } catch (e) {
      setErr(e.message || 'Failed to save check-in')
      setSaving(false)
    }
  }

  return (
    <Sheet title="Weekly check-in" onClose={onClose} footer={
      <Button full onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save check-in'}</Button>
    }>

        {SLIDER_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted">{label}</div>
              <div className="font-bold text-lg text-neon-ink">{vals[key]}/5</div>
            </div>
            <input type="range" min={1} max={5} step={1} value={vals[key]}
              onChange={e => setVals(v => ({ ...v, [key]: Number(e.target.value) }))}
              className="w-full accent-neon" />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-2 mb-1">Weight ({unit})</div>
            <input type="number" min={unit === 'kg' ? 27 : 60} max={unit === 'kg' ? 272 : 600} placeholder="Optional"
              value={weight} onChange={e => setWeight(e.target.value)}
              className="w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-2 mb-1">Workouts this week</div>
            <input type="number" min={0} max={14} placeholder="Optional"
              value={workouts} onChange={e => setWorkouts(e.target.value)}
              className="w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-ink-2 mb-1">Notes (optional)</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="How's the plan feeling? Anything to flag?"
            rows={2} maxLength={1000}
            className="w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40 resize-none" />
        </div>

        {err && <InlineError>{err}</InlineError>}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Goal Modal
// ─────────────────────────────────────────────────────────────────────────────
function GoalModal({ currentGoal, onClose, onConfirm }) {
  const [goal, setGoal] = useState(currentGoal)
  const changed = goal !== currentGoal

  return (
    <Sheet title="Change goal" onClose={onClose} footer={
      <Button full onClick={() => onConfirm(goal)}>
        {changed ? `Rebuild for ${GOAL_LABELS[goal].toLowerCase()}` : 'Regenerate plan'}
      </Button>
    }>
      <p className="text-xs text-muted">
        Rebuilds your plan and daily targets. Takes about a minute.
      </p>
      <div className="grid grid-cols-2 gap-2 pb-2">
        {Object.entries(GOAL_LABELS).map(([id, label]) => (
          <button key={id} onClick={() => setGoal(id)}
            className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left text-sm transition-all ${
              goal === id
                ? 'border-neon-stroke bg-neon/10 text-ink'
                : 'border-line bg-surface text-muted hover:border-line-strong'
            }`}>
            <Icon icon={GOAL_ICONS[id]} width={20} className="text-neon-ink" />
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro lock: the real page with a sample plan, dimmed behind an upgrade card.
// Labelled as a sample, and without its calories, which would contradict the person's own on Food.
// ─────────────────────────────────────────────────────────────────────────────
function LockedPlan({ onUpgrade, onStartSetup }) {
  const plan = SAMPLE_PLAN
  const planData = plan.plan_data
  const todayData = planData.weeklySchedule.find(d => d.day === TODAY_NAME) ?? null
  const noop = () => {}

  return (
    <ProLock onUpgrade={onUpgrade} title="Get a plan built for your goal"
      secondary={onStartSetup && { label: 'Answer the questions first, free', onClick: onStartSetup }}
      description="Behind this is an example. Yours is built from a few questions about your goal, schedule and equipment, and adapts every week from your check-ins.">
      <div className="space-y-4 pt-2">
        <PageHeader icon={GOAL_ICONS[plan.primary_goal]} title={`Sample: ${planData.summary.planName}`}
          facts={<>
            <Fact icon="mdi:eye-outline">Example plan</Fact>
            <Fact icon="mdi:calendar-range">{plan.duration_weeks} weeks</Fact>
            <Fact icon="mdi:calendar-check-outline">{workoutDays(planData, plan)} days a week</Fact>
            <Fact icon="mdi:target">{GOAL_LABELS[plan.primary_goal]}</Fact>
          </>} />
        {todayData && <TodayWorkout dayData={todayData} />}
        <WeeklySchedule schedule={planData.weeklySchedule} onSwap={noop} />
        <CoachNotes advice={planData.advice} progression={planData.progression} />
      </div>
    </ProLock>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Plan({ isPro, onUpgrade, ...props }) {
  if (!isPro) return <LockedPlan onUpgrade={onUpgrade} onStartSetup={props.onStartSetup} />
  return <PlanPage {...props} />
}

function PlanPage({ onGoToWorkout, onStartWorkout, profile, onProfileChange }) {
  const [plan, setPlan]             = useState(undefined) // undefined=loading
  const [nutrition, setNutrition]   = useState(null)
  const [checkin, setCheckin]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showGoal, setShowGoal]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [p, n, c] = await Promise.all([
        fetchActivePlan(),
        fetchLatestNutritionTarget(),
        fetchLatestCheckin(),
      ])
      setPlan(p ?? null)
      setNutrition(n)
      setCheckin(c)
    } catch (e) {
      console.error('Plan load error:', e)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  // Replace one exercise in the active plan, keeping its sets, reps and rest
  async function handleSwap(day, index, newName) {
    const data = structuredClone(plan.plan_data)
    const dayData = data.weeklySchedule.find(d => d.day === day)
    const old = dayData.workout.exercises[index]
    dayData.workout.exercises[index] = {
      ...old,
      name: newName,
      swappedFrom: old.swappedFrom ?? old.name,
      formTip: '', easierVersion: '', harderVersion: '', equipment: '',
    }
    const prev = plan
    setPlan({ ...plan, plan_data: data })
    try {
      await updatePlanData(plan.id, data)
    } catch (e) {
      setPlan(prev)
      setGenError(e.message || 'Could not save the swap')
    }
  }

  // Rebuild the plan, optionally switching to a new primary goal first
  async function handleRegenerate(newGoal, mode = 'new') {
    setShowGoal(false)
    setGenerating(true)
    setGenError('')
    try {
      const [dbProfile, dbNutrition] = await Promise.all([
        fetchFitnessProfile(),
        fetchLatestNutritionTarget(),
      ])

      if (!dbProfile) throw new Error('No fitness profile found. Please contact support.')

      // Convert DB snake_case rows to camelCase for the Edge Function, plus body stats
      const profilePayload = {
        ...dbProfileToPayload(dbProfile),
        sex:      profile?.sex,
        weightLb: profile?.weight_lb,
        heightCm: profile?.height_cm,
        age:      profile?.age,
      }
      const goal = newGoal ?? profilePayload.primaryGoal ?? 'general_fitness'
      const goalChanged = goal !== profilePayload.primaryGoal
      profilePayload.primaryGoal = goal

      // Calories and macros depend on the goal, so recalculate when it changes
      let nutritionPayload
      if (dbNutrition && !goalChanged) {
        nutritionPayload = dbNutritionToPayload(dbNutrition)
      } else {
        nutritionPayload = calculateNutritionTargets({
          sex:      profile?.sex ?? 'other',
          weightLb: profile?.weight_lb ?? 154,
          heightCm: profile?.height_cm ?? 170,
          age:      profile?.age ?? 30,
          activityLevel: profilePayload.activityLevel ?? 'moderately_active',
          primaryGoal: goal,
          health: healthFrom(profilePayload),
        })
        await Promise.all([
          saveNutritionTarget(nutritionPayload),
          saveGoals({
            calorie_goal: nutritionPayload.calorieTarget,
            protein_goal: nutritionPayload.proteinGrams,
            carb_goal:    nutritionPayload.carbGrams,
          }),
        ])
      }

      if (goalChanged) await saveFitnessProfile(profilePayload)

      await generatePlan(profilePayload, nutritionPayload, mode)
      await load()
      // Calorie goals and the fitness profile live in App state too
      onProfileChange?.()
    } catch (e) {
      setGenError(e.message || 'Generation failed. Check your internet connection and try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <PageSkeleton label="Loading your plan" />

  if (!plan) return (
    <NoPlan onRegenerate={() => handleRegenerate()} generating={generating} genError={genError} />
  )

  const planData = plan.plan_data ?? {}
  const schedule = planData.weeklySchedule ?? []
  const todayData = schedule.find(d => d.day === TODAY_NAME) ?? null
  const summary = planData.summary ?? {}
  const goalLabel = GOAL_LABELS[plan.primary_goal] ?? plan.primary_goal
  const goalIcon = GOAL_ICONS[plan.primary_goal] ?? 'mdi:target'

  // Check-in — was one saved in the last 7 days?
  const checkinFresh = checkin
    ? (Date.now() - new Date(checkin.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-4 pt-2">
      {/* Plan header: name, key facts, one menu for rebuilding */}
      <PageHeader icon={goalIcon} title={summary.planName ?? goalLabel}
        action={<IconButton icon="mdi:dots-horizontal" label="Change goal or rebuild plan" onClick={() => setShowGoal(true)} disabled={generating} className="-mr-1" />}
        facts={<>
          <Fact icon="mdi:calendar-range">{summary.durationWeeks ?? plan.duration_weeks} weeks</Fact>
          <Fact icon="mdi:calendar-check-outline">{workoutDays(plan.plan_data, plan)} days a week</Fact>
          <Fact icon="mdi:target">{goalLabel}</Fact>
        </>}>
        {generating && <p role="status" className="text-sm font-semibold text-neon-ink mt-2">Rebuilding your plan…</p>}
        {genError && <InlineError className="mt-2">{genError}</InlineError>}
      </PageHeader>

      {/* Today */}
      {todayData && <TodayWorkout dayData={todayData} onGoToWorkout={onGoToWorkout} onStartWorkout={onStartWorkout} onSwap={handleSwap} />}

      <AdaptCard plan={plan} checkin={checkin} checkinFresh={checkinFresh} generating={generating}
        onAdapt={() => handleRegenerate(undefined, 'adapt')} onCheckin={() => setShowCheckin(true)} />

      {/* Nutrition */}
      <NutritionCard planNutrition={planData.nutrition} dbNutrition={nutrition} />

      {/* Weekly schedule */}
      <WeeklySchedule schedule={schedule} onSwap={handleSwap} />

      {planData.safety && <SafetyCard safety={planData.safety} />}
      <CoachNotes advice={planData.advice} progression={planData.progression} />

      {showGoal && (
        <GoalModal
          currentGoal={plan.primary_goal}
          onClose={() => setShowGoal(false)}
          onConfirm={handleRegenerate}
        />
      )}

      {showCheckin && (
        <CheckinModal
          planId={plan.id}
          onProfileChange={onProfileChange}
          onClose={() => setShowCheckin(false)}
          onSaved={() => {
            fetchLatestCheckin().then(setCheckin).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

// Days the plan actually trains, not the number asked for during setup
function workoutDays(planData, plan) {
  const n = planData?.weeklySchedule?.filter(d => d.type === 'workout').length
  return n || plan.training_days_per_week
}
