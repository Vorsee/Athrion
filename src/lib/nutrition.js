// ── Nutrition Calculation Service ─────────────────────────────────────────────
// Deterministic only. The AI receives these numbers and explains them.
// It must not invent or change calorie/macro values.
//
// Formula: Mifflin–St Jeor BMR × activity multiplier + goal adjustment
// Version: 1

const CALC_VERSION = 1
const CALC_FORMULA = 'mifflin_st_jeor'

// ── Constants (configurable in this one file) ─────────────────────────────────

const ACTIVITY_MULTIPLIERS = {
  sedentary:         1.20,
  lightly_active:    1.375,
  moderately_active: 1.55,
  very_active:       1.725,
  athlete:           1.90,
}

// Daily kcal adjustment from TDEE, by primary goal. Conservative limits.
const GOAL_ADJUSTMENTS = {
  lose_weight:          -400,
  build_muscle:         +250,
  improve_strength:     +150,
  improve_endurance:       0,
  athletic_performance: +200,
  maintain_weight:         0,
  general_fitness:         0,
  mobility_flexibility:    0,
}

// Safety floor: minimum calories the system will ever recommend, by sex.
const MIN_CALORIES = {
  male:   1500,
  female: 1200,
  other:  1350,
}

// Minimum daily fat grams regardless of calculation result.
const MIN_FAT_GRAMS = 40

// Protein per lb of body weight, by goal.
const PROTEIN_PER_LB = {
  lose_weight:          1.00,
  build_muscle:         1.00,
  improve_strength:     0.90,
  improve_endurance:    0.70,
  athletic_performance: 0.90,
  maintain_weight:      0.80,
  general_fitness:      0.80,
  mobility_flexibility: 0.70,
}

// Fat as a fraction of total calories, by goal.
const FAT_FRACTION = {
  lose_weight:          0.25,
  build_muscle:         0.25,
  improve_strength:     0.30,
  improve_endurance:    0.20,
  athletic_performance: 0.25,
  maintain_weight:      0.30,
  general_fitness:      0.28,
  mobility_flexibility: 0.30,
}

// ── Core formulas ─────────────────────────────────────────────────────────────

export function calcBMR({ sex, weightLb, heightCm, age }) {
  const kg = weightLb / 2.20462
  const base = (10 * kg) + (6.25 * heightCm) - (5 * age)
  if (sex === 'male')   return Math.round(base + 5)
  if (sex === 'female') return Math.round(base - 161)
  // 'other' / prefer not to say: average of male and female adjustments
  return Math.round(base - 78)
}

export function calcTDEE(bmr, activityLevel) {
  const mult = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderately_active
  return Math.round(bmr * mult)
}

// Split a calorie target into protein / fat / carbs for a goal, with safety floors
export function macrosForCalories({ calories, sex, weightLb, primaryGoal }) {
  const safetyFlags = []
  const minCal = MIN_CALORIES[sex] ?? MIN_CALORIES.other
  if (calories < minCal) {
    safetyFlags.push('calorie_floor_applied')
    calories = minCal
  }
  calories = Math.round(calories)

  // Protein — capped at 40% of calories to stay reasonable
  const proteinPerLb = PROTEIN_PER_LB[primaryGoal] ?? 0.80
  const proteinGrams = Math.min(Math.round(weightLb * proteinPerLb), Math.round((calories * 0.40) / 4))

  const fatFrac = FAT_FRACTION[primaryGoal] ?? 0.28
  const fatGrams = Math.max(MIN_FAT_GRAMS, Math.round((calories * fatFrac) / 9))

  // Carbs fill the remainder
  const carbGrams = Math.round(Math.max(0, calories - proteinGrams * 4 - fatGrams * 9) / 4)

  return { calorieTarget: calories, proteinGrams, carbGrams, fatGrams, safetyFlags }
}

export { GOAL_ADJUSTMENTS }

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * @param {{
 *   sex: string, weightLb: number, heightCm: number, age: number,
 *   activityLevel: string, primaryGoal: string
 * }} params
 * @returns {{
 *   bmr, tdee, goalAdjustment, calorieTarget,
 *   proteinGrams, carbGrams, fatGrams,
 *   activityMultiplier, calculationFormula, calculationVersion,
 *   safetyFlags: string[]
 * }}
 */
export function calculateNutritionTargets({ sex, weightLb, heightCm, age, activityLevel, primaryGoal }) {
  const safetyFlags = []

  const bmr = calcBMR({ sex, weightLb, heightCm, age })
  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderately_active
  const tdee = Math.round(bmr * activityMultiplier)
  const goalAdj = GOAL_ADJUSTMENTS[primaryGoal] ?? 0

  // Age-based safety flags
  if (age < 16) safetyFlags.push('minor_professional_advice_recommended')
  if (age < 13) safetyFlags.push('plan_not_appropriate_for_age')

  const macros = macrosForCalories({ calories: tdee + goalAdj, sex, weightLb, primaryGoal })
  safetyFlags.push(...macros.safetyFlags)
  const { calorieTarget: calories, proteinGrams, carbGrams, fatGrams } = macros

  return {
    bmr,
    tdee,
    goalAdjustment: goalAdj,
    calorieTarget: calories,
    proteinGrams,
    carbGrams,
    fatGrams,
    activityMultiplier,
    calculationFormula: CALC_FORMULA,
    calculationVersion: CALC_VERSION,
    safetyFlags,
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const GOAL_LABELS = {
  lose_weight:          'Lose Weight',
  build_muscle:         'Build Muscle',
  improve_strength:     'Improve Strength',
  improve_endurance:    'Improve Endurance',
  athletic_performance: 'Athletic Performance',
  maintain_weight:      'Maintain Weight',
  general_fitness:      'General Fitness',
  mobility_flexibility: 'Mobility & Flexibility',
}

export const GOAL_ICONS = {
  lose_weight:          '🔥',
  build_muscle:         '💪',
  improve_strength:     '🏋️',
  improve_endurance:    '🏃',
  athletic_performance: '⚡',
  maintain_weight:      '⚖️',
  general_fitness:      '🌟',
  mobility_flexibility: '🧘',
}
