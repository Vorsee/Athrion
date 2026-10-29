import { describe, it, expect } from 'vitest'
import { bestSet, liftProgress, suggestTarget, KEY_LIFTS } from '../../src/lib/liftGoals.js'
import { SESSIONS, MUSCLE_SPLITS, makeFallbackPlan } from '../../supabase/functions/generate-fitness-plan/plan.ts'
import { EXERCISES, MUSCLES, getExerciseIcon } from '../../src/lib/data.js'

const log = (date, sets) => ({ date, created_at: `${date}T10:00:00Z`, sets })

describe('lift targets', () => {
  const history = [
    log('2026-10-01', [{ ex: 'Bench Press', weight: 175, reps: 5 }, { ex: 'Bench Press', weight: 190, reps: 2 }]),
    log('2026-10-20', [{ ex: 'Barbell Bench Press', weight: 185, reps: 6 }, { ex: 'Incline Bench Press', weight: 200, reps: 8 }]),
  ]
  it('finds the heaviest set of at least 5, by any common name for the lift', () => {
    expect(bestSet(history, 'Bench Press')).toEqual({ lb: 185, date: '2026-10-20' })
    expect(bestSet(history, 'Bench Press', { since: '2026-10-05' }).lb).toBe(185)
    expect(bestSet(history, 'Squat')).toBeNull()
  })
  it('measures each target and the average', () => {
    const p = liftProgress([{ name: 'Bench Press', startLb: 175, targetLb: 195 }, { name: 'Squat', startLb: 225, targetLb: 245 }], history, '2026-10-01')
    expect(p.lifts[0]).toMatchObject({ currentLb: 185, pct: 0.5 })
    expect(p.lifts[1]).toMatchObject({ currentLb: 225, pct: 0 })
    expect(p.pct).toBe(0.25)
  })
  it('suggests about 10% more, on a plate step', () => {
    expect(suggestTarget(180, 'lb')).toBe(200)
    expect(suggestTarget(100 * 2.20462, 'kg') / 2.20462).toBeCloseTo(110, 5)
    expect(KEY_LIFTS.every(l => EXERCISES.some(e => e.name === l.name))).toBe(true)
  })
})

describe('muscle plans train legs and include cardio', () => {
  const legDay = s => s.exercises.some(e => /squat|leg press|lunge|deadlift|hip thrust|leg curl/i.test(e.gym))
  it('every split trains the lower body at least twice a week (once on a one-day plan)', () => {
    for (const [days, split] of Object.entries(MUSCLE_SPLITS)) {
      const legs = split.filter(i => legDay(SESSIONS.build_muscle[i])).length
      expect(legs, `${days} days`).toBeGreaterThanOrEqual(Math.min(2, Number(days)))
      expect(split).toHaveLength(Number(days))
    }
  })
  it('a 4-day plan alternates upper and lower, with an easy cardio day between', () => {
    const plan = makeFallbackPlan({ primaryGoal: 'build_muscle', workoutDaysPerWeek: 4, workoutLocation: 'gym' }, { calorieTarget: 2800, proteinGrams: 180, carbGrams: 330, fatGrams: 80 })
    const week = plan.weeklySchedule
    expect(week.filter(d => d.type === 'workout').map(d => d.title)).toEqual(['Upper Body Volume', 'Legs — Quads, Hamstrings, Glutes', 'Upper Body Volume', 'Lower Body Volume'])
    expect(week.some(d => d.title === 'Easy Cardio')).toBe(true)
  })
})

describe('library basics', () => {
  it('has calves and cardio, with plain-named basics', () => {
    expect(MUSCLES).toEqual(expect.arrayContaining(['Calves', 'Cardio']))
    for (const n of ['Standing Calf Raise', 'Bodyweight Squat', 'Lunge', 'Crunch', 'Treadmill Walk', 'Stationary Bike', 'Machine Chest Press'])
      expect(EXERCISES.find(e => e.name === n)?.desc, n).toBeTruthy()
    expect(getExerciseIcon(EXERCISES.find(e => e.name === 'Elliptical'))).toBe('mdi:run')
  })
})

import { toggleGoal, blockedBy, orderGoals, goalsLabel } from '../../src/lib/goalPick.js'
import { buildUserMessage } from '../../supabase/functions/generate-fitness-plan/plan.ts'
describe('two goals', () => {
  it('allows two that go together, never lose and gain weight', () => {
    let g = toggleGoal([], 'build_muscle')
    g = toggleGoal(g, 'lose_weight')
    expect(g).toEqual(['build_muscle', 'lose_weight'])
    expect(blockedBy(g, 'gain_weight')).toMatch(/lose weight/)
    expect(toggleGoal(g, 'gain_weight')).toEqual(g)
    expect(toggleGoal(['lose_weight'], 'maintain_weight')).toEqual(['lose_weight'])
    expect(toggleGoal(g, 'swimming')).toEqual(['build_muscle', 'swimming']) // a third replaces the second
    expect(toggleGoal(g, 'lose_weight')).toEqual(['build_muscle'])
  })
  it('puts a weight goal first, since it sets the calories', () => {
    expect(orderGoals(['build_muscle', 'lose_weight'])).toEqual(['lose_weight', 'build_muscle'])
    expect(goalsLabel(['lose_weight', 'build_muscle'])).toBe('Lose weight + build muscle')
  })
  it('tells the plan about the second goal', () => {
    const msg = JSON.parse(buildUserMessage({ primaryGoal: 'lose_weight', secondaryGoals: ['build_muscle'] }, { calorieTarget: 2000 }, null))
    expect(msg.instruction).toMatch(/secondary goal of Muscle Building/)
    expect(msg.secondaryGoalProgramming).toMatch(/^Also serve Muscle Building/)
  })
})

import { trainingGoal } from '../../supabase/functions/generate-fitness-plan/plan.ts'
describe('backup plans follow both goals', () => {
  const nt = { calorieTarget: 2000, proteinGrams: 160, carbGrams: 200, fatGrams: 60 }
  it('lose weight + build muscle: a muscle split with a cardio day, named for both', () => {
    expect(trainingGoal({ primaryGoal: 'lose_weight', secondaryGoals: ['build_muscle'] })).toBe('build_muscle')
    const plan = makeFallbackPlan({ primaryGoal: 'lose_weight', secondaryGoals: ['build_muscle'], workoutDaysPerWeek: 4, workoutLocation: 'gym' }, nt)
    expect(plan.summary.planName).toBe('Weight Loss + Muscle Building Foundation Plan')
    expect(plan.weeklySchedule.filter(d => d.type === 'workout').map(d => d.title)).toContain('Lower Body Volume')
    expect(plan.weeklySchedule.some(d => d.title === 'Easy Cardio')).toBe(true)
  })
  it('build muscle + swimming: the cardio day is a swim', () => {
    const plan = makeFallbackPlan({ primaryGoal: 'build_muscle', secondaryGoals: ['swimming'], workoutDaysPerWeek: 3, workoutLocation: 'gym' }, nt)
    expect(plan.weeklySchedule.some(d => d.title === 'Swim')).toBe(true)
  })
  it('one goal works as before', () => {
    expect(trainingGoal({ primaryGoal: 'improve_strength' })).toBe('improve_strength')
    expect(trainingGoal({ primaryGoal: 'gain_weight' })).toBe('build_muscle')
  })
})
