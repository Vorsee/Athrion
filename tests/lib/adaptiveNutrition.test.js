import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { estimateAdaptiveTargets } from '../../src/lib/adaptiveNutrition.js'

const NOW = new Date('2026-10-23T12:00:00Z')
const daysAgo = n => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10)
const current = { calorie_target: 2200, tdee: 2600, bmr: 1700, activity_multiplier: 1.55 }

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

function data({ kcal = 2200, days = 14, lbPerDay = 0, weighIns = [0, 5, 10, 14] } = {}) {
  return {
    calorieLogs: Array.from({ length: days }, (_, i) => ({ date: daysAgo(i), total_calories: kcal })),
    weights: weighIns.map(d => ({ date: daysAgo(d), weight_lb: 180 - lbPerDay * (14 - d) })),
    current, sex: 'male', primaryGoal: 'maintain_weight',
  }
}

describe('estimateAdaptiveTargets', () => {
  it('is not ready without enough logged days, weigh-ins or span', () => {
    expect(estimateAdaptiveTargets(data({ days: 5 })).ready).toBe(false)
    expect(estimateAdaptiveTargets(data({ weighIns: [0, 14] })).ready).toBe(false)
    expect(estimateAdaptiveTargets(data({ weighIns: [0, 2, 4] })).progress.spanDays).toBe(4)
  })
  it('estimates TDEE as intake when weight is stable', () => {
    const r = estimateAdaptiveTargets(data({ kcal: 2500 }))
    expect(r.ready).toBe(true)
    expect(r.estimatedTdee).toBe(2500)
    expect(r.weeklyChangeLb).toBe(0)
  })
  it('adds the deficit implied by weight loss (3500 kcal per lb)', () => {
    const r = estimateAdaptiveTargets(data({ kcal: 2000, lbPerDay: 1 / 7 })) // 1 lb/week
    expect(r.weeklyChangeLb).toBe(-1)
    expect(r.estimatedTdee).toBe(2500)
    expect(r.suggestion.calorieTarget).toBe(2500)
  })
  it('ignores partly-logged days below 40% of the target', () => {
    const d = data({ kcal: 2500 })
    d.calorieLogs.push({ date: daysAgo(15), total_calories: 300 })
    expect(estimateAdaptiveTargets(d).progress.loggedDays).toBe(14)
  })
  it('ignores data outside the 21-day window', () => {
    const d = data()
    d.weights.push({ date: daysAgo(40), weight_lb: 220 })
    expect(estimateAdaptiveTargets(d).progress.weighIns).toBe(4)
  })
  it('only suggests a change of at least 75 kcal', () => {
    const r = estimateAdaptiveTargets(data({ kcal: 2250 }))
    expect(r.diff).toBe(50)
    expect(r.suggestion).toBeNull()
  })
})
