import { useState } from 'react'
import { calculateNutritionTargets, GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'
import { saveFitnessProfile, saveNutritionTarget, generatePlan } from '../lib/fitnessApi.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6

const ACTIVITY_OPTS = [
  { id: 'sedentary',         label: 'Sedentary',          sub: 'Little or no exercise, desk job' },
  { id: 'lightly_active',    label: 'Lightly Active',     sub: '1–3 days of light exercise/week' },
  { id: 'moderately_active', label: 'Moderately Active',  sub: '3–5 days of moderate exercise' },
  { id: 'very_active',       label: 'Very Active',        sub: '6–7 days of hard exercise' },
  { id: 'athlete',           label: 'Athlete',            sub: 'Twice daily or intense sport' },
]

const EXPERIENCE_OPTS = [
  { id: 'beginner',     label: 'Beginner',      sub: 'Less than 1 year of consistent training' },
  { id: 'intermediate', label: 'Intermediate',  sub: '1–3 years of regular training' },
  { id: 'advanced',     label: 'Advanced',      sub: '3+ years with a structured program' },
]

const LOCATION_OPTS = [
  { id: 'gym',          label: 'Gym',           icon: '🏛️' },
  { id: 'home',         label: 'Home',          icon: '🏠' },
  { id: 'outdoors',     label: 'Outdoors',      icon: '🌲' },
  { id: 'any',          label: 'Flexible',      icon: '⚡' },
]

const EQUIPMENT_OPTS = [
  'Dumbbells', 'Barbell & Plates', 'Resistance Bands', 'Pull-up Bar',
  'Kettlebells', 'Cable Machine', 'Bench', 'Squat Rack', 'Cardio Machine', 'None',
]

const WORKOUT_TYPE_OPTS = [
  'Strength Training', 'HIIT', 'Cardio', 'Yoga / Flexibility',
  'Bodyweight', 'Circuit Training', 'Sport-Specific',
]

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const SESSION_PREF_OPTS = [
  { id: 'solo',  label: 'Solo',      icon: '🎯', sub: 'Train at my own pace' },
  { id: 'group', label: 'Group',     icon: '👥', sub: 'Prefer group energy' },
  { id: 'both',  label: 'Both',      icon: '⚡', sub: 'Whatever works' },
]

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
      className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest disabled:opacity-25 transition-all hover:shadow-[0_6px_24px_rgba(200,241,53,0.35)]">
      {label}
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="text-gray-600 text-sm hover:text-white transition-colors mb-3 block">← Back</button>
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
        active ? 'bg-neon/15 border-neon/50 text-neon' : 'bg-[#1a1a1a] border-[#262626] text-gray-500 hover:border-[#333]'
      }`}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Primary Goal
// ─────────────────────────────────────────────────────────────────────────────
function GoalStep({ step, goal, setGoal, onNext }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="font-bebas text-4xl text-white tracking-wide leading-tight">What's your<br/>main goal?</div>
        <div className="text-sm text-gray-500 mt-1">Step 1 of {TOTAL_STEPS} · This shapes your entire plan</div>
      </div>
      <div className="space-y-2">
        {GOAL_OPTS.map(o => (
          <RadioCard key={o.id} selected={goal === o.id} onClick={() => setGoal(o.id)}>
            <span className="text-lg">{o.icon}</span>
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
function ActivityStep({ step, activityLevel, setActivityLevel, experienceLevel, setExperienceLevel, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bebas text-4xl text-white tracking-wide">Activity Level</div>
        <div className="text-sm text-gray-500 mt-1">Step 2 of {TOTAL_STEPS}</div>
      </div>

      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Current Activity</div>
        <div className="space-y-2">
          {ACTIVITY_OPTS.map(o => (
            <RadioCard key={o.id} selected={activityLevel === o.id} onClick={() => setActivityLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${activityLevel === o.id ? 'text-white' : 'text-gray-300'}`}>{o.label}</div>
                <div className="text-xs text-gray-600">{o.sub}</div>
              </div>
            </RadioCard>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Training Experience</div>
        <div className="space-y-2">
          {EXPERIENCE_OPTS.map(o => (
            <RadioCard key={o.id} selected={experienceLevel === o.id} onClick={() => setExperienceLevel(o.id)}>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${experienceLevel === o.id ? 'text-white' : 'text-gray-300'}`}>{o.label}</div>
                <div className="text-xs text-gray-600">{o.sub}</div>
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
// Step 3 — Workout Preferences
// ─────────────────────────────────────────────────────────────────────────────
function WorkoutPrefsStep({ step, workoutDays, setWorkoutDays, sessionDuration, setSessionDuration,
  location, setLocation, equipment, setEquipment, workoutTypes, setWorkoutTypes,
  trainingDays, setTrainingDays, sessionPref, setSessionPref, onNext, onBack }) {

  function toggle(arr, setArr, val) {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  const DURATION_OPTS = [20, 30, 45, 60, 75, 90]

  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bebas text-4xl text-white tracking-wide">Workout Setup</div>
        <div className="text-sm text-gray-500 mt-1">Step 3 of {TOTAL_STEPS}</div>
      </div>

      {/* Days per week */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Days per Week <span className="text-neon">{workoutDays}</span></div>
        <input type="range" min={1} max={7} value={workoutDays}
          onChange={e => setWorkoutDays(Number(e.target.value))}
          className="w-full accent-neon" />
        <div className="flex justify-between text-[10px] text-gray-700 mt-1">
          <span>1 day</span><span>7 days</span>
        </div>
      </div>

      {/* Session duration */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Session Duration</div>
        <div className="flex gap-2 flex-wrap">
          {DURATION_OPTS.map(d => (
            <button key={d} onClick={() => setSessionDuration(d)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                sessionDuration === d ? 'bg-neon/15 border-neon/50 text-neon' : 'bg-[#1a1a1a] border-[#262626] text-gray-500'
              }`}>
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Workout location */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Where You Train</div>
        <div className="grid grid-cols-2 gap-2">
          {LOCATION_OPTS.map(o => (
            <button key={o.id} onClick={() => setLocation(o.id)}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold transition-all ${
                location === o.id ? 'bg-neon/10 border-neon/50 text-white' : 'bg-[#1a1a1a] border-[#262626] text-gray-400'
              }`}>
              <span>{o.icon}</span>{o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Available Equipment</div>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTS.map(e => (
            <ToggleChip key={e} active={equipment.includes(e)} onClick={() => toggle(equipment, setEquipment, e)}>{e}</ToggleChip>
          ))}
        </div>
      </div>

      {/* Workout types */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Preferred Types</div>
        <div className="flex flex-wrap gap-2">
          {WORKOUT_TYPE_OPTS.map(t => (
            <ToggleChip key={t} active={workoutTypes.includes(t)} onClick={() => toggle(workoutTypes, setWorkoutTypes, t)}>{t}</ToggleChip>
          ))}
        </div>
      </div>

      {/* Preferred training days */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Preferred Days</div>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(d => (
            <ToggleChip key={d} active={trainingDays.includes(d)} onClick={() => toggle(trainingDays, setTrainingDays, d)}>{d.slice(0, 3)}</ToggleChip>
          ))}
        </div>
      </div>

      {/* Session preference */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Session Style</div>
        <div className="grid grid-cols-3 gap-2">
          {SESSION_PREF_OPTS.map(o => (
            <button key={o.id} onClick={() => setSessionPref(o.id)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all ${
                sessionPref === o.id ? 'bg-neon/10 border-neon/50 text-neon' : 'bg-[#1a1a1a] border-[#262626] text-gray-500'
              }`}>
              <span className="text-base">{o.icon}</span>{o.label}
            </button>
          ))}
        </div>
      </div>

      <NextBtn onClick={onNext} disabled={!location} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Health & Limitations
// ─────────────────────────────────────────────────────────────────────────────
function HealthStep({ step, injuries, setInjuries, limitations, setLimitations, medicalNotes, setMedicalNotes, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bebas text-4xl text-white tracking-wide">Health Notes</div>
        <div className="text-sm text-gray-500 mt-1">Step 4 of {TOTAL_STEPS} · All fields optional</div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-400">This app is not medical advice. Always consult a doctor before starting a new program, especially if you have any health conditions.</p>
      </div>

      {[
        { label: 'Injuries', hint: 'e.g. bad left knee, rotator cuff', val: injuries, set: setInjuries },
        { label: 'Limitations', hint: 'e.g. avoid running, no jumping', val: limitations, set: setLimitations },
        { label: 'Medical Notes', hint: 'e.g. diabetes, high blood pressure', val: medicalNotes, set: setMedicalNotes },
      ].map(({ label, hint, val, set }) => (
        <div key={label}>
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1.5">{label}</div>
          <textarea value={val} onChange={e => set(e.target.value)} placeholder={hint} rows={2}
            className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40 resize-none" />
        </div>
      ))}

      <NextBtn onClick={onNext} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Preferences (likes / dislikes)
// ─────────────────────────────────────────────────────────────────────────────
function PreferencesStep({ step, likedExercises, setLikedExercises, dislikedExercises, setDislikedExercises, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bebas text-4xl text-white tracking-wide">Your Preferences</div>
        <div className="text-sm text-gray-500 mt-1">Step 5 of {TOTAL_STEPS} · Both fields optional</div>
      </div>

      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-1.5">Exercises You Like</div>
        <textarea value={likedExercises} onChange={e => setLikedExercises(e.target.value)}
          placeholder="e.g. deadlifts, pull-ups, running" rows={3}
          className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40 resize-none" />
      </div>

      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-1.5">Exercises You Dislike or Want to Avoid</div>
        <textarea value={dislikedExercises} onChange={e => setDislikedExercises(e.target.value)}
          placeholder="e.g. burpees, box jumps" rows={3}
          className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40 resize-none" />
      </div>

      <NextBtn onClick={onNext} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Review & Generate
// ─────────────────────────────────────────────────────────────────────────────
function ReviewStep({ step, data, nutritionPreview, onGenerate, generating, error, onBack }) {
  const { goal, activityLevel, workoutDays, experienceLevel, location } = data
  const actLabel = ACTIVITY_OPTS.find(a => a.id === activityLevel)?.label ?? activityLevel
  const locLabel = LOCATION_OPTS.find(l => l.id === location)?.label ?? location

  return (
    <div className="space-y-5">
      <div>
        <BackBtn onClick={onBack} />
        <div className="font-bebas text-4xl text-white tracking-wide">Ready to<br/>Generate</div>
        <div className="text-sm text-gray-500 mt-1">Step 6 of {TOTAL_STEPS} · Review your plan</div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#262626] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{GOAL_ICONS[goal]}</span>
          <div>
            <div className="text-xs text-gray-600">Goal</div>
            <div className="text-sm font-semibold text-white">{GOAL_LABELS[goal]}</div>
          </div>
        </div>
        <div className="w-full h-px bg-[#2a2a2a]" />
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-600">Activity</div>
            <div className="text-xs font-semibold text-white mt-0.5">{actLabel}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Days/week</div>
            <div className="text-xs font-semibold text-white mt-0.5">{workoutDays}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Location</div>
            <div className="text-xs font-semibold text-white mt-0.5">{locLabel}</div>
          </div>
        </div>
      </div>

      {nutritionPreview && (
        <div className="bg-neon/5 border border-neon/20 rounded-2xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Your Daily Targets</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Calories', val: nutritionPreview.calorieTarget },
              { label: 'Protein', val: `${nutritionPreview.proteinGrams}g` },
              { label: 'Carbs', val: `${nutritionPreview.carbGrams}g` },
              { label: 'Fat', val: `${nutritionPreview.fatGrams}g` },
            ].map(({ label, val }) => (
              <div key={label}>
                <div className="font-bebas text-xl text-neon">{val}</div>
                <div className="text-[10px] text-gray-600 uppercase">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.injuries && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
          <p className="text-xs text-amber-400">Injuries noted — the plan will account for your limitations.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      <button onClick={onGenerate} disabled={generating}
        className="w-full bg-neon text-black font-bold py-4 rounded-xl text-sm uppercase tracking-widest disabled:opacity-50 transition-all hover:shadow-[0_6px_24px_rgba(200,241,53,0.35)] flex items-center justify-center gap-2">
        {generating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Building your plan...
          </>
        ) : 'Generate My Plan →'}
      </button>

      {generating && (
        <p className="text-center text-xs text-gray-600 -mt-2">
          This takes about 15–30 seconds. Claude AI is crafting your personalized program.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main FitnessOnboarding
// ─────────────────────────────────────────────────────────────────────────────
export default function FitnessOnboarding({ existingProfile, onComplete }) {
  const ep = existingProfile ?? {}
  const [step, setStep]       = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState('slide-from-right')

  // Step 1 — Goal
  const [goal, setGoal]       = useState('')

  // Step 2 — Activity
  const [activityLevel, setActivityLevel]       = useState('moderately_active')
  const [experienceLevel, setExperienceLevel]   = useState('beginner')

  // Step 3 — Workout Prefs
  const [workoutDays, setWorkoutDays]           = useState(3)
  const [sessionDuration, setSessionDuration]   = useState(45)
  const [location, setLocation]                 = useState('gym')
  const [equipment, setEquipment]               = useState([])
  const [workoutTypes, setWorkoutTypes]         = useState([])
  const [trainingDays, setTrainingDays]         = useState([])
  const [sessionPref, setSessionPref]           = useState('both')

  // Step 4 — Health
  const [injuries, setInjuries]                 = useState('')
  const [limitations, setLimitations]           = useState('')
  const [medicalNotes, setMedicalNotes]         = useState('')

  // Step 5 — Preferences
  const [likedExercises, setLikedExercises]     = useState('')
  const [dislikedExercises, setDislikedExercises] = useState('')

  // Step 6 — Generate
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState('')

  function goNext() {
    setAnimDir('slide-from-right')
    setAnimKey(k => k + 1)
    setStep(s => s + 1)
  }
  function goBack() {
    setAnimDir('slide-from-left')
    setAnimKey(k => k + 1)
    setStep(s => s - 1)
  }

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
        availableEquipment: equipment,
        preferredWorkoutTypes: workoutTypes,
        preferredTrainingDays: trainingDays,
        preferredRestDays: DAYS_OF_WEEK.filter(d => !trainingDays.includes(d)),
        sessionPreference: sessionPref,
        injuries,
        limitations,
        medicalNotes,
        likedExercises,
        dislikedExercises,
        onboardingCompleted: true,
        // Body stats from existing profile (used by the AI, not re-entered here)
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

      // Save to DB in parallel, then generate the plan
      const [savedProfile] = await Promise.all([
        saveFitnessProfile(fitnessProfileData),
        saveNutritionTarget(nutritionTargets),
      ])

      await generatePlan(fitnessProfileData, nutritionTargets)

      onComplete()
    } catch (e) {
      setGenError(e.message || 'Something went wrong. Please try again.')
      setGenerating(false)
    }
  }

  const reviewData = { goal, activityLevel, workoutDays, experienceLevel, location, injuries }

  const steps = [
    <GoalStep step={step} goal={goal} setGoal={setGoal} onNext={goNext} />,
    <ActivityStep step={step}
      activityLevel={activityLevel} setActivityLevel={setActivityLevel}
      experienceLevel={experienceLevel} setExperienceLevel={setExperienceLevel}
      onNext={goNext} onBack={goBack} />,
    <WorkoutPrefsStep step={step}
      workoutDays={workoutDays} setWorkoutDays={setWorkoutDays}
      sessionDuration={sessionDuration} setSessionDuration={setSessionDuration}
      location={location} setLocation={setLocation}
      equipment={equipment} setEquipment={setEquipment}
      workoutTypes={workoutTypes} setWorkoutTypes={setWorkoutTypes}
      trainingDays={trainingDays} setTrainingDays={setTrainingDays}
      sessionPref={sessionPref} setSessionPref={setSessionPref}
      onNext={goNext} onBack={goBack} />,
    <HealthStep step={step}
      injuries={injuries} setInjuries={setInjuries}
      limitations={limitations} setLimitations={setLimitations}
      medicalNotes={medicalNotes} setMedicalNotes={setMedicalNotes}
      onNext={goNext} onBack={goBack} />,
    <PreferencesStep step={step}
      likedExercises={likedExercises} setLikedExercises={setLikedExercises}
      dislikedExercises={dislikedExercises} setDislikedExercises={setDislikedExercises}
      onNext={goNext} onBack={goBack} />,
    <ReviewStep step={step}
      data={reviewData} nutritionPreview={nutritionPreview}
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
          <div className="font-bebas text-4xl text-white tracking-widest">ATHRION</div>
          <div className="text-xs text-gray-600 tracking-[0.3em] uppercase mt-0.5">Fitness Setup</div>
        </div>

        <ProgressDots step={step} />

        <div key={animKey} className={animDir}>
          {steps[step]}
        </div>
      </div>
    </div>
  )
}
