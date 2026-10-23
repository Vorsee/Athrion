import { describe, it, expect } from 'vitest'
import { calcBMR, calcTDEE, macrosForCalories, calculateNutritionTargets, GOAL_ADJUSTMENTS, GOAL_LABELS, GOAL_ICONS } from '../../src/lib/nutrition.js'
import { calcGoals, resolveGoals } from '../../src/lib/goals.js'

const base = { sex: 'male', weightLb: 180, heightCm: 180, age: 30 }

describe('calcBMR (Mifflin-St Jeor)', () => {
  it('matches the published formula for men and women', () => {
    // 81.647 kg: 816.47 + 1125 - 150 + 5 = 1796.47
    expect(calcBMR(base)).toBe(1796)
    expect(calcBMR({ ...base, sex: 'female' })).toBe(1630)
  })
  it('averages the sex adjustment for "other"', () => expect(calcBMR({ ...base, sex: 'other' })).toBe(1713))
})

describe('calcTDEE', () => {
  it('applies the activity multiplier', () => expect(calcTDEE(1800, 'very_active')).toBe(3105))
  it('defaults unknown activity levels to moderately active', () => expect(calcTDEE(1800, 'couch')).toBe(2790))
})

describe('macrosForCalories', () => {
  it('splits calories into protein, fat and carbs that add back up', () => {
    const m = macrosForCalories({ calories: 2500, sex: 'male', weightLb: 180, primaryGoal: 'build_muscle' })
    expect(m.proteinGrams).toBe(180)
    const kcal = m.proteinGrams * 4 + m.fatGrams * 9 + m.carbGrams * 4
    expect(Math.abs(kcal - 2500)).toBeLessThan(10)
  })
  it('never goes below the sex-specific calorie floor', () => {
    const m = macrosForCalories({ calories: 900, sex: 'female', weightLb: 120, primaryGoal: 'lose_weight' })
    expect(m.calorieTarget).toBe(1200)
    expect(m.safetyFlags).toContain('calorie_floor_applied')
  })
  it('caps protein at 40% of calories and keeps at least 40g fat', () => {
    const m = macrosForCalories({ calories: 1500, sex: 'male', weightLb: 400, primaryGoal: 'build_muscle' })
    expect(m.proteinGrams).toBe(150)
    expect(m.fatGrams).toBeGreaterThanOrEqual(40)
    expect(m.carbGrams).toBeGreaterThanOrEqual(0)
  })
})

describe('calculateNutritionTargets', () => {
  it('combines BMR, activity and goal adjustment', () => {
    const t = calculateNutritionTargets({ ...base, activityLevel: 'moderately_active', primaryGoal: 'lose_weight' })
    expect(t.tdee).toBe(Math.round(1796 * 1.55))
    expect(t.goalAdjustment).toBe(-400)
    expect(t.calorieTarget).toBe(t.tdee - 400)
    expect(t.calculationFormula).toBe('mifflin_st_jeor')
  })
  it('flags minors', () => {
    expect(calculateNutritionTargets({ ...base, age: 15, activityLevel: 'sedentary', primaryGoal: 'general_fitness' }).safetyFlags)
      .toContain('minor_professional_advice_recommended')
    expect(calculateNutritionTargets({ ...base, age: 12, activityLevel: 'sedentary', primaryGoal: 'general_fitness' }).safetyFlags)
      .toContain('plan_not_appropriate_for_age')
  })
  it('has a label, icon and adjustment for every goal', () => {
    for (const g of Object.keys(GOAL_ADJUSTMENTS)) {
      expect(GOAL_LABELS[g]).toBeTruthy()
      expect(GOAL_ICONS[g]).toBeTruthy()
    }
  })
})

describe('goals.js (legacy calorie goals)', () => {
  it('uses defaults without body stats', () => expect(calcGoals({})).toEqual({ calories: 2000, protein: 150, carbs: 220 }))
  it('calculates from body stats', () => {
    const g = calcGoals({ sex: 'female', height_cm: 165, weight_lb: 140, age: 28 })
    expect(g.calories).toBeGreaterThan(1800)
    expect(g.protein).toBe(126)
  })
  it('prefers custom goals when set', () => {
    const g = resolveGoals({ height_cm: 170, weight_lb: 160, calorie_goal: 1800 })
    expect(g.calories).toBe(1800)
    expect(g.isCustom).toBe(true)
    expect(resolveGoals(null).isCustom).toBe(false)
  })
})
