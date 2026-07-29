import { useState, useEffect } from 'react'
import {
  fetchActivePlan, fetchLatestNutritionTarget, fetchLatestCheckin, saveCheckin,
  fetchFitnessProfile, generatePlan, dbProfileToPayload, dbNutritionToPayload,
} from '../lib/fitnessApi.js'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TODAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]

function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{children}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// No Plan State — with regenerate button
// ─────────────────────────────────────────────────────────────────────────────
function NoPlan({ onRegenerate, generating, genError }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-5 px-4">
      <div className="text-5xl">📋</div>
      <div className="font-bebas text-2xl text-white tracking-wide">No Active Plan</div>
      <p className="text-sm text-gray-500 max-w-xs">
        Your preferences were saved but the plan generation didn't finish. Tap below to try again — it takes about 15–30 seconds.
      </p>

      {genError && (
        <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400 text-left">
          {genError}
        </div>
      )}

      <button onClick={onRegenerate} disabled={generating}
        className="w-full max-w-xs bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest disabled:opacity-50 transition-all hover:shadow-[0_6px_24px_rgba(200,241,53,0.35)] flex items-center justify-center gap-2">
        {generating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Building your plan...
          </>
        ) : 'Generate My Plan →'}
      </button>

      {generating && (
        <p className="text-xs text-gray-600">Claude AI is crafting your personalized program...</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's Workout
// ─────────────────────────────────────────────────────────────────────────────
function TodayWorkout({ dayData }) {
  const [expanded, setExpanded] = useState(false)

  if (!dayData) return null

  const isRest = dayData.type !== 'workout'
  const exercises = dayData.workout?.exercises ?? []

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <SectionLabel>Today · {TODAY_NAME}</SectionLabel>
          <div className="font-semibold text-white text-sm">{dayData.title}</div>
          {!isRest && (
            <div className="text-xs text-gray-500 mt-0.5">{dayData.durationMinutes} min · {exercises.length} exercises</div>
          )}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
          isRest ? 'bg-[#222] text-gray-600' : 'bg-neon/15 text-neon border border-neon/20'
        }`}>
          {isRest ? dayData.type.replace('_', ' ') : 'Workout'}
        </span>
      </div>

      {isRest && dayData.recoveryNotes && (
        <p className="text-xs text-gray-500">{dayData.recoveryNotes}</p>
      )}

      {!isRest && exercises.length > 0 && (
        <>
          {/* Warmup */}
          {dayData.workout?.warmup?.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-gray-700 uppercase tracking-widest mb-1.5">Warm-up</div>
              {dayData.workout.warmup.map((w, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon/40 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-gray-300">{w.name}</span>
                    <span className="text-xs text-gray-700 ml-2">{w.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Exercises */}
          <div className="space-y-2.5">
            {(expanded ? exercises : exercises.slice(0, 3)).map((ex, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{ex.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{ex.sets} sets × {ex.reps} · {ex.restSeconds}s rest</div>
                    {ex.formTip && <div className="text-xs text-gray-700 mt-1 italic">{ex.formTip}</div>}
                  </div>
                  <div className="text-xs text-gray-700 text-right flex-shrink-0">
                    <div>{ex.intensityNote}</div>
                    {ex.equipment && <div className="mt-0.5">{ex.equipment}</div>}
                  </div>
                </div>
                {ex.easierVersion && (
                  <div className="mt-2 text-[10px] text-gray-700">Easier: {ex.easierVersion}</div>
                )}
              </div>
            ))}
          </div>

          {exercises.length > 3 && (
            <button onClick={() => setExpanded(e => !e)}
              className="w-full text-xs text-gray-600 hover:text-white mt-2 py-1.5 border border-[#222] rounded-xl transition-colors">
              {expanded ? 'Show less ↑' : `Show ${exercises.length - 3} more ↓`}
            </button>
          )}

          {/* Cooldown */}
          {expanded && dayData.workout?.cooldown?.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-gray-700 uppercase tracking-widest mb-1.5">Cool-down</div>
              {dayData.workout.cooldown.map((c, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-gray-300">{c.name}</span>
                    <span className="text-xs text-gray-700 ml-2">{c.duration}</span>
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
  const cals = n.dailyCalories ?? n.calorie_target
  const protein = n.proteinGrams ?? n.protein_grams
  const carbs = n.carbGrams ?? n.carb_grams
  const fat = n.fatGrams ?? n.fat_grams

  return (
    <Card>
      <SectionLabel>Daily Nutrition Targets</SectionLabel>
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: 'Calories', val: cals, color: 'text-neon' },
          { label: 'Protein', val: `${protein}g`, color: 'text-white' },
          { label: 'Carbs', val: `${carbs}g`, color: 'text-white' },
          { label: 'Fat', val: `${fat}g`, color: 'text-white' },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div className={`font-bebas text-xl ${color}`}>{val}</div>
            <div className="text-[10px] text-gray-600 uppercase">{label}</div>
          </div>
        ))}
      </div>
      {(n.hydrationAdvice || n.hydration_advice) && (
        <p className="text-xs text-gray-600 mt-3 border-t border-[#222] pt-3">
          💧 {n.hydrationAdvice ?? n.hydration_advice}
        </p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Schedule
// ─────────────────────────────────────────────────────────────────────────────
function WeeklySchedule({ schedule }) {
  if (!schedule?.length) return null
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return (
    <Card>
      <SectionLabel>Weekly Schedule</SectionLabel>
      <div className="space-y-1.5">
        {DAYS.map(day => {
          const d = schedule.find(s => s.day === day)
          if (!d) return null
          const isToday = day === TODAY_NAME
          const isWorkout = d.type === 'workout'
          return (
            <div key={day} className={`flex items-center justify-between py-2 px-3 rounded-xl transition-all ${
              isToday ? 'bg-neon/10 border border-neon/20' : ''
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`text-xs font-semibold w-8 ${isToday ? 'text-neon' : 'text-gray-600'}`}>
                  {day.slice(0, 3)}
                </div>
                <div className={`text-xs ${isToday ? 'text-white' : 'text-gray-500'}`}>
                  {d.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isWorkout && d.durationMinutes > 0 && (
                  <span className="text-[10px] text-gray-700">{d.durationMinutes}m</span>
                )}
                <span className={`w-2 h-2 rounded-full ${isWorkout ? 'bg-neon' : 'bg-[#333]'}`} />
              </div>
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
      <SectionLabel>Top Priorities</SectionLabel>
      <div className="space-y-2">
        {advice.topPriorities.map((tip, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-neon/15 border border-neon/20 flex items-center justify-center flex-shrink-0 text-[10px] text-neon font-bold">{i + 1}</div>
            <p className="text-xs text-gray-400 leading-relaxed">{tip}</p>
          </div>
        ))}
      </div>
      {advice.sleepAdvice && (
        <div className="mt-3 pt-3 border-t border-[#222]">
          <div className="text-[10px] text-gray-700 uppercase tracking-widest mb-1">Sleep</div>
          <p className="text-xs text-gray-500">{advice.sleepAdvice}</p>
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
    <Card className="border-amber-500/20 bg-amber-500/5">
      <SectionLabel>Safety Notes</SectionLabel>
      {safety.warnings?.map((w, i) => (
        <p key={i} className="text-xs text-amber-400 mb-1">⚠️ {w}</p>
      ))}
      {safety.exercisesToAvoid?.length > 0 && (
        <p className="text-xs text-amber-500/70 mt-1">Avoid: {safety.exercisesToAvoid.join(', ')}</p>
      )}
      {safety.professionalAdviceRecommended && (
        <p className="text-xs text-amber-400/60 mt-2">Professional guidance recommended before starting.</p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-in Modal
// ─────────────────────────────────────────────────────────────────────────────
const SLIDER_FIELDS = [
  { key: 'energyLevel',  label: 'Energy Level',  min: 1, max: 5 },
  { key: 'sleepQuality', label: 'Sleep Quality',  min: 1, max: 5 },
  { key: 'soreness',     label: 'Soreness',       min: 1, max: 5 },
  { key: 'stressLevel',  label: 'Stress Level',   min: 1, max: 5 },
]

function CheckinModal({ planId, onClose, onSaved }) {
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
        weight_lb: weight ? Number(weight) : null,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#111] border-t border-[#1e1e1e] rounded-t-2xl p-5 pb-10 space-y-5">
        <div className="flex items-center justify-between">
          <div className="font-bebas text-2xl text-white tracking-wide">Weekly Check-In</div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xl transition-colors">✕</button>
        </div>

        {SLIDER_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500 uppercase tracking-widest">{label}</div>
              <div className="font-bebas text-lg text-neon">{vals[key]}/5</div>
            </div>
            <input type="range" min={1} max={5} step={1} value={vals[key]}
              onChange={e => setVals(v => ({ ...v, [key]: Number(e.target.value) }))}
              className="w-full accent-neon" />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Weight (lb)</div>
            <input type="number" min={60} max={600} placeholder="Optional"
              value={weight} onChange={e => setWeight(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40" />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Workouts This Week</div>
            <input type="number" min={0} max={14} placeholder="Optional"
              value={workouts} onChange={e => setWorkouts(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40" />
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Notes (Optional)</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="How's the plan feeling? Anything to flag?"
            rows={2} maxLength={1000}
            className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40 resize-none" />
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest disabled:opacity-50 transition-all hover:shadow-[0_6px_24px_rgba(200,241,53,0.35)]">
          {saving ? 'Saving...' : 'Save Check-In'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Plan() {
  const [plan, setPlan]             = useState(undefined) // undefined=loading
  const [nutrition, setNutrition]   = useState(null)
  const [checkin, setCheckin]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showCheckin, setShowCheckin] = useState(false)
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

  async function handleRegenerate() {
    setGenerating(true)
    setGenError('')
    try {
      // Fetch saved profile and nutrition target from DB
      const [dbProfile, dbNutrition] = await Promise.all([
        fetchFitnessProfile(),
        fetchLatestNutritionTarget(),
      ])

      if (!dbProfile) throw new Error('No fitness profile found. Please contact support.')

      // Convert DB snake_case rows to camelCase for the Edge Function
      const profilePayload = dbProfileToPayload(dbProfile)

      // Use saved nutrition targets if available, otherwise recalculate
      const nutritionPayload = dbNutrition
        ? dbNutritionToPayload(dbNutrition)
        : calculateNutritionTargets({
            sex: 'other', weightLb: 154, heightCm: 170, age: 30,
            activityLevel: dbProfile.activity_level ?? 'moderately_active',
            primaryGoal: dbProfile.primary_goal ?? 'general_fitness',
          })

      await generatePlan(profilePayload, nutritionPayload)
      // Reload the plan after generation
      await load()
    } catch (e) {
      setGenError(e.message || 'Generation failed. Check your internet connection and try again.')
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-gray-700 text-sm animate-pulse">Loading your plan...</div>
    </div>
  )

  if (!plan) return (
    <NoPlan onRegenerate={handleRegenerate} generating={generating} genError={genError} />
  )

  const planData = plan.plan_data ?? {}
  const schedule = planData.weeklySchedule ?? []
  const todayData = schedule.find(d => d.day === TODAY_NAME) ?? null
  const summary = planData.summary ?? {}
  const goalLabel = GOAL_LABELS[plan.primary_goal] ?? plan.primary_goal
  const goalIcon = GOAL_ICONS[plan.primary_goal] ?? '🎯'

  // Check-in — was one saved in the last 7 days?
  const checkinFresh = checkin
    ? (Date.now() - new Date(checkin.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-4 pt-2">
      {/* Plan header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xl">{goalIcon}</span>
          <div className="font-bebas text-2xl text-white tracking-wide leading-none">{summary.planName ?? goalLabel}</div>
        </div>
        <div className="text-xs text-gray-600">
          {summary.durationWeeks ?? plan.duration_weeks} weeks · {plan.training_days_per_week} days/week · {goalLabel}
        </div>
      </div>

      {/* Today */}
      {todayData && <TodayWorkout dayData={todayData} />}

      {/* Nutrition */}
      <NutritionCard planNutrition={planData.nutrition} dbNutrition={nutrition} />

      {/* Weekly schedule */}
      <WeeklySchedule schedule={schedule} />

      {/* Advice */}
      {planData.advice && <AdviceCard advice={planData.advice} />}

      {/* Safety */}
      {planData.safety && <SafetyCard safety={planData.safety} />}

      {/* Progression */}
      {planData.progression?.weeklyStrategy && (
        <Card>
          <SectionLabel>Progression Strategy</SectionLabel>
          <p className="text-xs text-gray-400 leading-relaxed">{planData.progression.weeklyStrategy}</p>
          {planData.progression.deloadGuidance && (
            <p className="text-xs text-gray-600 mt-2">{planData.progression.deloadGuidance}</p>
          )}
        </Card>
      )}

      {/* Check-in button */}
      <div className="pt-2">
        {checkinFresh ? (
          <div className="text-center">
            <div className="text-xs text-gray-600">Check-in done this week</div>
            <button onClick={() => setShowCheckin(true)} className="text-xs text-neon mt-1 hover:underline">Do another →</button>
          </div>
        ) : (
          <button onClick={() => setShowCheckin(true)}
            className="w-full border border-neon/30 text-neon font-semibold py-3 rounded-xl text-sm hover:bg-neon/10 transition-all uppercase tracking-widest">
            Weekly Check-In
          </button>
        )}
      </div>

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
