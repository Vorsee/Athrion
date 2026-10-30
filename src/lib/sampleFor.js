// The sample plan behind the Pro lock, for the person's own goals. Kept apart from samplePlan.js,
// which stays plain JS that Node scripts (the QA mock) can import.
import { makeFallbackPlan } from '../../supabase/functions/generate-fitness-plan/plan.ts'
import { dbProfileToPayload } from './fitnessApi.js'
import { SAMPLE_PLAN } from './samplePlan.js'

// The example behind the lock, built for the person's own goals and days when they've answered
// the plan questions: the same standard plan the server falls back to, without calories (Food has
// the person's own). Before that, the muscle sample above.
export function sampleFor(fp) {
  if (!fp?.primary_goal) return SAMPLE_PLAN
  const data = makeFallbackPlan(dbProfileToPayload(fp), { proteinGrams: null })
  data.advice.topPriorities = data.advice.topPriorities.filter(t => !t.includes('protein'))
  return {
    id: 'sample', primary_goal: fp.primary_goal, duration_weeks: 8, training_days_per_week: data.summary.trainingDaysPerWeek,
    created_at: new Date().toISOString(), plan_data: { ...data, week: 1, nutrition: undefined },
  }
}
