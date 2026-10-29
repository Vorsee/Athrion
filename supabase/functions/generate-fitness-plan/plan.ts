// Plan building blocks with no Deno or network dependencies, so they can be unit tested.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Weight Loss', gain_weight: 'Weight Gain', build_muscle: 'Muscle Building',
  improve_strength: 'Strength', improve_endurance: 'Endurance',
  athletic_performance: 'Athletic Performance', maintain_weight: 'Maintenance',
  general_fitness: 'General Fitness', mobility_flexibility: 'Mobility', swimming: 'Swimming',
}

// How each goal should change the programming. Sent to Claude so plans for
// different goals are structurally different, not just renamed.
export const GOAL_PROGRAMMING: Record<string, string> = {
  lose_weight: 'Fat loss while keeping muscle. Full-body or upper/lower strength work at 10-15 reps with short rest (45-75s), plus 1-2 dedicated conditioning sessions (intervals or circuits). Add daily step/NEAT guidance on rest days.',
  gain_weight: 'Healthy weight gain for someone who finds it hard to put on weight. Full-body or upper/lower strength work 3-4x/week, compound lifts at 6-12 reps, 60-120s rest. Keep cardio light so calories go to growth. Recovery notes should mention eating enough and regular meals.',
  build_muscle: 'Hypertrophy, run as a structured program, not a random list. Split by training days: 2 days = full body A and B; 3 days = upper, legs, full body; 4 days = upper, lower, upper, lower; 5 days = push, pull, legs, upper, lower; 6 days = push, pull, legs twice. Legs are trained at least twice a week (or every session on 2-3 day plans): each lower day has a squat or leg press pattern, a hip hinge (Romanian deadlift, hip thrust), a single-leg move (lunge, split squat, step-up), a hamstring curl and calf raises. Every muscle group gets 10-20 hard sets a week. Each session opens with 1-2 main lifts at 4 sets of 6-10 reps, RPE 7-8, 2-3 min rest, then 3-4 accessories at 3 sets of 10-15, RPE 8-9, 60-90s rest. If keyLifts are given, they are the main lifts and progress every week. Progression: double progression; add reps up to the top of the range, then add the smallest weight step and drop back to the bottom of the range. Cardio: 1-2 easy sessions of 20-30 minutes a week (incline walk, bike or elliptical, conversational pace), as an active recovery day between lifting days or after an upper-body session, never right before legs.',
  improve_strength: 'Maximal strength. Organise sessions around the main lifts (squat, bench press, deadlift, overhead press, or the closest equipment-appropriate variants). Main lift 3-5 sets of 3-6 reps at RPE 7-8 with 2-4 min rest, then 2-3 accessories at 6-10 reps.',
  improve_endurance: 'Cardiovascular and muscular endurance. Mix steady-state zone 2 sessions, interval/tempo sessions, and a high-rep muscular endurance circuit. Durations and reps written as time where it makes sense. Short rests.',
  athletic_performance: 'Athletic power and speed. Each session opens with plyometrics/sprints/agility (low reps, full recovery), then strength work (3-5 reps), then conditioning. Alternate lower- and upper-body emphasis.',
  maintain_weight: 'Balanced maintenance. Full-body strength 2-3x/week at 8-12 reps, plus moderate cardio. Sustainable volume.',
  general_fitness: 'Well-rounded fitness. Alternate full-body strength (8-12 reps), cardio/conditioning, and a core + mobility component. Varied, approachable sessions.',
  mobility_flexibility: 'Mobility and flexibility. Sessions are mobility flows, dynamic and loaded stretching, yoga-style holds, and light stability/strength work. Reps are mostly holds (e.g. 30-60s) or controlled reps. Low intensity.',
  swimming: 'Dryland training for swimmers, around their pool sessions. Pulling strength (pull-ups, rows, lat pulldowns), shoulder health (external rotation, face pulls, scapular work), core and anti-rotation work, hip and leg power for starts and turns (squats, jumps), and thoracic and shoulder mobility. 2-4 sets of 6-12 reps, 60-90s rest, moderate loads so the legs and shoulders are fresh for the water. Avoid heavy overhead pressing volume. Mention in the notes which swim days the session fits around.',
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a supportive, professional fitness coach who writes personalized, safe, realistic training plans.

The primary goal decides the shape of the plan: the split, exercise selection, sets, reps, rest times and conditioning all follow from it. Plans for different goals must look clearly different. Follow the goal-specific programming guidance you are given.

Rules:
- Use the provided nutrition targets exactly; never change calorie or macro numbers.
- Respect injuries, equipment, location, experience level and schedule. Only use equipment available at the stated location.
- Put workouts on the preferred training days when they are given; all other days are rest or active recovery.
- Give each workout day a distinct title and exercise list that matches its focus. Do not repeat the same session on every day unless the goal calls for it.
- Include a warm-up and cool-down for every workout day, and an easier and harder version for every exercise.
- Do not diagnose medical conditions, promise specific results, recommend extreme calorie restriction, or recommend unsupported supplements.
- Medical notes and limitations come from the person. Pain or injury: avoid loading that area and give pain-free alternatives. Pregnant: moderate intensity, no lying flat on the back after the first trimester, no breath-holding or heavy maxes. Postpartum: start with core and pelvic floor friendly work and build gradually. Heart or blood pressure: moderate intensity, no breath-holding. Diabetes or PCOS: regular strength training and steady activity. In these cases add a warning to check with a doctor first.
- Limitations may give a diet (vegetarian, vegan, halal) or fasting; keep any food tips consistent with it and put hard sessions outside fasting hours when fasting is mentioned.
- For rest and active-recovery days use empty warmup, exercises and cooldown arrays and fill recoveryNotes.
- Legs are muscles too: unless an injury rules it out, every plan with 3 or more training days trains the lower body (quads, hamstrings, glutes, calves) at least as often as the upper body, with at least one full leg day or a squat or lunge and a hip hinge in most sessions. Never write an upper-body-only week.
- Cardio has a place in every plan except mobility: at least one cardio session a week (a short cardio day such as "Easy Cardio" on a rest day, or 10-20 minutes at the end of a session), written as exercises with a duration in reps, for example "Incline Walk" with reps "20-30 min".
- Use plain, common exercise names people know and that match a normal gym app library: "Squat", "Bench Press", "Romanian Deadlift", "Lunge", "Leg Press", "Lat Pulldown", "Standing Calf Raise", "Incline Walk", "Stationary Bike". Avoid made-up or brand names.
- weeklySchedule has exactly 7 entries, Monday through Sunday, in order.`

function str() { return { type: 'string' } }
function num() { return { type: 'number' } }
function strArr() { return { type: 'array', items: { type: 'string' } } }
function obj(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

const stepSchema = obj({ name: str(), duration: str(), instructions: str() })

export const PLAN_SCHEMA = obj({
  summary: obj({
    goal: str(), planName: str(), durationWeeks: num(), trainingDaysPerWeek: num(),
    overview: str(), weeklyStrategy: str(),
  }),
  nutrition: obj({
    dailyCalories: num(), proteinGrams: num(), carbGrams: num(), fatGrams: num(),
    hydrationAdvice: str(), mealTimingAdvice: str(), keyNotes: strArr(),
  }),
  weeklySchedule: {
    type: 'array',
    items: obj({
      day: { type: 'string', enum: DAYS },
      type: { type: 'string', enum: ['workout', 'rest', 'active_recovery'] },
      title: str(),
      sessionMode: { type: 'string', enum: ['solo', 'group', 'solo_or_group'] },
      durationMinutes: num(),
      workout: obj({
        warmup: { type: 'array', items: stepSchema },
        exercises: {
          type: 'array',
          items: obj({
            name: str(), sets: num(), reps: str(), restSeconds: num(), intensityNote: str(),
            formTip: str(), easierVersion: str(), harderVersion: str(), equipment: str(),
          }),
        },
        cooldown: { type: 'array', items: stepSchema },
      }),
      recoveryNotes: str(),
    }),
  },
  progression: obj({
    weeklyStrategy: str(), whenToIncreaseWeight: str(), whenToReduceIntensity: str(), deloadGuidance: str(),
  }),
  adaptation: obj({
    summary: str(),
    changes: strArr(),
  }),
  advice: obj({
    topPriorities: strArr(), recoveryTips: strArr(), sleepAdvice: str(),
    consistencyTips: strArr(), commonMistakes: strArr(),
  }),
  safety: obj({
    warnings: strArr(), professionalAdviceRecommended: { type: 'boolean' }, exercisesToAvoid: strArr(),
  }),
})

const ADAPT_INSTRUCTIONS = `This is a weekly update of an existing plan. Use recentProgress to adapt it:
- Keep the same goal and overall structure unless the data says it isn't working.
- Low adherence (missed sessions): make sessions shorter or reduce training days rather than adding work.
- Low energy, poor sleep, high soreness or stress: reduce volume or intensity this week.
- Good adherence and recovery: progress the main exercises (more weight, reps or sets) and use the logged weights to set loads.
- Swap exercises the person keeps skipping for similar alternatives.
In adaptation.summary explain in 1-2 sentences what changed and why; list each concrete change in adaptation.changes.`

export function buildUserMessage(fp: any, nt: any, progress: any): string {
  const goal = fp.primaryGoal ?? 'general_fitness'
  // A second goal picked alongside (lose weight + build muscle): the plan blends both
  const second = (fp.secondaryGoals ?? []).filter((g: string) => g !== goal && GOAL_PROGRAMMING[g]).slice(0, 1)
  const both = second.length ? ` with a secondary goal of ${GOAL_LABELS[second[0]]}` : ''
  return JSON.stringify({
    instruction: progress
      ? `Write next week's ${GOAL_LABELS[goal] ?? goal} training plan${both} for this person, adapted to their progress.`
      : `Write a complete ${GOAL_LABELS[goal] ?? goal} training plan${both} for this person. In adaptation, summarise the plan's starting point and leave changes empty.`,
    adaptInstructions: progress ? ADAPT_INSTRUCTIONS : undefined,
    recentProgress: progress ?? undefined,
    goalProgramming: GOAL_PROGRAMMING[goal] ?? GOAL_PROGRAMMING.general_fitness,
    secondaryGoalProgramming: second.length
      ? `Also serve ${GOAL_LABELS[second[0]]}: ${GOAL_PROGRAMMING[second[0]]} Keep the primary goal's calories and overall shape, and build the secondary goal's key elements into the week (for example, lose weight + build muscle = a muscle-building split with a calorie deficit and the cardio sessions; build muscle + swimming = lifting plus dryland work around the pool days).`
      : undefined,
    profile: {
      primaryGoal: goal,
      secondaryGoals: fp.secondaryGoals ?? [],
      activityLevel: fp.activityLevel,
      experienceLevel: fp.experienceLevel,
      workoutDaysPerWeek: fp.workoutDaysPerWeek,
      preferredSessionDurationMinutes: fp.preferredSessionDuration ?? 60,
      workoutLocation: fp.workoutLocation,
      availableEquipment: fp.availableEquipment ?? [],
      preferredWorkoutTypes: fp.preferredWorkoutTypes ?? [],
      preferredTrainingDays: fp.preferredTrainingDays ?? [],
      sessionPreference: fp.sessionPreference ?? 'both',
      injuries: fp.injuries || 'none',
      limitations: fp.limitations || 'none',
      medicalNotes: fp.medicalNotes || 'none',
      likedExercises: fp.likedExercises || '',
      dislikedExercises: fp.dislikedExercises || '',
      bodyStats: {
        weightLb: fp.weightLb ?? null,
        heightCm: fp.heightCm ?? null,
        age: fp.age ?? null,
        sex: fp.sex ?? null,
        targetWeightLb: fp.targetWeightLb ?? null,
        // Set with a weight goal: the date it should land and the weekly rate the calories give
        goalTargetDate: fp.goalTargetDate ?? null,
        goalWeeklyLb: fp.goalWeeklyLb ?? null,
      },
      // Lift targets set on Plan: best set of 5, now and target, in lb. Build the main lifts around them.
      keyLifts: (fp.goalLifts ?? []).map((l: any) => ({ name: l.name, bestSetOf5Lb: l.startLb, targetLb: l.targetLb })),
    },
    nutritionTargets: {
      calorieTarget: nt.calorieTarget,
      proteinGrams: nt.proteinGrams,
      carbGrams: nt.carbGrams,
      fatGrams: nt.fatGrams,
    },
    outputFormat: 'Respond with only a JSON object matching outputSchema. No markdown fences and no text before or after it.',
    outputSchema: PLAN_SCHEMA,
  }, null, 2)
}


