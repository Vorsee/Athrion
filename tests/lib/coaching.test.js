// Coaching on the plan (lib/coaching.js): the short version of a day, lift names across logs,
// and the week as Plan and Train both run it
import { describe, it, expect } from 'vitest'
import { shortVersion, shortOptions, historyFor, coachedWeek, nextTarget } from '../../src/lib/coaching.js'
import { buildExerciseHistory } from '../../src/lib/progress.js'
import { planRow } from '../helpers/fixtures.js'

const day = (exercises, extra = {}) => ({ day: 'Monday', type: 'workout', title: 'Upper', durationMinutes: 55, workout: { exercises }, ...extra })
const ex = (name, sets = 4, reps = '8-10') => ({ name, sets, reps })

describe('short on time', () => {
  const full = day([ex('Bench Press'), ex('Barbell Row'), ex('Overhead Press'), ex('Lat Pulldown'), ex('Curl', 3)])
  it('fits 30 minutes: the first exercises, at most 3 sets each', () => {
    const s = shortVersion(full, 30)
    expect(s.workout.exercises.map(e => [e.name, e.sets])).toEqual([['Bench Press', 3], ['Barbell Row', 3], ['Overhead Press', 3], ['Lat Pulldown', 3]])
    expect(s.durationMinutes).toBe(30)
  })
  it('fits 20 minutes with 2 sets each', () => {
    const s = shortVersion(full, 20)
    expect(s.workout.exercises.reduce((a, e) => a + e.sets, 0)).toBe(8)
    expect(s.workout.exercises.every(e => e.sets === 2)).toBe(true)
  })
  it('is offered only for gym days longer than the short lengths', () => {
    expect(shortOptions(full)).toEqual([30, 20])
    expect(shortOptions(day([ex('Bench Press')], { durationMinutes: 25 }))).toEqual([20])
    expect(shortOptions(day([ex('Treadmill', 1, '20-30 min')]))).toEqual([])
    expect(shortOptions(day([ex('Main set: freestyle')], { sport: 'swim' }))).toEqual([])
    expect(shortOptions(null)).toEqual([])
  })
})

describe('lift names across logs', () => {
  const byEx = buildExerciseHistory([{ date: '2026-10-20', created_at: '2026-10-20T18:00:00Z', sets: [{ ex: 'Bench Press', weight: 185, reps: 8 }] }])
  it('finds "Barbell Bench Press" under "Bench Press"', () => {
    expect(historyFor(byEx, 'Barbell Bench Press')).toHaveLength(1)
    expect(historyFor(byEx, 'Squat')).toEqual([])
    expect(nextTarget(ex('Barbell Bench Press', 3, '8-10'), byEx)?.weight).toBeGreaterThan(0)
  })
})

describe('the coached week', () => {
  // Friday 23 Oct 2026; the fixture plan started Monday 19th with workouts Monday and Wednesday
  const today = new Date('2026-10-23T10:00:00-04:00')
  it('moves missed workouts to today and the next free day', () => {
    const { schedule, moves } = coachedWeek({ plan: planRow, history: [], today })
    expect(moves.map(m => [m.from, m.to])).toEqual([['Monday', 'Friday'], ['Wednesday', 'Saturday']])
    expect(schedule.find(d => d.day === 'Friday').title).toBe('Upper Body')
  })
  it('moves nothing when they were done', () => {
    const history = [{ date: '2026-10-19' }, { date: '2026-10-21' }]
    expect(coachedWeek({ plan: planRow, history, today }).moves).toEqual([])
  })
  it('makes every 5th week lighter', () => {
    expect(coachedWeek({ plan: planRow, today }).deload).toBe(false)
    expect(coachedWeek({ plan: planRow, goalStartDate: '2026-09-21', today }).deload).toBe(true)
  })
})

describe('the personal coaching tip', () => {
  it('tells a beginner to start light and that the targets build up', async () => {
    const { personalTip } = await import('../../supabase/functions/generate-fitness-plan/plan.ts')
    const t = personalTip({ experienceLevel: 'beginner', primaryGoal: 'build_muscle', workoutDaysPerWeek: 3 })
    expect(t.title).toBe('Start light, then build')
    expect(t.body).toMatch(/3 or 4 more times/)
    expect(t.body).toMatch(/starting small is the plan/)
    const i = personalTip({ experienceLevel: 'intermediate', primaryGoal: 'lose_weight', injuries: 'left knee' })
    expect(i.body).toMatch(/Weigh in once a week/)
    expect(i.body).toMatch(/left knee/)
  })
  it('is part of the backup plan', async () => {
    const { makeFallbackPlan } = await import('../../supabase/functions/generate-fitness-plan/plan.ts')
    const p = makeFallbackPlan({ primaryGoal: 'swimming', experienceLevel: 'advanced', workoutDaysPerWeek: 4, workoutLocation: 'gym' }, { calorieTarget: 2400, proteinGrams: 150, carbGrams: 250, fatGrams: 70 })
    expect(p.coachingTip.title).toBeTruthy()
    // Pool days start on land, before the warm-up
    const pool = p.weeklySchedule.find(d => d.sport === 'swim')
    expect(pool.workout.exercises[0].name).toMatch(/^Dryland: /)
    expect(pool.workout.exercises.findIndex(e => /^Warm-up/.test(e.name))).toBeGreaterThan(0)
  })
})

describe('story cards', () => {
  it('puts a workout and a swim into the card text', async () => {
    const { cardContent } = await import('../../src/lib/shareCard.js')
    const w = cardContent({ kind: 'workout', title: 'Push day', date: '2026-10-30', minutes: 0, volume: '12,000 lb', sets: 14, lifts: ['a', 'b', 'c', 'd'], records: 1 })
    expect(w.stats.map(s => s[0])).toEqual(['Volume', 'Sets']) // a zero time is left out
    expect(w.lines).toHaveLength(3)
    expect(w.highlight).toBe('1 new record')
    const s = cardContent({ kind: 'swim', title: 'Freestyle swim', date: '2026-10-30', distance: '1,500 m', time: '26:00', pace: '1:44 /100 m' })
    expect(s.stats).toEqual([['Distance', '1,500 m'], ['Time', '26:00'], ['Pace', '1:44 /100 m']])
    expect(s.eyebrow).toMatch(/^Swim · /)
  })
})
