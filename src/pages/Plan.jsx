import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, PageSkeleton, InlineError } from '../components/ui/index.js'
import { getExerciseIcon } from '../lib/data.js'
import Sheet from '../components/Sheet.jsx'
import { DemoButton, SwapSheet } from '../components/ExerciseDemo.jsx'
import {
  fetchActivePlan, fetchLatestNutritionTarget, fetchLatestCheckin, saveCheckin,
  fetchFitnessProfile, saveFitnessProfile, saveNutritionTarget, generatePlan,
  dbProfileToPayload, dbNutritionToPayload, updatePlanData,
} from '../lib/fitnessApi.js'
import { saveGoals } from '../lib/api.js'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'
import { SAMPLE_PLAN } from '../lib/samplePlan.js'
import ProLock from '../components/ProLock.jsx'
import { useUnit } from '../lib/units.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TODAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]

// "3 sets × 10 · 60s rest · Dumbbells", dropping parts that don't apply
function formatVolume(ex) {
  const parts = [ex.sets > 1 ? `${ex.sets} sets × ${ex.reps}` : ex.reps]
  if (ex.restSeconds > 0) parts.push(`${ex.restSeconds}s rest`)
  if (ex.equipment) parts.push(ex.equipment)
  return parts.filter(Boolean).join(' · ')
}

