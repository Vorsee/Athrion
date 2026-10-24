import { useState } from 'react'
import { Icon } from '@iconify/react'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'
import { saveFitnessProfile, saveNutritionTarget, generatePlan } from '../lib/fitnessApi.js'
import { saveGoals } from '../lib/api.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4

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
          i === step ? 'w-8 bg-neon' : i < step ? 'w-4 bg-neon/40' : 'w-4 bg-[#2a2a2a]'
        }`} />
      ))}
    </div>
  )
}

function NextBtn({ onClick, disabled, label = 'Continue →' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm disabled:opacity-25 transition-all">
      {label}
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="text-gray-400 text-sm hover:text-white transition-colors mb-3 block">← Back</button>
  )
}

function RadioCard({ selected, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left ${
        selected ? 'bg-neon/10 border-neon/50' : 'bg-[#1a1a1a] border-[#262626] hover:border-[#333]'
      }`}>
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
        selected ? 'border-neon bg-neon' : 'border-[#444]'
      }`}>
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
      </div>
      {children}
    </button>
  )
}

function ToggleChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
        active ? 'bg-neon/15 border-neon/50 text-neon' : 'bg-[#1a1a1a] border-[#262626] text-gray-400 hover:border-[#333]'
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
        <div className="font-bold text-3xl text-white leading-tight">What's your<br/>main goal?</div>
        <div className="text-sm text-gray-400 mt-1">Step 1 of {TOTAL_STEPS} · This shapes your entire plan</div>
      </div>
      <div className="space-y-2">
        {GOAL_OPTS.map(o => (
          <RadioCard key={o.id} selected={goal === o.id} onClick={() => setGoal(o.id)}>
            <Icon icon={o.icon} width={20} className="text-neon flex-shrink-0" />
            <div className="font-semibold text-sm text-white">{o.label}</div>
          </RadioCard>
        ))}
      </div>
      <NextBtn onClick={onNext} disabled={!goal} />
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
        <BackBtn onClick={onBack} />
        <div className="font-bold text-3xl text-white">Activity level</div>
        <div className="text-sm text-gray-400 mt-1">Step 2 of {TOTAL_STEPS}</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-gray-200 mb-2">Current activity</div>
        <div className="space-y-2">
          {ACTIVITY_OPTS.map(o => (
            <RadioCard key={o.id} selected={activityLevel === o.id} onClick={() => setActivityLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${activityLevel === o.id ? 'text-white' : 'text-gray-300'}`}>{o.label}</div>
                <div className="text-xs text-gray-400">{o.sub}</div>
              </div>
            </RadioCard>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-gray-200 mb-2">Training experience</div>
        <div className="space-y-2">
          {EXPERIENCE_OPTS.map(o => (
            <RadioCard key={o.id} selected={experienceLevel === o.id} onClick={() => setExperienceLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${experienceLevel === o.id ? 'text-white' : 'text-gray-300'}`}>{o.label}</div>
                <div className="text-xs text-gray-400">{o.sub}</div>
              </div>
            </RadioCard>
          ))}
        </div>
      </div>

      <NextBtn onClick={onNext} disabled={!activityLevel || !experienceLevel} />
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
        <BackBtn onClick={onBack} />
        <div className="font-bold text-3xl text-white">Workout setup</div>
        <div className="text-sm text-gray-400 mt-1">Step 3 of {TOTAL_STEPS}</div>
      </div>

      {/* Days per week */}
      <div>
        <div className="text-xs text-gray-400 mb-2">
          Days per Week <span className="text-neon">{workoutDays}</span>
        </div>
        <input type="range" min={1} max={7} value={workoutDays}
          onChange={e => setWorkoutDays(Number(e.target.value))}
          className="w-full accent-neon" />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1 day</span><span>7 days</span>
        </div>
      </div>

      {/* Session duration */}
      <div>
        <div className="text-sm font-semibold text-gray-200 mb-2">Session duration</div>
        <div className="flex gap-2 flex-wrap">
          {DURATION_OPTS.map(d => (
            <button key={d} onClick={() => setSessionDuration(d)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                sessionDuration === d ? 'bg-neon/15 border-neon/50 text-neon' : 'bg-[#1a1a1a] border-[#262626] text-gray-400'
              }`}>
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Where you train */}
      <div>
        <div className="text-sm font-semibold text-gray-200 mb-2">Where you train</div>
        <div className="grid grid-cols-2 gap-2">
          {LOCATION_OPTS.map(o => (
            <button key={o.id} onClick={() => setLocation(o.id)}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold transition-all ${
                location === o.id ? 'bg-neon/10 border-neon/50 text-white' : 'bg-[#1a1a1a] border-[#262626] text-gray-400'
              }`}>
              <Icon icon={o.icon} width={18} className="text-neon" />{o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preferred days */}
      <div>
        <div className="text-xs text-gray-400 mb-2">Preferred days <span className="text-gray-500 normal-case">(optional)</span></div>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(d => (
            <ToggleChip key={d} active={trainingDays.includes(d)} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</ToggleChip>
          ))}
        </div>
      </div>

      <NextBtn onClick={onNext} disabled={!location} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Review & Generate
// ─────────────────────────────────────────────────────────────────────────────
function ReviewStep({ data, nutritionPreview, onGenerate, generating, error, onBack }) {
  const { goal, activityLevel, workoutDays, experienceLevel, location } = data
  const actLabel = ACTIVITY_OPTS.find(a => a.id === activityLevel)?.label ?? activityLevel
  const locLabel = LOCATION_OPTS.find(l => l.id === location)?.label ?? location
  const expLabel = EXPERIENCE_OPTS.find(e => e.id === experienceLevel)?.label ?? experienceLevel

  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bold text-3xl text-white">Ready to<br/>Generate</div>
        <div className="text-sm text-gray-400 mt-1">Step 4 of {TOTAL_STEPS} · Review your plan</div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#262626] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon icon={GOAL_ICONS[goal]} width={20} className="text-neon" />
          <div>
            <div className="text-sm font-semibold text-gray-200">Goal</div>
            <div className="text-sm font-semibold text-white">{GOAL_LABELS[goal]}</div>
          </div>
        </div>
        <div className="w-full h-px bg-[#2a2a2a]" />
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Activity', val: actLabel },
            { label: 'Experience', val: expLabel },
            { label: 'Days/wk', val: workoutDays },
            { label: 'Location', val: locLabel },
          ].map(({ label, val }) => (
            <div key={label}>
              <div className="text-xs text-gray-400">{label}</div>
              <div className="text-xs font-semibold text-white mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {nutritionPreview && (
        <div className="bg-neon/5 border border-neon/20 rounded-2xl p-4">
          <div className="text-sm font-semibold text-gray-200 mb-3">Your daily targets</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Calories', val: nutritionPreview.calorieTarget },
              { label: 'Protein',  val: `${nutritionPreview.proteinGrams}g` },
              { label: 'Carbs',    val: `${nutritionPreview.carbGrams}g` },
              { label: 'Fat',      val: `${nutritionPreview.fatGrams}g` },
            ].map(({ label, val }) => (
              <div key={label}>
                <div className="font-bold text-lg text-neon">{val}</div>
                <div className="text-xs text-gray-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      <button onClick={onGenerate} disabled={generating}
        className="w-full bg-neon text-black font-bold py-4 rounded-xl text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2">
        {generating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Building your plan...
          </>
        ) : 'Generate my plan →'}
      </button>

      {generating && (
        <p className="text-center text-xs text-gray-400 -mt-2">
          This takes about 15–30 seconds. Claude AI is crafting your personalized program.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function FitnessOnboarding({ existingProfile, onComplete }) {
  const ep = existingProfile ?? {}
  const [step, setStep]       = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState('slide-from-right')

  const [goal, setGoal]                         = useState('')
  const [activityLevel, setActivityLevel]       = useState('moderately_active')
  const [experienceLevel, setExperienceLevel]   = useState('beginner')
  const [workoutDays, setWorkoutDays]           = useState(3)
  const [sessionDuration, setSessionDuration]   = useState(45)
  const [location, setLocation]                 = useState('gym')
  const [trainingDays, setTrainingDays]         = useState([])
  const [generating, setGenerating]             = useState(false)
  const [genError, setGenError]                 = useState('')

  function goNext() { setAnimDir('slide-from-right'); setAnimKey(k => k + 1); setStep(s => s + 1) }
  function goBack() { setAnimDir('slide-from-left');  setAnimKey(k => k + 1); setStep(s => s - 1) }

  const nutritionPreview = goal && ep.sex && ep.weight_lb && ep.height_cm && ep.age
    ? calculateNutritionTargets({
        sex: ep.sex, weightLb: ep.weight_lb, heightCm: ep.height_cm, age: ep.age,
        activityLevel, primaryGoal: goal,
      })
    : null

  async function handleGenerate() {
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
        injuries: '',
        limitations: '',
        medicalNotes: '',
        likedExercises: '',
        dislikedExercises: '',
        onboardingCompleted: true,
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
    <ReviewStep
      data={{ goal, activityLevel, workoutDays, experienceLevel, location }}
      nutritionPreview={nutritionPreview}
      onGenerate={handleGenerate} generating={generating} error={genError}
      onBack={goBack} />,
  ]

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start px-4 pt-10 pb-16 relative overflow-hidden">
      <div className="fixed w-[500px] h-[500px] rounded-full bg-neon opacity-[0.05] blur-[120px] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[400px] h-[400px] rounded-full bg-blue-500 opacity-[0.05] blur-[100px] -bottom-20 -left-20 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,241,53,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,241,53,0.03) 1px,transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-6 slide-up">
          <div className="font-bold text-3xl text-white">ATHRION</div>
          <div className="text-xs text-gray-400 mt-0.5">Fitness setup</div>
        </div>

        <ProgressDots step={step} />

        <div key={animKey} className={animDir}>
          {steps[step]}
        </div>
      </div>
    </div>
  )
}
