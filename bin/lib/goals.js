// Mifflin-St Jeor BMR × moderate activity multiplier (1.55)
export function calcGoals(profile) {
  if (!profile?.height_cm || !profile?.weight_lb) {
    return { calories: 2000, protein: 150, carbs: 220 }
  }

  const { sex, height_cm, weight_lb } = profile
  const age = profile.age ?? 30
  const kg  = weight_lb / 2.20462

  const base = (10 * kg) + (6.25 * height_cm) - (5 * age)
  const bmr  = sex === 'female' ? base - 161 : sex === 'male' ? base + 5 : base - 78

  const calories = Math.round(bmr * 1.55)
  const protein  = Math.round(weight_lb * 0.9)          // ~1 g/lb for active users
  const carbs    = Math.round((calories * 0.42) / 4)    // 42 % of cals from carbs

  return { calories, protein, carbs }
}

// Returns goals the app should use, preferring any user overrides stored in profile
export function resolveGoals(profile) {
  const calc = calcGoals(profile)
  return {
    calories:   profile?.calorie_goal ?? calc.calories,
    protein:    profile?.protein_goal ?? calc.protein,
    carbs:      profile?.carb_goal    ?? calc.carbs,
    calculated: calc,
    isCustom:   !!(profile?.calorie_goal || profile?.protein_goal || profile?.carb_goal),
  }
}