function PlanExerciseCard({ ex, onSwap }) {
  const [swapping, setSwapping] = useState(false)
  return (
    <div className="bg-raised rounded-xl p-3">
      <div className="flex items-start gap-3">
        <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-muted mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink leading-snug break-words">{ex.name}</div>
          <div className="text-xs text-muted mt-0.5">{formatVolume(ex)}</div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <DemoButton name={ex.name} />
          {onSwap && (
            <button onClick={() => setSwapping(true)} aria-label={`Swap ${ex.name}`}
              className="w-8 h-8 rounded-lg bg-line hover:bg-line-strong flex items-center justify-center text-muted hover:text-neon-ink transition-colors">
              <Icon icon="mdi:swap-horizontal" width={18} />
            </button>
          )}
        </div>
      </div>
      {(ex.intensityNote || ex.formTip || ex.easierVersion || ex.swappedFrom) && (
        <div className="mt-2 pl-[34px] space-y-1 text-xs leading-relaxed break-words">
          {ex.intensityNote && <div className="text-muted">{ex.intensityNote}</div>}
          {ex.formTip && <div className="text-muted italic">{ex.formTip}</div>}
          {ex.easierVersion && <div className="text-muted">Easier: {ex.easierVersion}</div>}
          {ex.swappedFrom && <div className="text-muted">Swapped from {ex.swappedFrom}</div>}
        </div>
      )}
      {swapping && (
        <SwapSheet exercise={ex} onClose={() => setSwapping(false)}
          onSwap={name => { setSwapping(false); onSwap(name) }} />
      )}
    </div>
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
function TodayWorkout({ dayData, onGoToWorkout, onSwap }) {
  if (!dayData) return null

  const isRest = dayData.type !== 'workout'
  const exercises = dayData.workout?.exercises ?? []

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-medium text-muted mb-0.5">Today · {TODAY_NAME}</div>
          <div className="text-lg leading-[1.3] font-semibold text-ink">{dayData.title}</div>
          {!isRest && (
            <div className="text-xs text-muted mt-0.5">{dayData.durationMinutes} min · {exercises.length} exercises</div>
          )}
        </div>
        {isRest && <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-line text-muted capitalize">{dayData.type.replace('_', ' ')}</span>}
      </div>

      {isRest && dayData.recoveryNotes && (
        <p className="text-xs text-muted">{dayData.recoveryNotes}</p>
      )}

      {isRest && onGoToWorkout && (
        <Button variant="secondary" full onClick={onGoToWorkout} className="mt-4">Train anyway</Button>
      )}

      {!isRest && exercises.length > 0 && (
        <>
          {/* Warmup */}
          {dayData.workout?.warmup?.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-muted mb-1.5">Warm-up</div>
              {dayData.workout.warmup.map((w, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon/40 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-ink-2">{w.name}</span>
                    <span className="text-xs text-muted ml-2">{w.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Exercises */}
          <div className="space-y-2.5">
            {exercises.map((ex, i) => (
              <PlanExerciseCard key={i} ex={ex} onSwap={onSwap && (name => onSwap(dayData.day, i, name))} />
            ))}
          </div>

          {onGoToWorkout && (
            <Button full onClick={onGoToWorkout} className="mt-4">Start this workout</Button>
          )}

          {/* Cooldown */}
          {dayData.workout?.cooldown?.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted mb-1.5">Cool-down</div>
              {dayData.workout.cooldown.map((c, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-info/40 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-ink-2">{c.name}</span>
                    <span className="text-xs text-muted ml-2">{c.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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

  return (
    <Card>
      <SectionTitle>Daily nutrition targets</SectionTitle>
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: 'Calories', val: cals, color: 'text-neon-ink' },
          { label: 'Protein', val: `${protein}g`, color: 'text-ink' },
          { label: 'Carbs', val: `${carbs}g`, color: 'text-ink' },
          { label: 'Fat', val: `${fat}g`, color: 'text-ink' },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div className={`font-bold text-lg ${color}`}>{val}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      {(n.hydrationAdvice || n.hydration_advice) && (
        <p className="text-xs text-muted mt-3 border-t border-line pt-3">
          {n.hydrationAdvice ?? n.hydration_advice}
        </p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly adaptation
// ─────────────────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000

function AdaptCard({ plan, checkin, generating, onAdapt }) {
  const adaptation = plan.plan_data?.adaptation
  const week = plan.plan_data?.week ?? 1
  const planAgeDays = (Date.now() - new Date(plan.created_at).getTime()) / DAY_MS
  const checkinSincePlan = checkin && new Date(checkin.created_at) > new Date(plan.created_at)
  const ready = planAgeDays >= 6 || checkinSincePlan
  const nextDate = new Date(new Date(plan.created_at).getTime() + 7 * DAY_MS)

  return (
    <Card>
      <SectionTitle action={plan.ai_model?.startsWith('fallback') && <span className="text-xs text-muted">Standard plan</span>}>
        Week {week}{week > 1 ? ' · adapted' : ''}
      </SectionTitle>
      {adaptation?.summary && <p className="text-xs text-muted leading-relaxed">{adaptation.summary}</p>}
      {adaptation?.changes?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {adaptation.changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted">
              <Icon icon="mdi:refresh" width={14} className="text-neon-ink mt-0.5 flex-shrink-0" /><span className="break-words">{c}</span>
            </li>
          ))}
        </ul>
      )}
      {ready ? (
        <Button full onClick={onAdapt} disabled={generating} className="mt-3">
          {generating ? 'Adapting your plan...' : `Adapt week ${week + 1} to my progress`}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Do your weekly check-in or wait until {nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} to adapt next week to your progress.
        </p>
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
                  <div className={`text-xs font-semibold w-8 flex-shrink-0 ${isToday ? 'text-neon-ink' : 'text-muted'}`}>
                    {day.slice(0, 3)}
                  </div>
                  <div className={`text-xs break-words ${isToday ? 'text-ink' : 'text-muted'}`}>{d.title}</div>
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
function AdviceCard({ advice }) {
  if (!advice?.topPriorities?.length) return null
  return (
    <Card>
      <SectionTitle>Top priorities</SectionTitle>
      <div className="space-y-2">
        {advice.topPriorities.map((tip, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-neon/15 border border-neon-stroke/20 flex items-center justify-center flex-shrink-0 text-xs text-neon-ink font-bold">{i + 1}</div>
            <p className="text-xs text-muted leading-relaxed">{tip}</p>
          </div>
        ))}
      </div>
      {advice.sleepAdvice && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-xs text-muted mb-1">Sleep</div>
          <p className="text-xs text-muted">{advice.sleepAdvice}</p>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety Card
// ─────────────────────────────────────────────────────────────────────────────
function SafetyCard({ safety }) {
  if (!safety || (!safety.warnings?.length && !safety.exercisesToAvoid?.length)) return null
  return (
    <Card tone="warn">
      <SectionTitle>Safety notes</SectionTitle>
      {safety.warnings?.map((w, i) => (
        <p key={i} className="text-xs text-warn mb-1">{w}</p>
      ))}
      {safety.exercisesToAvoid?.length > 0 && (
        <p className="text-xs text-warn mt-1">Avoid: {safety.exercisesToAvoid.join(', ')}</p>
      )}
      {safety.professionalAdviceRecommended && (
        <p className="text-xs text-warn mt-2">Professional guidance recommended before starting.</p>
      )}
    </Card>
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

function CheckinModal({ planId, onClose, onSaved }) {
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
        Your plan, calories and macros will be rebuilt for the new goal. Takes about 30–60 seconds.
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
// Pro lock: the real page with a sample plan, dimmed behind an upgrade card
// ─────────────────────────────────────────────────────────────────────────────
function LockedPlan({ onUpgrade, onStartSetup }) {
  const plan = SAMPLE_PLAN
  const planData = plan.plan_data
  const todayData = planData.weeklySchedule.find(d => d.day === TODAY_NAME) ?? null
  const noop = () => {}

  return (
    <ProLock onUpgrade={onUpgrade} title="Get a plan built for your goal"
      secondary={onStartSetup && { label: 'Answer the questions first, free', onClick: onStartSetup }}
      description="Your week of workouts, sets and reps from a few questions about you. It adapts every week from your check-ins.">
      <div className="space-y-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Icon icon={GOAL_ICONS[plan.primary_goal]} width={22} className="text-neon-ink" />
            <div className="font-bold text-xl text-ink leading-none">{planData.summary.planName}</div>
          </div>
          <div className="text-xs text-muted">
            {plan.duration_weeks} weeks · {plan.training_days_per_week} days/week · {GOAL_LABELS[plan.primary_goal]}
          </div>
        </div>
        {todayData && <TodayWorkout dayData={todayData} />}
        <NutritionCard planNutrition={planData.nutrition} dbNutrition={null} />
        <WeeklySchedule schedule={planData.weeklySchedule} onSwap={noop} />
        <AdviceCard advice={planData.advice} />
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

function PlanPage({ onGoToWorkout, profile, onProfileChange }) {
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
      {/* Plan header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Icon icon={goalIcon} width={22} className="text-neon-ink" />
          <div className="font-bold text-xl text-ink leading-none">{summary.planName ?? goalLabel}</div>
        </div>
        <div className="text-xs text-muted">
          {summary.durationWeeks ?? plan.duration_weeks} weeks · {plan.training_days_per_week} days/week · {goalLabel}
        </div>
        <button onClick={() => setShowGoal(true)} disabled={generating}
          className="mt-3 w-full border border-line-strong text-ink-2 font-semibold py-2.5 rounded-xl text-xs hover:border-neon-stroke/40 hover:text-neon-ink transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {generating ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-neon-stroke/30 border-t-neon-stroke rounded-full animate-spin" />
              Rebuilding your plan...
            </>
          ) : 'Change goal or regenerate'}
        </button>
        {genError && <InlineError className="mt-2">{genError}</InlineError>}
      </div>

      <AdaptCard plan={plan} checkin={checkin} generating={generating} onAdapt={() => handleRegenerate(undefined, 'adapt')} />

      {/* Today */}
      {todayData && <TodayWorkout dayData={todayData} onGoToWorkout={onGoToWorkout} onSwap={handleSwap} />}

      {/* Nutrition */}
      <NutritionCard planNutrition={planData.nutrition} dbNutrition={nutrition} />

      {/* Weekly schedule */}
      <WeeklySchedule schedule={schedule} onSwap={handleSwap} />

      {/* Advice */}
      {planData.advice && <AdviceCard advice={planData.advice} />}

      {/* Safety */}
      {planData.safety && <SafetyCard safety={planData.safety} />}

      {/* Progression */}
      {planData.progression?.weeklyStrategy && (
        <Card>
          <SectionTitle>Progression strategy</SectionTitle>
          <p className="text-xs text-muted leading-relaxed">{planData.progression.weeklyStrategy}</p>
          {planData.progression.deloadGuidance && (
            <p className="text-xs text-muted mt-2">{planData.progression.deloadGuidance}</p>
          )}
        </Card>
      )}

      {/* Check-in button */}
      <div className="pt-2">
        {checkinFresh ? (
          <div className="text-center">
            <div className="text-sm font-semibold text-ink-2">Check-in done this week</div>
            <button onClick={() => setShowCheckin(true)} className="text-xs text-neon-ink mt-1 hover:underline">Do another</button>
          </div>
        ) : (
          <button onClick={() => setShowCheckin(true)}
            className="w-full border border-neon-stroke/30 text-neon-ink font-semibold py-3 rounded-xl text-sm hover:bg-neon/10 transition-all">
            Weekly check-in
          </button>
        )}
      </div>

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
          onClose={() => setShowCheckin(false)}
          onSaved={() => {
            fetchLatestCheckin().then(setCheckin).catch(() => {})
          }}
        />
      )}
    </div>
  )
}
