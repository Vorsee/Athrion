import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, BackLink } from '../components/ui/index.js'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS, HEALTH_OPTS, DIET_OPTS, chipsFrom } from '../lib/nutrition.js'
import { saveFitnessProfile, saveNutritionTarget, generatePlan } from '../lib/fitnessApi.js'
import { saveGoals } from '../lib/api.js'
import { TRIAL_DAYS } from '../lib/pricing.js'
import { useBackHandler } from '../lib/shell.js'
import Brand from '../components/Brand.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

const ACTIVITY_OPTS = [
  { id: 'sedentary',         label: 'Sedentary',          sub: 'Little or no exercise, desk job' },
  { id: 'lightly_active',    label: 'Lightly active',     sub: '1–3 days of light exercise/week' },
  { id: 'moderately_active', label: 'Moderately active',  sub: '3–5 days of moderate exercise' },
  { id: 'very_active',       label: 'Very active',        sub: '6–7 days of hard exercise' },
  { id: 'athlete',           label: 'Athlete',            sub: 'Twice daily or intense sport' },
]

const EXPERIENCE_OPTS = [
  { id: 'beginner',     label: 'Beginner',      sub: 'Less than 1 year of consistent training' },
  { id: 'intermediate', label: 'Intermediate',  sub: '1–3 years of regular training' },
  { id: 'advanced',     label: 'Advanced',      sub: '3+ years with a structured program' },
]

const LOCATION_OPTS = [
  { id: 'gym',     label: 'Gym',      icon: 'mdi:dumbbell' },
  { id: 'home',    label: 'Home',     icon: 'mdi:home-outline' },
  { id: 'outdoors',label: 'Outdoors', icon: 'mdi:pine-tree' },
  { id: 'any',     label: 'Flexible', icon: 'mdi:shuffle-variant' },
]

const OTHER_PREFIX = 'Other: '

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const GOAL_OPTS = Object.entries(GOAL_LABELS).map(([id, label]) => ({ id, label, icon: GOAL_ICONS[id] }))

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────

function ProgressDots({ step }) {
  return (
    <div className="flex gap-2 justify-center mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className={`h-1 rounded-full transition-all duration-500 ${
          i === step ? 'w-8 bg-neon' : i < step ? 'w-4 bg-neon/40' : 'w-4 bg-line-strong'
        }`} />
      ))}
    </div>
  )
}

function RadioCard({ selected, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left ${
        selected ? 'bg-neon/10 border-neon-stroke/50' : 'bg-raised border-line hover:border-line-strong'
      }`}>
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
        selected ? 'border-neon-stroke bg-neon' : 'border-line-strong'
      }`}>
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-on-neon" />}
      </div>
      {children}
    </button>
  )
}

function ToggleChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
        active ? 'bg-neon/15 border-neon-stroke/50 text-neon-ink' : 'bg-raised border-line text-muted hover:border-line-strong'
      }`}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Primary Goal