export function isValidPlan(plan: any): boolean {
  if (!plan?.summary?.planName) return false
  if (!Array.isArray(plan.weeklySchedule) || plan.weeklySchedule.length !== 7) return false
  if (plan.weeklySchedule.some((d: any, i: number) => d?.day !== DAYS[i] || !d.workout)) return false
  const workouts = plan.weeklySchedule.filter((d: any) => d.type === 'workout')
  if (!workouts.length) return false
  return workouts.every((d: any) =>
    Array.isArray(d.workout.exercises) && d.workout.exercises.length > 0 &&
    d.workout.exercises.every((e: any) => e?.name && typeof e.sets === 'number'))
}

// The nutrition numbers come from our own calculator; never trust the model's copy.
export function applyNutritionTargets(plan: any, nt: any) {
  plan.nutrition = {
    ...plan.nutrition,
    dailyCalories: nt.calorieTarget,
    proteinGrams: nt.proteinGrams,
    carbGrams: nt.carbGrams,
    fatGrams: nt.fatGrams,
  }
  return plan
}

// ── Deterministic fallback plan ───────────────────────────────────────────────
// Used only when Claude fails twice. Each goal has its own split of distinct
// sessions, with gym and home/outdoor variants of each exercise.

type Ex = {
  gym: string; home: string; sets: number; reps: string; rest: number
  intensity: string; tip: string; easier: string; harder: string
}

