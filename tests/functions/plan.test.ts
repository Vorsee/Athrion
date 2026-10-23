// Pure logic from the generate-fitness-plan Edge Function
import { describe, it, expect } from 'vitest'
import { DAYS, SESSIONS, DEFAULT_DAYS, PLAN_SCHEMA, buildUserMessage, isValidPlan, applyNutritionTargets, makeFallbackPlan, gatherProgress } from '../../supabase/functions/generate-fitness-plan/plan.ts'
import { sb } from '../helpers/supabaseMock.js'

const nt = { calorieTarget: 2400, proteinGrams: 180, carbGrams: 250, fatGrams: 70 }
const fp = { primaryGoal: 'build_muscle', workoutDaysPerWeek: 4, workoutLocation: 'gym', experienceLevel: 'intermediate' }
const GOALS = Object.keys(SESSIONS)

describe('isValidPlan', () => {
  const good = () => makeFallbackPlan(fp, nt)
  it('accepts a complete plan', () => expect(isValidPlan(good())).toBe(true))
  it('rejects missing names, wrong day order, wrong length and empty workouts', () => {
    expect(isValidPlan(null)).toBe(false)
    const a = good(); delete a.summary.planName; expect(isValidPlan(a)).toBe(false)
    const b = good(); b.weeklySchedule.reverse(); expect(isValidPlan(b)).toBe(false)
    const c = good(); c.weeklySchedule.pop(); expect(isValidPlan(c)).toBe(false)
    const d = good(); d.weeklySchedule.find(x => x.type === 'workout').workout.exercises = []; expect(isValidPlan(d)).toBe(false)
    const e = good(); e.weeklySchedule.find(x => x.type === 'workout').workout.exercises[0].sets = '3'; expect(isValidPlan(e)).toBe(false)
    const f = good(); f.weeklySchedule.forEach(x => { x.type = 'rest' }); expect(isValidPlan(f)).toBe(false)
  })
})

describe('applyNutritionTargets', () => {
  it('replaces the model numbers with the calculator numbers but keeps its advice', () => {
    const plan = applyNutritionTargets({ nutrition: { dailyCalories: 9999, hydrationAdvice: 'Drink water' } }, nt)
    expect(plan.nutrition).toEqual({ dailyCalories: 2400, proteinGrams: 180, carbGrams: 250, fatGrams: 70, hydrationAdvice: 'Drink water' })
  })
})

describe('makeFallbackPlan', () => {
  it('produces a valid plan for every goal, location and day count', () => {
    for (const primaryGoal of GOALS) for (const workoutLocation of ['gym', 'home', 'any']) for (let days = 1; days <= 7; days++) {
      const plan = makeFallbackPlan({ primaryGoal, workoutLocation, workoutDaysPerWeek: days }, nt)
      expect(isValidPlan(plan), `${primaryGoal}/${workoutLocation}/${days}`).toBe(true)
      expect(plan.weeklySchedule.filter((d: any) => d.type === 'workout')).toHaveLength(days)
    }
  })
  it('has a default schedule of the right length for 1-7 days', () => {
    for (let n = 1; n <= 7; n++) {
      expect(DEFAULT_DAYS[n]).toHaveLength(n)
      DEFAULT_DAYS[n].forEach(d => expect(DAYS).toContain(d))
    }
  })
  it('uses preferred training days and clamps the day count', () => {
    const plan = makeFallbackPlan({ ...fp, workoutDaysPerWeek: 2, preferredTrainingDays: ['Tuesday', 'Saturday'] }, nt)
    expect(plan.weeklySchedule.filter((d: any) => d.type === 'workout').map((d: any) => d.day)).toEqual(['Tuesday', 'Saturday'])
    expect(makeFallbackPlan({ ...fp, workoutDaysPerWeek: 12 }, nt).summary.trainingDaysPerWeek).toBe(7)
    expect(makeFallbackPlan({ ...fp, workoutDaysPerWeek: 0 }, nt).summary.trainingDaysPerWeek).toBe(1)
  })
  it('falls back to general fitness for unknown goals', () => {
    expect(makeFallbackPlan({ ...fp, primaryGoal: 'become_astronaut' }, nt).summary.goal).toBe('general_fitness')
  })
  it('gives beginners one set fewer, never below one', () => {
    const sets = (p: any) => p.weeklySchedule.find((d: any) => d.type === 'workout').workout.exercises.map((e: any) => e.sets)
    const normal = sets(makeFallbackPlan(fp, nt)), beginner = sets(makeFallbackPlan({ ...fp, experienceLevel: 'beginner' }, nt))
    beginner.forEach((s: number, i: number) => expect(s).toBe(Math.max(normal[i] - 1, 1)))
  })
  it('drops disliked exercises and lists them to avoid', () => {
    const plan = makeFallbackPlan({ ...fp, dislikedExercises: 'Bench Press, lunge' }, nt)
    const names = plan.weeklySchedule.flatMap((d: any) => d.workout.exercises.map((e: any) => e.name.toLowerCase()))
    expect(names.some((n: string) => n.includes('bench press') || n.includes('lunge'))).toBe(false)
    expect(plan.safety.exercisesToAvoid).toEqual(['bench press', 'lunge'])
  })
  it('uses the calculator nutrition and adds an injury warning', () => {
    const plan = makeFallbackPlan({ ...fp, injuries: 'left knee' }, nt)
    expect(plan.nutrition.dailyCalories).toBe(2400)
    expect(plan.safety.warnings[0]).toContain('left knee')
  })

  describe('known bugs', () => {
    // A broad dislike can filter a whole session away, leaving a workout day with no
    // exercises, which isValidPlan itself rejects.
    it.fails('BUG: disliking common words still leaves exercises on every workout day', () => {
      const plan = makeFallbackPlan({ ...fp, dislikedExercises: 'press, row, squat, deadlift, curl, raise, pull, push, lunge, fly' }, nt)
      expect(isValidPlan(plan)).toBe(true)
    })
  })
})

