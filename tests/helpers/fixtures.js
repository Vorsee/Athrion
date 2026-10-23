const ex = (name, sets = 3, reps = '8-12') => ({ name, sets, reps, restSeconds: 90, equipment: 'Gym', formTip: 'Brace', easierVersion: 'Easier ' + name, harderVersion: 'Harder ' + name })
const workout = (day, title, exercises) => ({ day, type: 'workout', title, durationMinutes: 45, sessionMode: 'solo', workout: { warmup: [{ name: 'Jog', duration: '5 min' }], exercises, cooldown: [{ name: 'Stretch', duration: '5 min' }] }, recoveryNotes: '' })
const rest = (day, type = 'rest') => ({ day, type, title: type === 'rest' ? 'Rest & Recovery' : 'Active Recovery', durationMinutes: 0, workout: { warmup: [], exercises: [], cooldown: [] }, recoveryNotes: 'Light walk and stretching.' })

// Friday is a rest day; Monday and Wednesday are workouts
export const planRow = {
  id: 'plan-1', status: 'active', created_at: '2026-10-19T10:00:00Z', training_days_per_week: 2,
  plan_data: {
    week: 1,
    summary: { planName: 'Muscle Plan', goal: 'build_muscle', durationWeeks: 8, trainingDaysPerWeek: 2, overview: 'Two days', weeklyStrategy: 'Add reps' },
    nutrition: { dailyCalories: 2500, proteinGrams: 180, carbGrams: 280, fatGrams: 70, keyNotes: [] },
    weeklySchedule: [
      workout('Monday', 'Upper Body', [ex('Barbell Bench Press'), ex('Barbell Row')]),
      rest('Tuesday'),
      workout('Wednesday', 'Lower Body', [ex('Squat', 4, '5'), ex('Romanian Deadlift')]),
      rest('Thursday'), rest('Friday'), rest('Saturday', 'active_recovery'), rest('Sunday'),
    ],
    progression: { weeklyStrategy: 'Add reps', whenToIncreaseWeight: 'x', whenToReduceIntensity: 'y', deloadGuidance: 'z' },
    advice: { topPriorities: ['Sleep'], recoveryTips: [], sleepAdvice: '8h', consistencyTips: [], commonMistakes: [] },
    safety: { warnings: [], professionalAdviceRecommended: false, exercisesToAvoid: [] },
    adaptation: { summary: 'Your starting plan.', changes: [] },
  },
}

export const withWorkoutOn = (day) => {
  const p = structuredClone(planRow)
  const i = p.plan_data.weeklySchedule.findIndex(d => d.day === day)
  p.plan_data.weeklySchedule[i] = workout(day, 'Full Body', [ex('Goblet Squat'), ex('Push-Up', 3, '10')])
  return p
}

export const profile = { user_id: 'user-1', sex: 'male', height_cm: 180, weight_lb: 180, age: 30 }
export const fitnessProfile = { user_id: 'user-1', primary_goal: 'build_muscle', activity_level: 'moderately_active', experience_level: 'intermediate', workout_days_per_week: 2, workout_location: 'gym', onboarding_completed: true }