function ex(gym: string, home: string, sets: number, reps: string, rest: number,
            intensity: string, tip: string, easier: string, harder: string): Ex {
  return { gym, home, sets, reps, rest, intensity, tip, easier, harder }
}

type Session = { title: string; exercises: Ex[] }

export const SESSIONS: Record<string, Session[]> = {
  lose_weight: [
    { title: 'Full Body Circuit A', exercises: [
      ex('Goblet Squat', 'Bodyweight Squat', 3, '12-15', 60, 'Moderate, steady pace', 'Chest tall, sit between the hips', 'Squat to a chair', 'Jump squat'),
      ex('Dumbbell Bench Press', 'Push-Up', 3, '10-15', 60, 'RPE 7', 'Shoulder blades pinned back', 'Incline push-up', 'Slow 3s lowering'),
      ex('Seated Cable Row', 'Backpack Bent-Over Row', 3, '12-15', 60, 'RPE 7', 'Pull elbows to hips', 'Lighter load', 'Pause 1s at the top'),
      ex('Kettlebell Swing', 'Glute Bridge', 3, '15', 45, 'Brisk', 'Hinge at the hips, snap them forward', 'Smaller range', 'Single-leg version'),
      ex('Plank', 'Plank', 3, '30-45s', 45, 'Full tension', 'Squeeze glutes, ribs down', 'Knee plank', 'Plank with shoulder taps'),
    ] },
    { title: 'Conditioning Intervals', exercises: [
      ex('Rower Intervals', 'Fast Walk / Jog Intervals', 8, '30s hard / 60s easy', 0, 'Hard but repeatable', 'Hold the same pace every round', '6 rounds', '10 rounds'),
      ex('Bike Sprints', 'Jumping Jacks', 4, '20s', 40, 'High effort', 'Stay light and rhythmic', 'Step jacks', 'Add 10s'),
      ex('Battle Ropes', 'Mountain Climbers', 3, '30s', 30, 'Brisk', 'Hips level, core braced', 'Slow tempo', 'Faster pace'),
      ex('Dead Bug', 'Dead Bug', 3, '10 each side', 30, 'Controlled', 'Low back pressed into the floor', 'Legs only', 'Hold a weight overhead'),
    ] },
    { title: 'Full Body Circuit B', exercises: [
      ex('Dumbbell Reverse Lunge', 'Reverse Lunge', 3, '10 each leg', 60, 'RPE 7', 'Front shin vertical', 'Shorter stride', 'Add load'),
      ex('Lat Pulldown', 'Doorframe Row', 3, '12-15', 60, 'RPE 7', 'Drive elbows down to ribs', 'Lighter load', 'Slow lowering'),
      ex('Dumbbell Shoulder Press', 'Pike Push-Up', 3, '10-12', 60, 'RPE 7', 'Ribs down, no arching', 'Seated press / incline pike', 'Feet-elevated pike'),
      ex('Romanian Deadlift', 'Single-Leg Hip Hinge', 3, '12', 60, 'RPE 7', 'Push hips back, flat back', 'Shorter range', 'Add load'),
      ex('Farmer Carry', 'Bear Crawl', 3, '30-40s', 45, 'Steady', 'Tall posture, slow steps', 'Shorter distance', 'Heavier / longer'),
    ] },
  ],
  build_muscle: [
    { title: 'Push — Chest, Shoulders, Triceps', exercises: [
      ex('Barbell Bench Press', 'Push-Up', 4, '6-10', 120, 'RPE 8', 'Shoulder blades back, controlled descent', 'Dumbbell press / knee push-up', 'Add load / deficit push-up'),
      ex('Incline Dumbbell Press', 'Feet-Elevated Push-Up', 3, '8-12', 90, 'RPE 8', 'Press up and slightly back', 'Lower incline', 'Slow 3s lowering'),
      ex('Seated Dumbbell Shoulder Press', 'Pike Push-Up', 3, '8-12', 90, 'RPE 8', 'Elbows slightly forward', 'Lighter load', 'Add a pause'),
      ex('Cable Lateral Raise', 'Backpack Lateral Raise', 3, '12-15', 60, 'RPE 9', 'Lead with the elbows', 'Lighter load', 'Partial reps at the end'),
      ex('Rope Triceps Pushdown', 'Bench Dip', 3, '10-15', 60, 'RPE 9', 'Elbows fixed at your sides', 'Bent knees', 'Feet elevated'),
    ] },
    { title: 'Pull — Back & Biceps', exercises: [
      ex('Pull-Up or Lat Pulldown', 'Doorframe / Towel Row', 4, '6-10', 120, 'RPE 8', 'Lead with the chest, full stretch', 'Band-assisted', 'Add load'),
      ex('Chest-Supported Row', 'Backpack Bent-Over Row', 4, '8-12', 90, 'RPE 8', 'Squeeze shoulder blades together', 'Lighter load', 'Pause at the top'),
      ex('Single-Arm Cable Row', 'Single-Arm Backpack Row', 3, '10-12 each', 75, 'RPE 8', 'Elbow to the hip', 'Lighter load', 'Slow lowering'),
      ex('Face Pull', 'Prone Y-T-W Raise', 3, '12-15', 60, 'RPE 8', 'Pull to the forehead, thumbs back', 'Fewer reps', 'Add a pause'),
      ex('Dumbbell Curl', 'Backpack Curl', 3, '10-12', 60, 'RPE 9', 'No swinging', 'Lighter load', 'Slow 3s lowering'),
    ] },
    { title: 'Legs — Quads, Hamstrings, Glutes', exercises: [
      ex('Barbell Back Squat', 'Bulgarian Split Squat', 4, '6-10', 150, 'RPE 8', 'Brace hard, full depth', 'Goblet squat', 'Add load / pause at the bottom'),
      ex('Romanian Deadlift', 'Single-Leg Romanian Deadlift', 3, '8-10', 120, 'RPE 8', 'Hips back, bar close to legs', 'Shorter range', 'Add load'),
      ex('Leg Press', 'Step-Up', 3, '10-12', 90, 'RPE 8', 'Full range, knees track toes', 'Lower step', 'Add load'),
      ex('Lying Leg Curl', 'Glute Bridge Hamstring Walkout', 3, '10-12', 60, 'RPE 9', 'Control the lowering', 'Shorter walkout', 'Single leg'),
      ex('Standing Calf Raise', 'Single-Leg Calf Raise', 3, '12-15', 45, 'RPE 9', 'Full stretch at the bottom', 'Both legs', 'Add load'),
    ] },
    { title: 'Upper Body Volume', exercises: [
      ex('Dumbbell Bench Press', 'Push-Up', 3, '10-12', 90, 'RPE 8', 'Full range', 'Incline', 'Slow lowering'),
      ex('Lat Pulldown', 'Doorframe Row', 3, '10-12', 90, 'RPE 8', 'Elbows to ribs', 'Lighter load', 'Pause at bottom'),
      ex('Machine Shoulder Press', 'Pike Push-Up', 3, '10-12', 75, 'RPE 8', 'Ribs down', 'Lighter load', 'Feet elevated'),
      ex('Cable Fly', 'Wide Push-Up', 3, '12-15', 60, 'RPE 9', 'Hug a tree, slight elbow bend', 'Incline', 'Slow lowering'),
      ex('Hammer Curl + Overhead Extension', 'Backpack Curl + Diamond Push-Up', 3, '10-12 each', 60, 'RPE 9', 'Strict form', 'Lighter load', 'Add a set'),
    ] },
    { title: 'Lower Body Volume', exercises: [
      ex('Hack Squat', 'Goblet Squat (heavy backpack)', 3, '8-12', 120, 'RPE 8', 'Deep, controlled', 'Lighter load', 'Pause reps'),
      ex('Hip Thrust', 'Single-Leg Hip Thrust', 4, '8-12', 90, 'RPE 8', 'Chin tucked, full lockout', 'Two legs', 'Add load'),
      ex('Walking Lunge', 'Walking Lunge', 3, '10 each leg', 75, 'RPE 8', 'Long stride, upright torso', 'Static lunge', 'Add load'),
      ex('Leg Extension', 'Spanish Squat (band)', 3, '12-15', 60, 'RPE 9', 'Squeeze at the top', 'Fewer reps', 'Slow lowering'),
      ex('Seated Calf Raise', 'Calf Raise on a Step', 3, '15', 45, 'RPE 9', 'Pause at the top', 'Flat ground', 'Single leg'),
    ] },
    { title: 'Full Body A', exercises: [
      ex('Squat', 'Bodyweight Squat', 4, '6-10', 150, 'RPE 8', 'Brace, sit between the hips', 'Goblet squat', 'Add load'),
      ex('Bench Press', 'Push-Up', 3, '6-10', 120, 'RPE 8', 'Shoulder blades back', 'Dumbbell press', 'Add load'),
      ex('Lat Pulldown', 'Inverted Row', 3, '8-12', 90, 'RPE 8', 'Elbows to ribs', 'Lighter load', 'Pause at bottom'),
      ex('Romanian Deadlift', 'Single-Leg Romanian Deadlift', 3, '8-12', 90, 'RPE 8', 'Hips back, flat back', 'Shorter range', 'Add load'),
      ex('Standing Calf Raise', 'Single-Leg Calf Raise', 3, '12-15', 45, 'RPE 9', 'Full stretch at the bottom', 'Both legs', 'Add load'),
    ] },
    { title: 'Full Body B', exercises: [
      ex('Leg Press', 'Lunge', 3, '10-12', 120, 'RPE 8', 'Knees track toes', 'Shorter range', 'Add load'),
      ex('Overhead Press', 'Pike Push-Up', 3, '6-10', 120, 'RPE 8', 'Ribs down', 'Seated dumbbell press', 'Add load'),
      ex('Seated Cable Row', 'Backpack Bent-Over Row', 3, '8-12', 90, 'RPE 8', 'Squeeze shoulder blades', 'Lighter load', 'Pause at the top'),
      ex('Hip Thrust', 'Glute Bridge', 3, '8-12', 90, 'RPE 8', 'Full lockout, chin tucked', 'Two legs', 'Add load'),
      ex('Lying Leg Curl', 'Leg Curl (Dumbbell)', 3, '10-12', 60, 'RPE 9', 'Control the lowering', 'Lighter load', 'Single leg'),
    ] },
  ],
  improve_strength: [
    { title: 'Squat Focus', exercises: [
      ex('Barbell Back Squat', 'Pistol Squat Progression', 5, '5', 180, 'RPE 7-8', 'Big breath, brace, drive up', 'Box squat', 'Add 2.5-5kg per week'),
      ex('Paused Front Squat', 'Shrimp Squat', 3, '4', 150, 'RPE 7', 'Elbows high, upright torso', 'Goblet squat', 'Longer pause'),
      ex('Bulgarian Split Squat', 'Bulgarian Split Squat', 3, '6 each leg', 120, 'RPE 8', 'Front foot flat', 'Bodyweight', 'Add load'),
      ex('Hanging Leg Raise', 'Hollow Hold', 3, '8 / 30s', 60, 'Strict', 'No swinging', 'Knee raise / tuck hold', 'Toes to bar'),
    ] },
    { title: 'Press Focus', exercises: [
      ex('Barbell Bench Press', 'Weighted Push-Up', 5, '5', 180, 'RPE 7-8', 'Leg drive, bar to lower chest', 'Dumbbell press', 'Add load weekly'),
      ex('Standing Overhead Press', 'Handstand Push-Up Progression', 4, '5', 150, 'RPE 8', 'Glutes tight, press straight up', 'Pike push-up', 'Add load'),
      ex('Weighted Dip', 'Bench Dip', 3, '6', 120, 'RPE 8', 'Slight forward lean', 'Bodyweight', 'Add load'),
      ex('Barbell Row', 'Backpack Row', 3, '6', 120, 'RPE 8', 'Flat back, pull to the belly', 'Chest-supported', 'Add load'),
    ] },
    { title: 'Deadlift Focus', exercises: [
      ex('Conventional Deadlift', 'Single-Leg Romanian Deadlift (heavy)', 5, '3', 210, 'RPE 7-8', 'Slack out of the bar, push the floor away', 'Trap bar / lighter', 'Add load weekly'),
      ex('Romanian Deadlift', 'Nordic Curl Negative', 3, '6', 150, 'RPE 8', 'Hips back, lats tight', 'Shorter range', 'Add load'),
      ex('Weighted Pull-Up', 'Pull-Up', 4, '4-6', 150, 'RPE 8', 'Dead hang to chin over bar', 'Band-assisted', 'Add load'),
      ex('Farmer Carry', 'Suitcase Carry (backpack)', 3, '30m', 90, 'Heavy', 'Tall posture', 'Lighter', 'Heavier'),
    ] },
    { title: 'Upper Strength Accessories', exercises: [
      ex('Close-Grip Bench Press', 'Diamond Push-Up', 4, '6', 150, 'RPE 8', 'Elbows tucked', 'Incline', 'Add load'),
      ex('Pendlay Row', 'Inverted Row', 4, '6', 120, 'RPE 8', 'Explosive pull, controlled lower', 'Higher bar', 'Feet elevated'),
      ex('Push Press', 'Pike Push-Up', 3, '5', 150, 'RPE 8', 'Dip and drive with the legs', 'Strict press', 'Add load'),
      ex('Ab Wheel Rollout', 'Plank Walkout', 3, '8', 60, 'Strict', 'Ribs down, no sagging', 'From knees', 'Standing rollout'),
    ] },
  ],
  improve_endurance: [
    { title: 'Zone 2 Steady Cardio', exercises: [
      ex('Treadmill / Bike — Zone 2', 'Easy Run or Brisk Walk — Zone 2', 1, '30-45 min', 0, 'Conversational pace', 'You should be able to talk in full sentences', '20 min', '60 min'),
      ex('Plank', 'Plank', 2, '45s', 45, 'Steady', 'Squeeze glutes, ribs down', 'Knee plank', '60s'),
    ] },
    { title: 'Intervals', exercises: [
      ex('Rower / Bike Intervals', 'Hill or Track Intervals', 6, '2 min hard / 2 min easy', 0, 'RPE 8 on hard efforts', 'Same pace every rep', '4 rounds', '8 rounds'),
      ex('Burpee', 'Burpee', 3, '10', 60, 'Brisk', 'Land softly', 'Step-back burpee', 'Add a jump'),
      ex('Mountain Climbers', 'Mountain Climbers', 3, '40s', 30, 'Brisk', 'Hips level', 'Slower', 'Faster'),
    ] },
    { title: 'Muscular Endurance Circuit', exercises: [
      ex('Goblet Squat', 'Bodyweight Squat', 3, '20', 30, 'Steady', 'Full depth', 'Half depth', 'Jump squat'),
      ex('Push-Up', 'Push-Up', 3, '15-20', 30, 'Steady', 'Straight body line', 'Knee push-up', 'Feet elevated'),
      ex('Walking Lunge', 'Walking Lunge', 3, '20 steps', 30, 'Steady', 'Upright torso', 'Static lunge', 'Add load'),
      ex('TRX Row', 'Inverted Row', 3, '15', 30, 'Steady', 'Squeeze the back', 'More upright', 'Feet elevated'),
      ex('Jump Rope', 'Jumping Jacks', 3, '60s', 30, 'Brisk', 'Small hops', 'Step jacks', 'Double unders'),
    ] },
    { title: 'Tempo Session', exercises: [
      ex('Treadmill Tempo Run', 'Tempo Run', 1, '20 min', 0, 'Comfortably hard (RPE 7)', 'Hold a steady, controlled pace', '12 min', '30 min'),
      ex('Step-Up', 'Step-Up', 3, '15 each leg', 30, 'Steady', 'Drive through the front heel', 'Lower step', 'Add load'),
      ex('Side Plank', 'Side Plank', 2, '30s each side', 30, 'Steady', 'Hips high', 'Knees down', 'Leg raised'),
    ] },
  ],
  athletic_performance: [
    { title: 'Lower Power & Strength', exercises: [
      ex('Box Jump', 'Broad Jump', 4, '3', 90, 'Max intent', 'Land softly, stick the landing', 'Lower box / shorter jump', 'Higher box'),
      ex('Trap Bar Deadlift', 'Single-Leg Romanian Deadlift', 4, '4', 150, 'RPE 8', 'Push the floor away fast', 'Lighter load', 'Add load'),
      ex('Rear-Foot-Elevated Split Squat', 'Rear-Foot-Elevated Split Squat', 3, '5 each leg', 120, 'RPE 8', 'Front knee tracks toes', 'Bodyweight', 'Add load'),
      ex('Sled Push', 'Hill Sprint', 4, '15-20m', 90, 'Max effort', 'Drive with the legs, low angle', 'Lighter / shorter', 'Heavier / longer'),
    ] },
    { title: 'Speed & Agility', exercises: [
      ex('Acceleration Sprint', 'Acceleration Sprint', 6, '20m', 90, 'Max effort, full recovery', 'Lean forward, drive the knees', '10m', '30m'),
      ex('Lateral Bound', 'Lateral Bound', 3, '5 each side', 60, 'Explosive', 'Stick each landing', 'Smaller bounds', 'Add a pause'),
      ex('Cone Shuttle (5-10-5)', 'Pro Agility Shuttle', 4, '1', 90, 'Max effort', 'Stay low on the turns', 'Slower', 'Timed'),
      ex('Pallof Press', 'Side Plank with Reach', 3, '10 each side', 45, 'Controlled', 'Resist the rotation', 'Lighter band', 'Longer hold'),
    ] },
    { title: 'Upper Power & Strength', exercises: [
      ex('Medicine Ball Chest Pass', 'Plyo Push-Up', 4, '5', 90, 'Max intent', 'Explode out', 'Incline plyo push-up', 'Clap push-up'),
      ex('Bench Press', 'Weighted Push-Up', 4, '4-5', 150, 'RPE 8', 'Fast press, controlled lower', 'Dumbbell press', 'Add load'),
      ex('Weighted Pull-Up', 'Pull-Up', 4, '5', 120, 'RPE 8', 'Full range', 'Band-assisted', 'Add load'),
      ex('Med Ball Rotational Throw', 'Rotational Band Chop', 3, '6 each side', 60, 'Explosive', 'Power from the hips', 'Lighter', 'Heavier'),
    ] },
    { title: 'Conditioning', exercises: [
      ex('Assault Bike Sprints', 'Shuttle Runs', 8, '15s on / 45s off', 0, 'Max effort', 'All-out every rep', '6 rounds', '10 rounds'),
      ex('Kettlebell Swing', 'Squat Jump', 3, '12', 60, 'Explosive', 'Snap the hips', 'Bodyweight hinge', 'Heavier'),
      ex('Farmer Carry', 'Bear Crawl', 3, '30m', 60, 'Steady', 'Tall posture', 'Shorter', 'Longer'),
    ] },
  ],
  general_fitness: [
    { title: 'Full Body Strength A', exercises: [
      ex('Goblet Squat', 'Bodyweight Squat', 3, '8-12', 75, 'RPE 7', 'Chest tall', 'Squat to a chair', 'Add load'),
      ex('Dumbbell Bench Press', 'Push-Up', 3, '8-12', 75, 'RPE 7', 'Controlled lowering', 'Incline push-up', 'Feet elevated'),
      ex('Seated Cable Row', 'Backpack Row', 3, '10-12', 75, 'RPE 7', 'Elbows to hips', 'Lighter', 'Pause at top'),
      ex('Plank', 'Plank', 3, '30-45s', 45, 'Steady', 'Squeeze glutes', 'Knee plank', '60s'),
    ] },
    { title: 'Cardio & Core', exercises: [
      ex('Bike / Rower Steady', 'Brisk Walk or Jog', 1, '20-25 min', 0, 'Moderate', 'Steady breathing', '15 min', '30 min'),
      ex('Dead Bug', 'Dead Bug', 3, '10 each side', 30, 'Controlled', 'Back flat on the floor', 'Legs only', 'Add a weight'),
      ex('Side Plank', 'Side Plank', 2, '30s each side', 30, 'Steady', 'Hips high', 'Knees down', 'Leg raised'),
      ex('Bird Dog', 'Bird Dog', 2, '10 each side', 30, 'Controlled', 'Hips square', 'Arms only', 'Add a pause'),
    ] },
    { title: 'Full Body Strength B', exercises: [
      ex('Romanian Deadlift', 'Single-Leg Hip Hinge', 3, '8-12', 75, 'RPE 7', 'Hips back, flat back', 'Shorter range', 'Add load'),
      ex('Lat Pulldown', 'Doorframe Row', 3, '10-12', 75, 'RPE 7', 'Elbows to ribs', 'Lighter', 'Slow lowering'),
      ex('Dumbbell Shoulder Press', 'Pike Push-Up', 3, '8-12', 75, 'RPE 7', 'Ribs down', 'Seated', 'Feet elevated'),
      ex('Reverse Lunge', 'Reverse Lunge', 3, '10 each leg', 60, 'RPE 7', 'Front shin vertical', 'Shorter stride', 'Add load'),
    ] },
  ],
  mobility_flexibility: [
    { title: 'Hips & Lower Body Mobility', exercises: [
      ex('90/90 Hip Switch', '90/90 Hip Switch', 2, '8 each side', 30, 'Slow, controlled', 'Tall spine', 'Hands behind for support', 'No hands'),
      ex('Couch Stretch', 'Couch Stretch', 2, '45s each side', 15, 'Gentle', 'Squeeze the back glute', 'Back knee on a pillow', 'Torso upright'),
      ex('Cossack Squat', 'Cossack Squat', 2, '6 each side', 45, 'Controlled', 'Heel stays down', 'Hold a support', 'Add a weight'),
      ex('Deep Squat Hold', 'Deep Squat Hold', 3, '30-45s', 30, 'Relaxed', 'Elbows push knees out', 'Hold a door frame', 'Add a weight'),
      ex('Jefferson Curl (light)', 'Standing Toe Touch Roll-Down', 2, '8', 45, 'Very light', 'Roll down one vertebra at a time', 'Bodyweight', 'Light plate'),
    ] },
    { title: 'Spine & Shoulders', exercises: [
      ex('Cat-Cow', 'Cat-Cow', 2, '10', 15, 'Slow', 'Move through every segment', 'Smaller range', 'Add a pause'),
      ex('Thoracic Open Book', 'Thoracic Open Book', 2, '8 each side', 15, 'Slow', 'Follow the hand with your eyes', 'Smaller range', 'Hold 3s'),
      ex('Band Pull-Apart', 'Wall Slide', 3, '15', 30, 'Light', 'Shoulders down', 'Lighter band', 'Slow tempo'),
      ex('Doorway Pec Stretch', 'Doorway Pec Stretch', 2, '45s each side', 15, 'Gentle', 'Step through slowly', 'Lower arm', 'Higher arm'),
      ex('Dead Hang', 'Child\'s Pose with Side Reach', 3, '20-30s', 45, 'Relaxed', 'Let the shoulders open', 'Feet on floor', 'Longer hold'),
    ] },
    { title: 'Yoga Flow & Stability', exercises: [
      ex('Sun Salutation Flow', 'Sun Salutation Flow', 3, '3 rounds', 30, 'Flowing', 'Match movement to breath', 'Knees down in plank', 'Add chaturanga'),
      ex('World\'s Greatest Stretch', 'World\'s Greatest Stretch', 2, '5 each side', 30, 'Controlled', 'Elbow to instep, then rotate', 'Smaller range', 'Add a hamstring reach'),
      ex('Single-Leg Balance', 'Single-Leg Balance', 2, '30s each side', 15, 'Steady', 'Soft knee, eyes forward', 'Hand on wall', 'Eyes closed'),
      ex('Glute Bridge Hold', 'Glute Bridge Hold', 3, '30s', 30, 'Steady', 'Ribs down, squeeze glutes', 'Shorter hold', 'Single leg'),
    ] },
  ],
}
SESSIONS.maintain_weight = SESSIONS.general_fitness

