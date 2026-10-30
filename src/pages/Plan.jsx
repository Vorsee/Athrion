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
import { personalTip } from '../../supabase/functions/generate-fitness-plan/plan.ts'
import { saveGoals, saveProfileWeight, fetchWorkoutHistory } from '../lib/api.js'
import { fetchMeasurements, fetchCheckinWeights, saveMeasurement, fetchCardio } from '../lib/progressApi.js'
import { strokeLabel } from '../lib/swim.js'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS, healthFrom } from '../lib/nutrition.js'
import { GoalCard, ResultsCard, GoalSheet, WeightSheet } from '../components/GoalProgress.jsx'
import { planProgress, mergeWeights, DAYS } from '../lib/planProgress.js'
import { weightPlan, isWeightGoal, goalProgress } from '../lib/weightGoal.js'
import { goalsLabel } from '../lib/goalPick.js'
import { localDateKey, todayKey } from '../lib/data.js'
import { sampleFor } from '../lib/sampleFor.js'
import ProLock from '../components/ProLock.jsx'
import PlanBuilding from '../components/PlanBuilding.jsx'
import { useUnit } from '../lib/units.js'
import { coachedWeek, swimsAsHistory, dayTargets, startableDay, weeklyReview } from '../lib/coaching.js'
import { liftProgress } from '../lib/liftGoals.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TODAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]

// "3 sets × 10 · 60s rest · Dumbbells", dropping parts that don't apply
function formatVolume(ex) {
  return ex.sets > 1 ? `${ex.sets} × ${ex.reps}` : ex.reps
}