describe('buildUserMessage', () => {
  it('sends the profile, calculator targets, goal programming and schema', () => {
    const msg = JSON.parse(buildUserMessage({ ...fp, injuries: '' }, nt, null))
    expect(msg.instruction).toContain('Muscle Building')
    expect(msg.profile.injuries).toBe('none')
    expect(msg.nutritionTargets).toEqual(nt)
    expect(msg.goalProgramming).toBeTruthy()
    expect(msg.outputSchema).toEqual(PLAN_SCHEMA)
    expect(msg.recentProgress).toBeUndefined()
  })
  it('adds adaptation instructions and progress in adapt mode', () => {
    const msg = JSON.parse(buildUserMessage(fp, nt, { adherence: { completedSessionsLast14Days: 6 } }))
    expect(msg.instruction).toContain('next week')
    expect(msg.adaptInstructions).toContain('Low adherence')
    expect(msg.recentProgress.adherence.completedSessionsLast14Days).toBe(6)
  })
})

describe('gatherProgress', () => {
  it('summarises the last two weeks for the adaptation prompt', async () => {
    sb.reset()
    sb.set('progress_checkins', { data: [{ created_at: '2026-10-20T10:00:00Z', weight_lb: 181, energy_level: 4 }] })
    sb.set('workout_logs', { data: [
      { name: 'Push', duration: '45min', created_at: '2026-10-15T10:00:00Z', sets: [{ ex: 'Bench', weight: 135, reps: 8 }, { ex: 'Bench', weight: 145, reps: 5 }] },
      { name: 'Push', duration: '50min', created_at: '2026-10-19T10:00:00Z', sets: [{ ex: 'Bench', weight: 145, reps: 6 }] },
    ] })
    sb.set('daily_health', { data: [{ steps: 8000, sleep_hours: 7 }, { steps: 10000, sleep_hours: null }] })
    sb.set('body_measurements', { data: [{ date: '2026-10-20', weight_lb: 181 }, { date: '2026-10-10', weight_lb: 183 }] })
    const plan = { training_days_per_week: 4, plan_data: { week: 2, summary: { planName: 'P' }, weeklySchedule: [{ day: 'Monday', type: 'workout', title: 'Push', workout: { exercises: [{ name: 'Bench', sets: 3, reps: '8-12' }] } }] } }
    const p = await gatherProgress(sb.supabase, plan)
    expect(p.bestSetsLast14Days.Bench).toEqual({ weight: 145, reps: 6, sessions: 2 })
    expect(p.adherence).toMatchObject({ plannedSessionsPerWeek: 4, completedSessionsLast14Days: 2 })
    expect(p.health).toEqual({ avgSteps: 9000, avgSleepHours: 7, avgRestingHr: null })
    expect(p.weightTrend.map((w: any) => w.date)).toEqual(['2026-10-10', '2026-10-20']) // oldest first
    expect(p.previousPlan.schedule[0].exercises).toEqual(['Bench 3x8-12'])
    expect(p.checkins[0]).toMatchObject({ date: '2026-10-20', weightLb: 181, energy: 4 })
  })
})