// Evenly spaced default training days for each weekly frequency
export const DEFAULT_DAYS: Record<number, string[]> = {
  1: ['Wednesday'],
  2: ['Monday', 'Thursday'],
  3: ['Monday', 'Wednesday', 'Friday'],
  4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  5: ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'],
  6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  7: DAYS,
}

const WARMUPS: Record<string, any[]> = {
  default: [
    { name: 'Light Cardio', duration: '3-5 min', instructions: 'Bike, row or brisk walk to raise your heart rate gradually.' },
    { name: 'Arm Circles & Leg Swings', duration: '2 min', instructions: '10 each direction. Increase range gradually.' },
    { name: 'Ramp-Up Sets', duration: '3 min', instructions: '2 light sets of the first exercise before working sets.' },
  ],
  mobility_flexibility: [
    { name: 'Breathing Reset', duration: '2 min', instructions: 'Slow nasal breathing, 4s in, 6s out.' },
    { name: 'Joint Circles', duration: '3 min', instructions: 'Neck, shoulders, hips, knees and ankles, 5 circles each way.' },
  ],
  athletic_performance: [
    { name: 'Jog & Skips', duration: '4 min', instructions: 'Easy jog, A-skips and high knees.' },
    { name: 'Dynamic Stretches', duration: '3 min', instructions: 'Walking lunges with rotation, leg swings, inchworms.' },
    { name: 'Build-Up Sprints', duration: '2 min', instructions: '3 x 20m at 60%, 75%, 90% effort.' },
  ],
}