// One line per exercise: name, sets × reps in neon, actions. Notes open from ⓘ.
// target: next session's numbers from the log (lib/coaching.js), shown under the name
function PlanExerciseCard({ ex, onSwap, target }) {
  const [swapping, setSwapping] = useState(false)
  const notes = [ex.intensityNote, ex.formTip, ex.easierVersion && `Easier: ${ex.easierVersion}`, ex.swappedFrom && `Swapped from ${ex.swappedFrom}`].filter(Boolean)
  const meta = target
    ? <span><span className="font-semibold text-neon-ink">Next: {target.text}</span>, {target.reason}</span>
    : ex.restSeconds > 0 && `${ex.restSeconds}s rest`
  return (
    <ExerciseRow icon={getExerciseIcon(ex)} name={ex.name} meta={meta} value={formatVolume(ex)}>
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
        Your answers are saved, but the plan wasn't finished. Try again: it takes about a minute.
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

      <PlanBuilding open={generating} />
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

// Today in one row: what the plan has on, and a way to start it. The exercises live on Train
// and in the weekly schedule below, not repeated here.
function TodayRow({ dayData, onGoToWorkout, onStartWorkout, onOpenSwim }) {
  if (!dayData) return null
  const isRest = dayData.type !== 'workout'
  const n = dayData.workout?.exercises?.length ?? 0
  const swim = dayData.sport === 'swim'
  return (
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon icon={isRest ? 'mdi:sleep' : swim ? 'mdi:swim' : 'mdi:dumbbell'} width={26} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
      <div className="grow basis-0 min-w-[8rem]">
        <div className="text-xs font-semibold text-neon-ink">Today</div>
        <div className="font-bold text-lg text-ink leading-tight break-words">{dayData.title}</div>
        <div className="text-xs text-muted">{isRest ? dayData.type.replace('_', ' ') : `${n} exercises · ${dayData.durationMinutes} min`}</div>
      </div>
      {isRest
        ? onGoToWorkout && <Button size="sm" variant="secondary" onClick={onGoToWorkout} className="ml-auto">Train anyway</Button>
        : swim ? onOpenSwim && <Button size="sm" icon="mdi:swim" onClick={onOpenSwim} className="ml-auto">Log swim</Button>
        : n > 0 && <Button size="sm" icon="mdi:play" onClick={() => (onStartWorkout ? onStartWorkout(dayData) : onGoToWorkout())} className="ml-auto">Start</Button>}
    </Card>
  )
}

// Everything the goal card and results need: the goal, weigh-ins and logged workouts
function useGoalData() {
  const [data, setData] = useState(null)
  async function load() {
    const [fp, measurements, checkins, workouts, cardio] = await Promise.all([
      fetchFitnessProfile().catch(() => null),
      fetchMeasurements().catch(() => []),
      fetchCheckinWeights().catch(() => []),
      fetchWorkoutHistory().catch(() => []),
      fetchCardio(500).catch(() => []),
    ])
    // Swims count as training days too, so the plan's pool sessions show as done
    const swims = swimsAsHistory(cardio, l => (l.stroke ? `${strokeLabel(l.stroke)} swim` : 'Swim'))
    setData({ fp, weights: mergeWeights(measurements, checkins), history: [...workouts, ...swims] })
  }
  useEffect(() => { load() }, [])
  return [data, load]
}

// Save today's weight: Progress, the profile, and so the goal ring
async function logWeight(lb, onProfileChange) {
  await saveMeasurement({ date: todayKey(), weight_lb: lb })
  await saveProfileWeight(lb).catch(() => {})
  onProfileChange?.()
}

// The goal fields saved with a goal (021): a fresh start today, and the weight target if any
function goalFields({ goal, secondaryGoals = [], targetLb, pace, plan, lifts = [] }, fp, profile) {
  const same = fp?.primary_goal === goal && (!targetLb || Number(fp?.target_weight_lb) === targetLb)
  return {
    primaryGoal: goal,
    secondaryGoals,
    goalStartDate: same && fp?.goal_start_date ? fp.goal_start_date : todayKey(),
    targetWeightLb: plan ? targetLb : null,
    goalPace: plan ? pace : null,
    goalStartWeightLb: plan ? (same && fp?.goal_start_weight_lb ? Number(fp.goal_start_weight_lb) : profile?.weight_lb) : null,
    goalTargetDate: plan?.targetDate ? localDateKey(plan.targetDate) : null,
    goalWeeklyLb: plan?.weeklyLb ?? null,
    goalLifts: lifts,
  }
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
          <span className="font-bold text-2xl text-ink">Weekly check-in</span>
          {week > 1 && <Fact icon="mdi:refresh">Adapted</Fact>}
          {plan.ai_model?.startsWith('fallback') && <span className="text-xs text-muted">Standard plan</span>}
        </div>
        {hasChanges && (
          <InfoButton title="What changed this week">
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
function WeeklySchedule({ schedule, onSwap, targetsFor }) {
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
                  {d.movedFrom && <p className="text-xs text-muted px-1">Moved from {d.movedFrom}, which was missed.</p>}
                  {exercises.length > 0
                    ? (() => { const t = targetsFor?.(d) ?? {}; return exercises.map((ex, i) => <PlanExerciseCard key={i} ex={ex} target={t[ex.name]} onSwap={onSwap && !d.movedFrom && (name => onSwap(day, i, name))} />) })()
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
// Coach's note: how the week is going, what went well, what to change, and what moved.
// Sundays (and Mondays, for the week just gone) it's the weekly review.
// ─────────────────────────────────────────────────────────────────────────────
function CoachCard({ review, moves, deload, week }) {
  // One line on where the week stands, the best thing and the one thing to change. The rest of the
  // review opens on tap (open by default on Sunday, when it's the weekly review).
  const sunday = new Date().getDay() === 0
  const [open, setOpen] = useState(sunday)
  const behind = review.status === 'behind'
  const win = review.wentWell[0], fix = review.change[0]
  const more = [...review.wentWell.slice(1).map(t => ['mdi:check', t]), ...review.change.slice(1).map(t => ['mdi:arrow-right', t])]
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${behind ? 'bg-warn' : 'bg-neon-stroke'}`} aria-hidden="true" />
        <div className="grow min-w-0">
          <div className="text-xs text-muted">{sunday ? 'Your weekly review' : "Coach's note"}{deload ? ` · Week ${week}, lighter` : ''}</div>
          <div className="font-semibold text-ink leading-tight">{review.headline}</div>
        </div>
        <InfoButton title="How your coach works">
          <div className="space-y-2 text-sm text-ink-2">
            <p>Each exercise shows next session's target from your log: one more rep, or the next weight once every set reaches the top of the range. Workout fills it in for you.</p>
            <p>Missed a workout? It moves to the next free day this week. Every 5th week is lighter: one set less and about 80% of your working weight.</p>
          </div>
        </InfoButton>
      </div>
      {(win || fix || moves.length > 0) && (
        <ul className="space-y-1.5 text-sm">
          {win && <li className="flex gap-2 text-ink"><Icon icon={/^New best/.test(win) ? 'mdi:trophy-outline' : 'mdi:check'} width={18} className="text-neon-ink flex-shrink-0 mt-px pop-in" aria-hidden="true" />{win}</li>}
          {fix && <li className="flex gap-2 text-ink-2"><Icon icon="mdi:arrow-right" width={18} className="text-muted flex-shrink-0 mt-px" aria-hidden="true" />{fix}</li>}
          {moves.map(m => (
            <li key={m.from} className="flex gap-2 text-ink-2"><Icon icon="mdi:calendar-arrow-right" width={18} className="text-muted flex-shrink-0 mt-px" aria-hidden="true" />
              {m.to ? <span>{m.title} moved to <span className="font-semibold text-ink">{m.to}</span></span> : <span>{m.title} missed, no free day left</span>}
            </li>
          ))}
        </ul>
      )}
      {more.length > 0 && (open ? (
        <ul className="space-y-1.5 text-sm text-ink-2 border-t border-line pt-3">
          {more.map(([icon, t]) => <li key={t} className="flex gap-2"><Icon icon={icon} width={18} className="text-muted flex-shrink-0 mt-px" aria-hidden="true" />{t}</li>)}
        </ul>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="press text-sm font-semibold text-neon-ink min-h-[36px]">Full review</button>
      ))}
    </Card>
  )
}

// The trainer's personal tip: written by the AI with the plan (coachingTip), else from the
// person's level and goal (personalTip in plan.ts)
function TipCard({ tip }) {
  if (!tip?.body) return null
  return (
    <section aria-label="Personal coaching tip" className="rounded-2xl border border-neon-stroke/30 bg-neon-tint p-5 space-y-2">
      <div className="text-xs font-semibold text-neon-ink flex items-center gap-1.5">
        <Icon icon="mdi:account-voice" width={16} aria-hidden="true" />Personal coaching tip
      </div>
      <h2 className="font-bold text-xl text-ink leading-snug tracking-tight">{tip.title}</h2>
      <p className="text-[0.9375rem] text-ink-2 leading-relaxed">{tip.body}</p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro lock: the real page with a sample plan, dimmed behind an upgrade card.
// Labelled as a sample, and without its calories, which would contradict the person's own on Food.
// ─────────────────────────────────────────────────────────────────────────────
function LockedPlan({ fp, onUpgrade, onStartSetup }) {
  const plan = sampleFor(fp)
  const planData = plan.plan_data
  const todayData = planData.weeklySchedule.find(d => d.day === TODAY_NAME) ?? null
  const noop = () => {}

  return (
    <ProLock onUpgrade={onUpgrade} title="Get a plan built for your goal"
      secondary={onStartSetup && { label: 'Answer the questions first, free', onClick: onStartSetup }}
      description="Behind this is an example. Yours is built for your goal, days and equipment, and coaches you every week."
      perks={[
        'Your target on every exercise: the weight and reps to beat',
        'A weekly review: what went well, what to change',
        'Missed days moved for you, and a lighter week every 5th',
      ]}>
      <div className="space-y-4 pt-2">
        <PageHeader icon={GOAL_ICONS[plan.primary_goal] ?? 'mdi:target'} title={`Sample: ${planData.summary.planName}`}
          facts={<>
            <Fact icon="mdi:eye-outline">Example plan</Fact>
            <Fact icon="mdi:calendar-range">{plan.duration_weeks} weeks</Fact>
            <Fact icon="mdi:calendar-check-outline">{workoutDays(planData, plan)} days a week</Fact>
            <Fact icon="mdi:target">{fp?.secondary_goals?.length ? goalsLabel([plan.primary_goal, ...fp.secondary_goals]) : GOAL_LABELS[plan.primary_goal]}</Fact>
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
  if (!isPro) return <FreePlan onUpgrade={onUpgrade} {...props} />
  return <PlanPage {...props} />
}

// Free: the person's own goal and results on top, the sample plan behind the lock below
function FreePlan({ onUpgrade, onStartSetup, profile, onProfileChange }) {
  const [data, reload] = useGoalData()
  const [sheet, setSheet] = useState(null) // 'goal' | 'weight'
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fp = data?.fp

  // No plan yet: the days they said they'd train stand in for its schedule
  const days = fp?.preferred_training_days?.length ? fp.preferred_training_days : DAYS.slice(0, fp?.workout_days_per_week ?? 3)
  const progress = data && planProgress({ schedule: days.map(day => ({ day, type: 'workout' })), history: data.history, start: fp?.goal_start_date ?? (fp?.created_at && localDateKey(fp.created_at)), weeks: 8 })

  async function saveGoal(spec, { upgrade = false } = {}) {
    setSaving(true); setErr('')
    try {
      const payload = { ...dbProfileToPayload(fp), ...goalFields(spec, fp, profile) }
      const nt = calculateNutritionTargets({
        sex: profile?.sex ?? 'other', weightLb: profile?.weight_lb ?? 154, heightCm: profile?.height_cm ?? 170, age: profile?.age ?? 30,
        activityLevel: payload.activityLevel ?? 'moderately_active', primaryGoal: spec.goal, health: healthFrom(payload),
        goalAdjustment: spec.plan?.dailyAdjustment ?? null,
      })
      await Promise.all([
        saveFitnessProfile(payload), saveNutritionTarget(nt),
        saveGoals({ calorie_goal: nt.calorieTarget, protein_goal: nt.proteinGrams, carb_goal: nt.carbGrams }),
      ])
      setSheet(null); await reload(); onProfileChange?.()
      // Build my plan: the goal is saved, now the Pro options
      if (upgrade) onUpgrade?.()
    } catch (e) { setErr(e.message || 'Could not save') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 pt-2">
      <h1 className="font-bold text-xl text-ink">Personal trainer</h1>
      {fp ? (
        <>
          <GoalCard fp={fp} profile={profile} weights={data.weights} progress={progress} history={data.history} onEditGoal={() => setSheet('goal')} onLogWeight={() => setSheet('weight')} />
          <TipCard tip={personalTip(dbProfileToPayload(fp))} />
          <ResultsCard fp={fp} weights={data.weights} progress={progress} history={data.history} />
        </>
      ) : data && onStartSetup && (
        <Card hero className="space-y-3">
          <div className="font-bold text-xl text-ink">Set your goal</div>
          <p className="text-sm text-ink-2">Tell us what you're working toward and by when. Your progress shows here every time you open Plan.</p>
          <Button full icon="mdi:target" onClick={onStartSetup}>Set my goal, free</Button>
        </Card>
      )}
      <LockedPlan fp={fp} onUpgrade={onUpgrade} />
      {sheet === 'goal' && <GoalSheet fp={fp} profile={profile} history={data?.history} upsell={!!onUpgrade} onClose={() => setSheet(null)} onSave={saveGoal} saving={saving} error={err} />}
      {sheet === 'weight' && <WeightSheet onClose={() => setSheet(null)} saving={saving} error={err}
        onSave={async lb => { setSaving(true); setErr(''); try { await logWeight(lb, onProfileChange); setSheet(null); await reload() } catch (e) { setErr(e.message || 'Could not save') } finally { setSaving(false) } }} />}
    </div>
  )
}

function PlanPage({ onGoToWorkout, onStartWorkout, onOpenSwim, profile, onProfileChange }) {
  const { unit } = useUnit()
  const [plan, setPlan]             = useState(undefined) // undefined=loading
  const [nutrition, setNutrition]   = useState(null)
  const [checkin, setCheckin]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showGoal, setShowGoal]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMode, setGenMode] = useState('new') // 'adapt' while the weekly update runs
  const [genError, setGenError]     = useState('')
  const [goalData, reloadGoal]      = useGoalData()
  const [showWeight, setShowWeight] = useState(false)
  const [weightBusy, setWeightBusy] = useState(false)
  const [weightErr, setWeightErr]   = useState('')

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

  // Rebuild the plan; with a goal spec ({ goal, targetLb, pace, plan } from GoalSheet) set that goal first
  async function handleRegenerate(spec, mode = 'new') {
    setShowGoal(false)
    setGenMode(mode)
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
        ...(spec ? goalFields(spec, dbProfile, profile) : {}),
        sex:      profile?.sex,
        weightLb: profile?.weight_lb,
        heightCm: profile?.height_cm,
        age:      profile?.age,
      }
      const goal = profilePayload.primaryGoal ?? 'general_fitness'
      // A new goal or weight target changes the calories, so they're recalculated
      const goalChanged = !!spec
      // The weekly rate for the plan's notes, from today's numbers
      const wp = isWeightGoal(goal) && profilePayload.targetWeightLb ? weightPlan({
        goal, pace: profilePayload.goalPace ?? 'steady', weightLb: profile?.weight_lb, targetLb: profilePayload.targetWeightLb,
        sex: profile?.sex, heightCm: profile?.height_cm, age: profile?.age, activityLevel: profilePayload.activityLevel,
      }) : null
      if (wp) profilePayload.goalWeeklyLb = wp.weeklyLb

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
          goalAdjustment: spec?.plan?.dailyAdjustment ?? null,
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
      await Promise.all([load(), reloadGoal()])
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
  const planSchedule = planData.weeklySchedule ?? []

  // The coaching: missed workouts moved to free days, a lighter week every 5th, targets per exercise
  const coached = goalData && coachedWeek({ plan, history: goalData.history, goalStartDate: goalData.fp?.goal_start_date })
  const progress = coached?.progress
  const deload = !!coached?.deload
  const { schedule, moves } = coached ?? { schedule: planSchedule, moves: [] }
  const todayData = schedule.find(d => d.day === TODAY_NAME) ?? null
  const targetsFor = d => (goalData ? dayTargets(d, goalData.history, { unit, deload }) : {})
  const fp = goalData?.fp
  const weightGoal = fp && isWeightGoal(fp.primary_goal) && fp.target_weight_lb
  const review = progress && weeklyReview({
    progress, history: goalData.history, deload, unit,
    goal: weightGoal ? goalProgress({
      startLb: Number(fp.goal_start_weight_lb ?? profile?.weight_lb), targetLb: Number(fp.target_weight_lb),
      startDate: fp.goal_start_date, targetDate: fp.goal_target_date, weights: goalData.weights,
    }) : null,
    liftPct: liftProgress(fp?.goal_lifts, goalData.history, fp?.goal_start_date)?.pct ?? null,
  })
  const startDay = d => onStartWorkout(startableDay(d, deload))

  async function saveWeight(lb) {
    setWeightBusy(true); setWeightErr('')
    try { await logWeight(lb, onProfileChange); setShowWeight(false); await reloadGoal() }
    catch (e) { setWeightErr(e.message || 'Could not save') } finally { setWeightBusy(false) }
  }

  // Check-in — was one saved in the last 7 days?
  const checkinFresh = checkin
    ? (Date.now() - new Date(checkin.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-4 pt-2">
      {/* Personal trainer: the goal, today, the coach, the week. Nothing else */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-bold text-xl text-ink">Personal trainer</h1>
        <IconButton icon="mdi:dots-horizontal" label="Change goal or rebuild plan" onClick={() => setShowGoal(true)} disabled={generating} className="-mr-1" />
      </div>
      <PlanBuilding open={generating} adapting={genMode === 'adapt'} />
      {genError && <InlineError>{genError}</InlineError>}

      {progress && <GoalCard fp={goalData.fp} profile={profile} weights={goalData.weights} progress={progress} history={goalData.history} animate
        onEditGoal={() => setShowGoal(true)} onLogWeight={() => setShowWeight(true)} />}

      <TipCard tip={planData.coachingTip ?? (goalData?.fp ? personalTip(dbProfileToPayload(goalData.fp)) : null)} />

      <TodayRow dayData={todayData} onGoToWorkout={onGoToWorkout} onStartWorkout={onStartWorkout && startDay} onOpenSwim={onOpenSwim} />

      {review && <CoachCard review={review} moves={moves} deload={deload} week={progress.week} />}

      <WeeklySchedule schedule={schedule} onSwap={handleSwap} targetsFor={targetsFor} />

      <AdaptCard plan={plan} checkin={checkin} checkinFresh={checkinFresh} generating={generating}
        onAdapt={() => handleRegenerate(undefined, 'adapt')} onCheckin={() => setShowCheckin(true)} />

      {progress && <ResultsCard fp={goalData.fp} weights={goalData.weights} progress={progress} history={goalData.history} />}

      {showGoal && (
        <GoalSheet fp={goalData?.fp} profile={profile} history={goalData?.history} rebuilds onClose={() => setShowGoal(false)} onSave={spec => handleRegenerate(spec)} />
      )}
      {showWeight && <WeightSheet onClose={() => setShowWeight(false)} onSave={saveWeight} saving={weightBusy} error={weightErr} />}

      {showCheckin && (
        <CheckinModal
          planId={plan.id}
          onProfileChange={onProfileChange}
          onClose={() => setShowCheckin(false)}
          onSaved={() => {
            fetchLatestCheckin().then(setCheckin).catch(() => {})
            reloadGoal()
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
