// Example plan shown behind the Pro lock on the Plan tab, so free users see what they'd get.
// Same shape as fitness_plans rows; never saved.

const ex = (name, sets, reps, restSeconds, formTip) => ({ name, sets, reps, restSeconds, formTip, equipment: 'Gym' })
const warmup = [{ name: 'Easy bike', duration: '5 min' }, { name: 'Dynamic stretches', duration: '5 min' }]
const cooldown = [{ name: 'Stretching', duration: '5 min' }]
const workout = (day, title, exercises) => ({
  day, type: 'workout', title, durationMinutes: 55, sessionMode: 'solo',
  workout: { warmup, exercises, cooldown }, recoveryNotes: '',
})
const rest = (day, type = 'rest') => ({
  day, type, title: type === 'rest' ? 'Rest & Recovery' : 'Active Recovery', durationMinutes: 0,
  workout: { warmup: [], exercises: [], cooldown: [] },
  recoveryNotes: type === 'rest' ? 'Full rest or a light walk. Prioritise sleep.' : '30 min easy walk plus 10 min mobility.',
})

const upper = [
  ex('Barbell Bench Press', 4, '6-8', 120, 'Shoulder blades pinned, feet planted'),
  ex('Barbell Row', 4, '8-10', 90, 'Flat back, pull to the lower ribs'),
  ex('Seated Dumbbell Shoulder Press', 3, '8-12', 90, 'Ribs down, press straight up'),
  ex('Lat Pulldown', 3, '10-12', 75, 'Lead with the elbows'),
  ex('Dumbbell Curl', 3, '10-12', 60, 'No swinging'),
]
const lower = [
  ex('Barbell Back Squat', 4, '5-8', 150, 'Brace hard, knees track over toes'),
  ex('Romanian Deadlift', 3, '8-10', 120, 'Hinge at the hips, soft knees'),
  ex('Bulgarian Split Squat', 3, '10 each side', 90, 'Stay tall, control the descent'),
  ex('Lying Leg Curl', 3, '10-12', 60, 'Pause at the top'),
  ex('Standing Calf Raise', 4, '12-15', 45, 'Full range, slow lowering'),
]

export const SAMPLE_PLAN = {
  id: 'sample', primary_goal: 'build_muscle', duration_weeks: 8, training_days_per_week: 4,
  created_at: new Date().toISOString(),
  plan_data: {
    week: 1,
    summary: { planName: 'Muscle Builder', durationWeeks: 8, trainingDaysPerWeek: 4 },
    nutrition: { dailyCalories: 2750, proteinGrams: 180, carbGrams: 320, fatGrams: 80 },
    weeklySchedule: [
      workout('Monday', 'Upper Body Strength', upper),
      workout('Tuesday', 'Lower Body Strength', lower),
      rest('Wednesday', 'active_recovery'),
      workout('Thursday', 'Upper Body Volume', upper),
      workout('Friday', 'Lower Body Volume', lower),
      rest('Saturday'),
      rest('Sunday'),
    ],
    advice: {
      topPriorities: ['Hit 180g protein every day', 'Add a rep or a little weight each week', 'Sleep 7-9 hours'],
      recoveryTips: ['Walk on rest days', 'Foam roll tight areas'],
      sleepAdvice: 'Keep a consistent bedtime; growth happens while you sleep.',
    },
    progression: {
      weeklyStrategy: 'Add 1-2 reps per set each week; when you reach the top of the range, add weight and drop back down.',
      deloadGuidance: 'Every 5th week, cut sets in half.',
    },
  },
}