const COOLDOWN = [
  { name: 'Easy Walk', duration: '2-3 min', instructions: 'Let your heart rate come down.' },
  { name: 'Hamstring & Quad Stretch', duration: '1 min each', instructions: 'Hold gently, no bouncing.' },
  { name: "Child's Pose", duration: '1 min', instructions: 'Breathe slowly and relax the back.' },
]

// Which sessions a week uses, by training days, so muscle plans always train legs twice or more.
// Indexes into SESSIONS.build_muscle: 0 push, 1 pull, 2 legs, 3 upper, 4 lower, 5 full A, 6 full B.
export const MUSCLE_SPLITS: Record<number, number[]> = {
  1: [5], 2: [5, 6], 3: [3, 2, 5], 4: [3, 2, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 0, 1, 4], 7: [0, 1, 2, 0, 1, 4, 5],
}
// The easy cardio day muscle and strength plans get between lifting days
const CARDIO_DAY = {
  type: 'active_recovery', title: 'Easy Cardio', sessionMode: 'solo', durationMinutes: 30,
  recoveryNotes: '20-30 min of easy cardio you could talk through: incline walk, stationary bike or elliptical. Helps recovery and heart health without eating into muscle gains.',
}

// Which goal's sessions fill the week. With a weight goal and a training goal picked together
// (lose weight + build muscle), the training goal shapes the sessions; the weight goal already set
// the calories, and losing weight adds cardio.
const WEIGHT_GOALS = ['lose_weight', 'gain_weight', 'maintain_weight']
export function trainingGoal(fp: any): string {
  const second = (fp.secondaryGoals ?? []).find((g: string) => g !== fp.primaryGoal)
  let g = WEIGHT_GOALS.includes(fp.primaryGoal) && second && !WEIGHT_GOALS.includes(second) ? second : fp.primaryGoal
  if (g === 'gain_weight') g = 'build_muscle'
  return SESSIONS[g] ? g : 'general_fitness'
}

