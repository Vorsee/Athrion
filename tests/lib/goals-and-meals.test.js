import { describe, it, expect } from 'vitest'
import { weightPlan, targetProblem, goalProgress, minHealthyLb } from '../../src/lib/weightGoal.js'
import { planProgress, journeyStart, mergeWeights } from '../../src/lib/planProgress.js'
import { buildDay, optionsFor, amountText, FOODS } from '../../src/lib/mealPlan.js'
import { calculateNutritionTargets } from '../../src/lib/nutrition.js'

const me = { sex: 'male', weightLb: 200, heightCm: 180, age: 30, activityLevel: 'moderately_active' }

describe('weightPlan', () => {
  it('turns a target and pace into a weekly rate, daily calories and a date', () => {
    const p = weightPlan({ ...me, goal: 'lose_weight', pace: 'steady', targetLb: 185, start: new Date('2026-11-02T12:00:00') })
    expect(p.weeklyLb).toBe(1.5)                // 0.75% of 200 lb
    expect(p.dailyAdjustment).toBe(-750)        // 1.5 lb × 3500 / 7
    expect(p.weeks).toBe(10)
    expect(p.targetDate.toISOString().slice(0, 10)).toBe('2027-01-11')
  })
  it('caps a surplus and never goes under the calorie floor', () => {
    const gain = weightPlan({ ...me, goal: 'gain_weight', pace: 'fast', targetLb: 215 })
    expect(gain.dailyAdjustment).toBe(500)
    const small = weightPlan({ sex: 'female', weightLb: 130, heightCm: 155, age: 60, activityLevel: 'sedentary', goal: 'lose_weight', pace: 'fast', targetLb: 120 })
    expect(small.calories).toBe(1200)
    expect(small.floored).toBe(true)
    expect(small.weeklyLb).toBeLessThan(1.3)  // slower than 1% because of the floor
  })
  it('refuses targets in the wrong direction or under a healthy weight', () => {
    expect(targetProblem({ goal: 'lose_weight', weightLb: 200, targetLb: 210, heightCm: 180 })).toMatch(/under your weight/)
    expect(targetProblem({ goal: 'gain_weight', weightLb: 200, targetLb: 190, heightCm: 180 })).toMatch(/over your weight/)
    expect(targetProblem({ goal: 'lose_weight', weightLb: 140, targetLb: minHealthyLb(180) - 2, heightCm: 180 })).toMatch(/healthy/)
    expect(weightPlan({ ...me, goal: 'build_muscle', targetLb: 190 })).toBeNull()
  })
  it('feeds the daily change into the nutrition targets', () => {
    const p = weightPlan({ ...me, goal: 'lose_weight', pace: 'steady', targetLb: 185 })
    const nt = calculateNutritionTargets({ ...me, primaryGoal: 'lose_weight', goalAdjustment: p.dailyAdjustment })
    expect(nt.calorieTarget).toBe(p.calories)
    expect(nt.goalAdjustment).toBe(-750)
  })
})

describe('goalProgress', () => {
  it('measures the way from start to target and whether it is on schedule', () => {
    const g = goalProgress({ startLb: 200, targetLb: 180, startDate: '2026-10-01', targetDate: '2026-12-10',
      weights: [{ date: '2026-10-01', weight_lb: 200 }, { date: '2026-10-29', weight_lb: 193 }], today: new Date('2026-10-29T12:00:00') })
    expect(g.pct).toBeCloseTo(0.35)
    expect(g.doneLb).toBe(7)
    expect(g.leftLb).toBe(13)
    expect(g.onTrack).toBe(true)
  })
  it('counts a move the wrong way as negative', () => {
    const g = goalProgress({ startLb: 150, targetLb: 160, weights: [{ date: '2026-10-29', weight_lb: 148 }] })
    expect(g.pct).toBe(0)
    expect(g.doneLb).toBe(-2)
  })
})

describe('planProgress', () => {
  const schedule = ['Monday', 'Wednesday', 'Friday'].map(day => ({ day, type: 'workout', title: day }))
  it('counts planned and done days since the start, and this week day by day', () => {
    // Thursday Oct 29 2026; started Monday Oct 19: planned Mon, Wed, Fri, Mon, Wed = 5
    const p = planProgress({ schedule, start: '2026-10-19', weeks: 8, today: new Date('2026-10-29T15:00:00'),
      history: [{ date: '2026-10-19' }, { date: '2026-10-21' }, { date: '2026-10-26' }, { date: '2026-10-10' }] })
    expect(p.planned).toBe(5)
    expect(p.done).toBe(3)
    expect(p.week).toBe(2)
    expect(p.weekDone).toBe(1)
    expect(p.weekPlanned).toBe(3)
    expect(p.thisWeek.find(d => d.today).day).toBe('Thursday')
    expect(p.endDate).toBe('2026-12-14')
  })
  it('starts at the goal date, else the first week of the plan', () => {
    expect(journeyStart({ goalStartDate: '2026-10-01' })).toBe('2026-10-01')
    expect(journeyStart({ plan: { created_at: '2026-10-22T10:00:00', plan_data: { week: 3 } } })).toBe('2026-10-08')
  })
  it('merges weigh-ins, measurements winning on the same day', () => {
    expect(mergeWeights([{ date: '2026-10-02', weight_lb: 181 }], [{ date: '2026-10-02', weight_lb: 182 }, { date: '2026-10-01', weight_lb: 183 }]))
      .toEqual([{ date: '2026-10-01', weight_lb: 183 }, { date: '2026-10-02', weight_lb: 181 }])
  })
})

describe('meal plan', () => {
  it('builds a day close to the calorie and protein targets', () => {
    for (const [calories, protein] of [[1800, 140], [2400, 170], [3000, 180]]) {
      const { totals } = buildDay({ calories, protein })
      expect(Math.abs(totals.kcal - calories) / calories).toBeLessThan(0.1)
      expect(Math.abs(totals.protein - protein) / protein).toBeLessThan(0.2)
    }
  })
  it('keeps meat and dairy out for vegans, and fasting gets two meals', () => {
    const { meals } = buildDay({ calories: 2200, protein: 120, diet: ['vegan', 'fasting'] })
    expect(meals.map(m => m.label)).toEqual(['First meal', 'Last meal', 'Snack'])
    for (const m of meals) for (const i of m.items) expect(FOODS[i.id].not ?? []).not.toContain('vegan')
    expect(optionsFor('breakfast', ['vegetarian']).length).toBeGreaterThan(1)
  })
  it('writes amounts people can use', () => {
    expect(amountText({ grams: 150, unit: 'egg', per: 50 })).toBe('3 eggs (150 g)')
    expect(amountText({ grams: 250, unit: 'ml' })).toBe('250 ml')
  })
})

import { shortName } from '../../src/lib/reviews.js'
describe('reviews', () => {
  it('shows a first name and last initial by default', () => {
    expect(shortName('Sam Tester')).toBe('Sam T.')
    expect(shortName('Leo')).toBe('Leo')
    expect(shortName('  ')).toBe('')
  })
})