// ─────────────────────────────────────────────────────────────────────────────
function GoalStep({ goal, setGoal, onNext }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="font-bold text-3xl text-ink leading-tight">What's your<br/>main goal?</div>
        <div className="text-sm text-muted mt-1">Step 1 of {TOTAL_STEPS} · This shapes your entire plan</div>
      </div>
      <div className="space-y-2">
        {GOAL_OPTS.map(o => (
          <RadioCard key={o.id} selected={goal === o.id} onClick={() => setGoal(o.id)}>
            <Icon icon={o.icon} width={20} className="text-neon-ink flex-shrink-0" />
            <div className="font-semibold text-sm text-ink">{o.label}</div>
          </RadioCard>
        ))}
      </div>
      <Button full onClick={onNext} disabled={!goal} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Activity & Experience
// ─────────────────────────────────────────────────────────────────────────────
function ActivityStep({ activityLevel, setActivityLevel, experienceLevel, setExperienceLevel, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Activity level</div>
        <div className="text-sm text-muted mt-1">Step 2 of {TOTAL_STEPS}</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">Current activity</div>
        <div className="space-y-2">
          {ACTIVITY_OPTS.map(o => (
            <RadioCard key={o.id} selected={activityLevel === o.id} onClick={() => setActivityLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${activityLevel === o.id ? 'text-ink' : 'text-ink-2'}`}>{o.label}</div>
                <div className="text-xs text-muted">{o.sub}</div>
              </div>
            </RadioCard>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">Training experience</div>
        <div className="space-y-2">
          {EXPERIENCE_OPTS.map(o => (
            <RadioCard key={o.id} selected={experienceLevel === o.id} onClick={() => setExperienceLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${experienceLevel === o.id ? 'text-ink' : 'text-ink-2'}`}>{o.label}</div>
                <div className="text-xs text-muted">{o.sub}</div>
              </div>
            </RadioCard>
          ))}
        </div>
      </div>

      <Button full onClick={onNext} disabled={!activityLevel || !experienceLevel} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Workout Setup
// ─────────────────────────────────────────────────────────────────────────────
function WorkoutSetupStep({ workoutDays, setWorkoutDays, sessionDuration, setSessionDuration,
  location, setLocation, trainingDays, setTrainingDays, onNext, onBack }) {

  function toggleDay(d) {
    setTrainingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const DURATION_OPTS = [20, 30, 45, 60, 75, 90]

  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Workout setup</div>
        <div className="text-sm text-muted mt-1">Step 3 of {TOTAL_STEPS}</div>
      </div>

      {/* Days per week */}
      <div>
        <div className="text-xs text-muted mb-2">
          Days per week <span className="text-neon-ink">{workoutDays}</span>
        </div>
        <input type="range" min={1} max={7} value={workoutDays}
          onChange={e => setWorkoutDays(Number(e.target.value))}
          className="w-full accent-neon" />
        <div className="flex justify-between text-xs text-muted mt-1">
          <span>1 day</span><span>7 days</span>
        </div>
      </div>

      {/* Session duration */}
      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">Session duration</div>
        <div className="flex gap-2 flex-wrap">
          {DURATION_OPTS.map(d => (
            <button key={d} onClick={() => setSessionDuration(d)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                sessionDuration === d ? 'bg-neon/15 border-neon-stroke/50 text-neon-ink' : 'bg-raised border-line text-muted'
              }`}>
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Where you train */}
      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">Where you train</div>
        <div className="grid grid-cols-2 gap-2">
          {LOCATION_OPTS.map(o => (
            <button key={o.id} onClick={() => setLocation(o.id)}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold transition-all ${
                location === o.id ? 'bg-neon/10 border-neon-stroke/50 text-ink' : 'bg-raised border-line text-muted'
              }`}>
              <Icon icon={o.icon} width={18} className="text-neon-ink" />{o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preferred days */}
      <div>
        <div className="text-xs text-muted mb-2">Preferred days <span className="text-muted normal-case">(optional)</span></div>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(d => (
            <ToggleChip key={d} active={trainingDays.includes(d)} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</ToggleChip>
          ))}
        </div>
      </div>

      <Button full onClick={onNext} disabled={!location} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Health and diet (optional)
// ─────────────────────────────────────────────────────────────────────────────
function HealthStep({ health, setHealth, diet, setDiet, other, setOther, onNext, onBack }) {
  const toggle = (list, set, id) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const doctor = HEALTH_OPTS.some(o => o.doctor && health.includes(o.id))
  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink leading-tight">Anything your plan<br/>should work around?</div>
        <div className="text-sm text-muted mt-1">Step 4 of {TOTAL_STEPS} · Optional, skip if none apply</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">Health</div>
        <div className="flex flex-wrap gap-2">
          {HEALTH_OPTS.map(o => <ToggleChip key={o.id} active={health.includes(o.id)} onClick={() => toggle(health, setHealth, o.id)}>{o.label}</ToggleChip>)}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-ink-2 mb-2">How you eat</div>
        <div className="flex flex-wrap gap-2">
          {DIET_OPTS.map(o => <ToggleChip key={o.id} active={diet.includes(o.id)} onClick={() => toggle(diet, setDiet, o.id)}>{o.label}</ToggleChip>)}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-2">Anything else? <span className="font-normal text-muted">(optional)</span></span>
        <textarea value={other} maxLength={300} onChange={e => setOther(e.target.value)}
          placeholder="Like an old ankle sprain, or exercises you can't do"
          className="mt-2 w-full min-h-[80px] bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
      </label>

      {doctor && (
        <div role="note" className="flex gap-2 bg-warn/10 border border-warn/25 rounded-xl px-3 py-2.5 text-xs text-ink-2">
          <Icon icon="mdi:stethoscope" width={18} className="text-warn flex-shrink-0" aria-hidden="true" />
          <span>Check with your doctor before starting a new programme. Your plan will go easier on what you ticked, but it's general guidance, not medical advice.</span>
        </div>
      )}

      <p className="text-xs text-muted">Only used to shape your plan and targets. See the <a href="/privacypolicy.html#health-data" target="_blank" rel="noreferrer" className="underline underline-offset-2">Privacy policy</a>.</p>

      <Button full onClick={onNext} iconRight="mdi:arrow-right">{health.length || diet.length || other.trim() ? 'Continue' : 'None of these, continue'}</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Review & Generate
// ─────────────────────────────────────────────────────────────────────────────
function ReviewStep({ data, nutritionPreview, onGenerate, generating, error, onBack, isPro, onNotNow }) {
  const { goal, activityLevel, workoutDays, experienceLevel, location } = data
  const actLabel = ACTIVITY_OPTS.find(a => a.id === activityLevel)?.label ?? activityLevel
  const locLabel = LOCATION_OPTS.find(l => l.id === location)?.label ?? location
  const expLabel = EXPERIENCE_OPTS.find(e => e.id === experienceLevel)?.label ?? experienceLevel

  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Ready to build<br/>your plan</div>
        <div className="text-sm text-muted mt-1">Step {TOTAL_STEPS} of {TOTAL_STEPS} · Review your plan</div>
      </div>

      <div className="bg-raised border border-line rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon icon={GOAL_ICONS[goal]} width={20} className="text-neon-ink" />
          <div>
            <div className="text-sm font-semibold text-ink-2">Goal</div>
            <div className="text-sm font-semibold text-ink">{GOAL_LABELS[goal]}</div>
          </div>
        </div>
        <div className="w-full h-px bg-line-strong" />
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Activity', val: actLabel },
            { label: 'Experience', val: expLabel },
            { label: 'Days/wk', val: workoutDays },
            { label: 'Location', val: locLabel },
          ].map(({ label, val }) => (
            <div key={label}>
              <div className="text-xs text-muted">{label}</div>
              <div className="text-xs font-semibold text-ink mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {nutritionPreview && (
        <div className="bg-neon/5 border border-neon-stroke/20 rounded-2xl p-4">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Your daily targets</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Calories', val: nutritionPreview.calorieTarget },
              { label: 'Protein',  val: `${nutritionPreview.proteinGrams}g` },
              { label: 'Carbs',    val: `${nutritionPreview.carbGrams}g` },
              { label: 'Fat',      val: `${nutritionPreview.fatGrams}g` },
            ].map(({ label, val }) => (
              <div key={label}>
                <div className="font-bold text-lg text-neon-ink">{val}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-xs text-danger">{error}</div>
      )}

      <p className="text-xs text-muted">
        ATHRION gives general fitness guidance, not medical advice. If you have an injury or a health condition, check with a doctor before starting a new program.
      </p>

      {!isPro && (
        <p className="text-sm text-ink-2">
          Your daily targets are saved to Calories either way. Start a {TRIAL_DAYS}-day free trial and ATHRION builds your full week of workouts from these answers.
        </p>
      )}

      <button onClick={onGenerate} disabled={generating}
        className="press w-full h-12 bg-neon active:bg-neon-press text-on-neon font-semibold rounded-xl text-sm disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
        {generating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-on-neon/30 border-t-on-neon rounded-full animate-spin" />
            {isPro ? 'Building your plan…' : 'Saving your answers…'}
          </>
        ) : isPro ? 'Build my plan' : `Start ${TRIAL_DAYS}-day free trial`}
      </button>

      {!isPro && (
        <button onClick={onNotNow} disabled={generating}
          className="press w-full min-h-[44px] text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-40">
          Not now, just save my targets
        </button>
      )}

      {generating && isPro && (
        <p className="text-center text-xs text-muted -mt-2">
          Writing your plan. This takes about 15–30 seconds.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
// Free users answer the same questions: their targets are saved, and the last
// step offers the trial instead of generating (generation is Pro, server-side too).
// saved: an earlier fitness profile, so answers carry over after upgrading. It still
// starts at step 1, with those answers filled in.
export default function FitnessOnboarding({ existingProfile, saved = null, isPro = true, onComplete, onUpgrade, onCancel }) {
  const ep = existingProfile ?? {}
  const sv = saved ?? {}
  const [step, setStep]       = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState('slide-from-right')

  const [goal, setGoal]                         = useState(sv.primary_goal ?? '')
  const [activityLevel, setActivityLevel]       = useState(sv.activity_level ?? 'moderately_active')
  const [experienceLevel, setExperienceLevel]   = useState(sv.experience_level ?? 'beginner')
  const [workoutDays, setWorkoutDays]           = useState(sv.workout_days_per_week ?? 3)
  const [sessionDuration, setSessionDuration]   = useState(sv.preferred_session_duration ?? 45)
  const [location, setLocation]                 = useState(sv.workout_location ?? 'gym')
  const [trainingDays, setTrainingDays]         = useState(sv.preferred_training_days ?? [])
  const [health, setHealth]                     = useState(() => chipsFrom(`${sv.injuries ?? ''} ${sv.medical_notes ?? ''}`, HEALTH_OPTS))
  const [diet, setDiet]                         = useState(() => chipsFrom(sv.limitations, DIET_OPTS))
  const [other, setOther]                       = useState(() => (sv.injuries ?? '').split(OTHER_PREFIX)[1] ?? '')
  const [generating, setGenerating]             = useState(false)
  const [genError, setGenError]                 = useState('')

  function goNext() { setAnimDir('slide-from-right'); setAnimKey(k => k + 1); setStep(s => s + 1) }
  function goBack() { setAnimDir('slide-from-left');  setAnimKey(k => k + 1); setStep(s => s - 1) }

  // Phone back steps through the questions, then closes setup (free users can close it)
  useBackHandler(!!onCancel && step === 0, () => onCancel?.(), undefined, undefined, true)
  useBackHandler(step > 0 && step, goBack, undefined, undefined, true) // re-registers per step

  const nutritionPreview = goal && ep.sex && ep.weight_lb && ep.height_cm && ep.age
    ? calculateNutritionTargets({
        sex: ep.sex, weightLb: ep.weight_lb, heightCm: ep.height_cm, age: ep.age,
        activityLevel, primaryGoal: goal, health,
      })
    : null

  // Chips and the free text as the sentences the plan reads; labels also let them come back on edit
  function healthText() {
    const labels = field => HEALTH_OPTS.filter(o => o.field === field && health.includes(o.id)).map(o => o.label)
    const injuries = [...labels('injuries'), ...(other.trim() ? [`${OTHER_PREFIX}${other.trim()}`] : [])].join('; ')
    const dietLabels = DIET_OPTS.filter(o => diet.includes(o.id)).map(o => o.label)
    return {
      injuries,
      medicalNotes: labels('medicalNotes').join('; '),
      limitations: dietLabels.length ? `Diet: ${dietLabels.join('; ')}` : '',
    }
  }

  // then: 'plan' (Pro: generate), 'trial' (free: open the upgrade sheet), 'close' (free: just save)
  async function handleGenerate(then = isPro ? 'plan' : 'trial') {
    setGenError('')
    setGenerating(true)
    try {
      const fitnessProfileData = {
        primaryGoal: goal,
        secondaryGoals: [],
        activityLevel,
        experienceLevel,
        workoutDaysPerWeek: workoutDays,
        preferredSessionDuration: sessionDuration,
        workoutLocation: location,
        availableEquipment: [],
        preferredWorkoutTypes: [],
        preferredTrainingDays: trainingDays,
        preferredRestDays: DAYS_OF_WEEK.filter(d => !trainingDays.includes(d)),
        sessionPreference: 'both',
        ...healthText(),
        likedExercises: '',
        dislikedExercises: '',
        onboardingCompleted: then === 'plan', // a free user's answers wait for the plan
        sex: ep.sex,
        weightLb: ep.weight_lb,
        heightCm: ep.height_cm,
        age: ep.age,
      }

      const nutritionTargets = nutritionPreview ?? calculateNutritionTargets({
        sex: ep.sex ?? 'other',
        weightLb: ep.weight_lb ?? 154,
        heightCm: ep.height_cm ?? 170,
        age: ep.age ?? 30,
        activityLevel,
        primaryGoal: goal,
        health,
      })

      await Promise.all([
        saveFitnessProfile(fitnessProfileData),
        saveNutritionTarget(nutritionTargets),
        saveGoals({
          calorie_goal: nutritionTargets.calorieTarget,
          protein_goal: nutritionTargets.proteinGrams,
          carb_goal:    nutritionTargets.carbGrams,
        }),
      ])

      if (then !== 'plan') {
        setGenerating(false)
        if (then === 'trial') onUpgrade?.()
        onCancel?.()
        return
      }
      await generatePlan(fitnessProfileData, nutritionTargets)
      onComplete()
    } catch (e) {
      setGenError(e.message || 'Something went wrong. Please try again.')
      setGenerating(false)
    }
  }

  const steps = [
    <GoalStep goal={goal} setGoal={setGoal} onNext={goNext} />,
    <ActivityStep
      activityLevel={activityLevel} setActivityLevel={setActivityLevel}
      experienceLevel={experienceLevel} setExperienceLevel={setExperienceLevel}
      onNext={goNext} onBack={goBack} />,
    <WorkoutSetupStep
      workoutDays={workoutDays} setWorkoutDays={setWorkoutDays}
      sessionDuration={sessionDuration} setSessionDuration={setSessionDuration}
      location={location} setLocation={setLocation}
      trainingDays={trainingDays} setTrainingDays={setTrainingDays}
      onNext={goNext} onBack={goBack} />,
    <HealthStep health={health} setHealth={setHealth} diet={diet} setDiet={setDiet} other={other} setOther={setOther}
      onNext={goNext} onBack={goBack} />,
    <ReviewStep
      data={{ goal, activityLevel, workoutDays, experienceLevel, location }}
      nutritionPreview={nutritionPreview}
      onGenerate={() => handleGenerate()} generating={generating} error={genError}
      onBack={goBack} isPro={isPro} onNotNow={() => handleGenerate('close')} />,
  ]

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-start px-4 pt-safe-10 pb-safe-16 relative overflow-hidden">

      <div className="relative z-10 w-full max-w-sm">
        <div className="relative text-center mb-6 slide-up">
          {onCancel && (
            <button onClick={onCancel} aria-label="Close setup"
              className="press absolute -top-2 right-0 w-11 h-11 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-raised">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
          <Brand size="text-3xl" />
        </div>

        <ProgressDots step={step} />

        <div key={animKey} className={animDir}>
          {steps[step]}
        </div>
      </div>
    </div>
  )
}