export function makeFallbackPlan(fp: any, nt: any): any {
  const goal = trainingGoal(fp)
  const goals = [fp.primaryGoal, ...(fp.secondaryGoals ?? [])].filter((g: string, i: number, a: string[]) => g && a.indexOf(g) === i).slice(0, 2)
  const label = goals.length > 1 ? goals.map((g: string) => GOAL_LABELS[g] ?? g).join(' + ') : GOAL_LABELS[goal]
  // The rest-day cardio: a swim when swimming is one of the goals
  const cardioDay = goals.includes('swimming')
    ? { ...CARDIO_DAY, title: 'Swim', recoveryNotes: '20-40 min in the pool: 5 min easy, technique drills, then steady laps. Log it on the Swim tab.' }
    : CARDIO_DAY
  const days = Math.min(Math.max(fp.workoutDaysPerWeek ?? 3, 1), 7)
  const useGym = fp.workoutLocation === 'gym' || fp.workoutLocation === 'any'
  const beginner = fp.experienceLevel === 'beginner'

  const preferred = DAYS.filter(d => fp.preferredTrainingDays?.includes(d))
  const trainingDays = preferred.length >= days ? preferred.slice(0, days) : DEFAULT_DAYS[days]

  const sessions = SESSIONS[goal]
  const warmup = WARMUPS[goal] ?? WARMUPS.default
  const avoid = (fp.dislikedExercises ?? '').toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean)
  // Conditioning-friendly goals get a light active-recovery day instead of full rest
  const activeRecoveryGoals = ['lose_weight', 'improve_endurance', 'general_fitness', 'maintain_weight']
  let activeRecoveryUsed = false

  const schedule = DAYS.map(day => {
    const idx = trainingDays.indexOf(day)
    if (idx !== -1) {
      const split = goal === 'build_muscle' ? MUSCLE_SPLITS[days] : null
      const session = split ? sessions[split[idx % split.length]] : sessions[idx % sessions.length]
      const all = session.exercises
        .map(e => ({
          name: useGym ? e.gym : e.home,
          sets: beginner ? Math.max(e.sets - 1, 1) : e.sets,
          reps: e.reps,
          restSeconds: e.rest,
          intensityNote: e.intensity,
          formTip: e.tip,
          easierVersion: e.easier,
          harderVersion: e.harder,
          equipment: useGym ? 'Gym' : 'Bodyweight / home',
        }))
      const liked = all.filter(e => !avoid.some((a: string) => e.name.toLowerCase().includes(a)))
      // If the dislikes would empty the session, keep it rather than leave a workout day with nothing in it
      const exercises = liked.length ? liked : all
      return {
        day, type: 'workout', title: session.title,
        sessionMode: fp.sessionPreference === 'group' ? 'group' : 'solo_or_group',
        durationMinutes: fp.preferredSessionDuration ?? 45,
        workout: { warmup, exercises, cooldown: COOLDOWN },
        recoveryNotes: '',
      }
    }
    if ((goal === 'build_muscle' || goal === 'improve_strength' || goals.includes('swimming') || goals.includes('lose_weight')) && !activeRecoveryUsed && days < 6) {
      activeRecoveryUsed = true
      return { day, ...cardioDay, workout: { warmup: [], exercises: [], cooldown: [] } }
    }
    if (activeRecoveryGoals.includes(goal) && !activeRecoveryUsed && days < 6) {
      activeRecoveryUsed = true
      return {
        day, type: 'active_recovery', title: 'Active Recovery',
        sessionMode: 'solo', durationMinutes: 30,
        workout: { warmup: [], exercises: [], cooldown: [] },
        recoveryNotes: '20-30 min easy walk or bike plus 10 min of gentle stretching. Aim for 8-10k steps.',
      }
    }
    return {
      day, type: 'rest', title: 'Rest & Recovery',
      sessionMode: 'solo', durationMinutes: 0,
      workout: { warmup: [], exercises: [], cooldown: [] },
      recoveryNotes: 'Full rest or a light walk. Prioritise sleep and hydration.',
    }
  })

  const strategy = goal === 'improve_strength'
    ? 'Add 2.5-5 kg to the main lifts each week while all sets stay at RPE 8 or below.'
    : goal === 'mobility_flexibility'
      ? 'Add 10-15s to holds or 1-2 reps each week as range of motion improves.'
      : goal === 'improve_endurance'
        ? 'Add about 10% to cardio duration or one interval each week.'
        : 'Add 1-2 reps per set each week; when you hit the top of the rep range, increase the weight.'

  return {
    summary: {
      goal: GOAL_LABELS[fp.primaryGoal] ? fp.primaryGoal : goal, planName: `${label} Foundation Plan`, durationWeeks: 8,
      trainingDaysPerWeek: days,
      overview: `A ${days}-day ${label.toLowerCase()} program built around ${[...new Set(schedule.filter(d => d.type === 'workout').map(d => d.title))].join(', ')}.`,
      weeklyStrategy: strategy,
    },
    nutrition: {
      dailyCalories: nt.calorieTarget,
      proteinGrams: nt.proteinGrams,
      carbGrams: nt.carbGrams,
      fatGrams: nt.fatGrams,
      hydrationAdvice: 'Drink at least 2–3 litres of water per day. Add an extra 500 ml on training days.',
      mealTimingAdvice: 'Eat a protein-rich meal within 2 hours of training to support recovery.',
      keyNotes: ['Hitting your daily protein target is the single highest-impact nutrition habit.', 'Consistency over perfection — one off day does not derail progress.'],
    },
    weeklySchedule: schedule,
    progression: {
      weeklyStrategy: strategy,
      whenToIncreaseWeight: 'When you complete all sets and reps with good form and at least 2 reps left in the tank.',
      whenToReduceIntensity: 'If you experience joint pain, soreness lasting 3+ days, or disrupted sleep.',
      deloadGuidance: 'Every 4–6 weeks take a deload week: reduce weight by 20% and drop one set per exercise.',
    },
    advice: {
      topPriorities: ['Show up consistently — frequency beats intensity', `Hit ${nt.proteinGrams}g protein daily`, 'Sleep 7–9 hours — this is when adaptation happens'],
      recoveryTips: ['Use rest days for light walks or gentle stretching', 'Foam roll any tight areas after sessions'],
      sleepAdvice: '7–9 hours of quality sleep is when your body recovers and adapts.',
      consistencyTips: ['Schedule sessions like appointments', 'Start lighter than you think you need to'],
      commonMistakes: ['Skipping warm-ups', 'Adding weight too fast and compromising form', 'Underestimating sleep'],
    },
    safety: {
      warnings: fp.injuries ? [`You noted: "${fp.injuries}". Avoid any movement that aggravates this area.`] : [],
      professionalAdviceRecommended: false,
      exercisesToAvoid: avoid,
    },
  }
}

// ── Recent progress for weekly adaptation ─────────────────────────────────────
// Read with the user's JWT, so RLS limits every query to their own rows.

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

export async function gatherProgress(supabase: any, currentPlan: any) {
  const since = isoDaysAgo(14)
  const [checkins, workouts, health, weights] = await Promise.all([
    supabase.from('progress_checkins').select('*').order('created_at', { ascending: false }).limit(2),
    supabase.from('workout_logs').select('name, duration, sets, created_at').gte('created_at', since).order('created_at'),
    supabase.from('daily_health').select('date, steps, sleep_hours, resting_hr').gte('date', since.slice(0, 10)),
    supabase.from('body_measurements').select('date, weight_lb').not('weight_lb', 'is', null).order('date', { ascending: false }).limit(10),
  ])

  // Best set per exercise across the last two weeks
  const bestSets: Record<string, { weight: number; reps: number; sessions: number }> = {}
  for (const w of workouts.data ?? []) {
    const seen = new Set<string>()
    for (const s of w.sets ?? []) {
      const b = bestSets[s.ex] ??= { weight: 0, reps: 0, sessions: 0 }
      if (s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps)) { b.weight = s.weight; b.reps = s.reps }
      if (!seen.has(s.ex)) { seen.add(s.ex); b.sessions++ }
    }
  }

  const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null
  const h = health.data ?? []
  const plannedPerWeek = currentPlan?.training_days_per_week ?? null

  return {
    previousPlan: currentPlan ? {
      name: currentPlan.plan_data?.summary?.planName,
      week: currentPlan.plan_data?.week ?? 1,
      schedule: (currentPlan.plan_data?.weeklySchedule ?? []).map((d: any) => ({
        day: d.day, type: d.type, title: d.title,
        exercises: (d.workout?.exercises ?? []).map((e: any) => `${e.name} ${e.sets}x${e.reps}`),
      })),
    } : null,
    adherence: {
      plannedSessionsPerWeek: plannedPerWeek,
      completedSessionsLast14Days: (workouts.data ?? []).length,
      sessions: (workouts.data ?? []).map((w: any) => ({ date: w.created_at.slice(0, 10), name: w.name, duration: w.duration })),
    },
    bestSetsLast14Days: bestSets,
    checkins: (checkins.data ?? []).map((c: any) => ({
      date: c.created_at.slice(0, 10), weightLb: c.weight_lb, energy: c.energy_level, sleepQuality: c.sleep_quality,
      soreness: c.soreness_level, stress: c.stress_level, notes: c.notes,
    })),
    scalesNote: 'energy and sleepQuality: 1 poor to 5 great; soreness and stress: 1 low to 5 high',
    health: h.length ? {
      avgSteps: avg(h.map((d: any) => d.steps).filter(Boolean)),
      avgSleepHours: avg(h.map((d: any) => d.sleep_hours).filter(Boolean)),
      avgRestingHr: avg(h.map((d: any) => d.resting_hr).filter(Boolean)),
    } : null,
    weightTrend: (weights.data ?? []).reverse(),
  }
}
