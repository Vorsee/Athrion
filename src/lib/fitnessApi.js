import { supabase } from './supabase.js'

// ── Fitness Profile ───────────────────────────────────────────────────────────

export async function fetchFitnessProfile() {
  const { data, error } = await supabase
    .from('fitness_profiles')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveFitnessProfile(fp) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('fitness_profiles')
    .upsert(
      {
        user_id:                    user.id,
        primary_goal:               fp.primaryGoal,
        secondary_goals:            fp.secondaryGoals ?? [],
        activity_level:             fp.activityLevel,
        experience_level:           fp.experienceLevel,
        workout_days_per_week:      fp.workoutDaysPerWeek,
        preferred_session_duration: fp.preferredSessionDuration,
        workout_location:           fp.workoutLocation,
        available_equipment:        fp.availableEquipment ?? [],
        preferred_workout_types:    fp.preferredWorkoutTypes ?? [],
        liked_exercises:            fp.likedExercises ?? '',
        disliked_exercises:         fp.dislikedExercises ?? '',
        preferred_training_days:    fp.preferredTrainingDays ?? [],
        preferred_rest_days:        fp.preferredRestDays ?? [],
        session_preference:         fp.sessionPreference,
        injuries:                   fp.injuries ?? '',
        limitations:                fp.limitations ?? '',
        medical_notes:              fp.medicalNotes ?? '',
        onboarding_completed:       fp.onboardingCompleted ?? false,
        // Weight goal (021); null for goals that aren't about weight
        target_weight_lb:           fp.targetWeightLb ?? null,
        goal_pace:                  fp.goalPace ?? null,
        goal_start_weight_lb:       fp.goalStartWeightLb ?? null,
        goal_start_date:            fp.goalStartDate ?? null,
        goal_target_date:           fp.goalTargetDate ?? null,
        goal_lifts:                 fp.goalLifts ?? [],
        updated_at:                 new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Nutrition Targets ─────────────────────────────────────────────────────────

export async function saveNutritionTarget(targets) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('nutrition_targets')
    .insert({
      user_id:              user.id,
      calorie_target:       targets.calorieTarget,
      protein_grams:        targets.proteinGrams,
      carb_grams:           targets.carbGrams,
      fat_grams:            targets.fatGrams,
      bmr:                  targets.bmr,
      tdee:                 targets.tdee,
      goal_adjustment:      targets.goalAdjustment,
      activity_multiplier:  targets.activityMultiplier,
      calculation_formula:  targets.calculationFormula,
      calculation_version:  targets.calculationVersion,
      safety_flags:         targets.safetyFlags ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// The diet answer alone (vegan, halal...), from the meal plan. Saved as the plan questions save
// it, so the next plan and the meal plan agree. No fitness profile yet: nothing to update.
export async function saveDiet(ids, opts) {
  const { data: { user } } = await supabase.auth.getUser()
  const labels = opts.filter(o => ids.includes(o.id)).map(o => o.label)
  const { error } = await supabase.from('fitness_profiles')
    .update({ limitations: labels.length ? `Diet: ${labels.join('; ')}` : '' }).eq('user_id', user.id)
  if (error) throw error
}

export async function fetchLatestNutritionTarget() {
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── DB row → Edge Function payload converters ─────────────────────────────────
// DB rows use snake_case; the Edge Function and Claude prompt expect camelCase.

export function dbProfileToPayload(row) {
  return {
    primaryGoal:               row.primary_goal,
    secondaryGoals:            row.secondary_goals ?? [],
    activityLevel:             row.activity_level,
    experienceLevel:           row.experience_level,
    workoutDaysPerWeek:        row.workout_days_per_week,
    preferredSessionDuration:  row.preferred_session_duration,
    workoutLocation:           row.workout_location,
    availableEquipment:        row.available_equipment ?? [],
    preferredWorkoutTypes:     row.preferred_workout_types ?? [],
    likedExercises:            row.liked_exercises ?? '',
    dislikedExercises:         row.disliked_exercises ?? '',
    preferredTrainingDays:     row.preferred_training_days ?? [],
    preferredRestDays:         row.preferred_rest_days ?? [],
    sessionPreference:         row.session_preference,
    injuries:                  row.injuries ?? '',
    limitations:               row.limitations ?? '',
    medicalNotes:              row.medical_notes ?? '',
    onboardingCompleted:       row.onboarding_completed,
    targetWeightLb:            row.target_weight_lb == null ? null : Number(row.target_weight_lb),
    goalPace:                  row.goal_pace ?? null,
    goalStartWeightLb:         row.goal_start_weight_lb == null ? null : Number(row.goal_start_weight_lb),
    goalStartDate:             row.goal_start_date ?? null,
    goalTargetDate:            row.goal_target_date ?? null,
    goalLifts:                 row.goal_lifts ?? [],
  }
}

export function dbNutritionToPayload(row) {
  return {
    calorieTarget:        row.calorie_target,
    proteinGrams:         row.protein_grams,
    carbGrams:            row.carb_grams,
    fatGrams:             row.fat_grams,
    bmr:                  row.bmr,
    tdee:                 row.tdee,
    goalAdjustment:       row.goal_adjustment,
    activityMultiplier:   row.activity_multiplier,
    calculationFormula:   row.calculation_formula,
    calculationVersion:   row.calculation_version,
    safetyFlags:          row.safety_flags ?? [],
  }
}

// ── Plan Generation (calls Edge Function) ─────────────────────────────────────

// mode 'adapt' rewrites the active plan using recent check-ins, workouts and health data
// Swimmers: their best pace per 100 m for each stroke, so the plan's send-offs fit them
async function swimPaces() {
  const { data } = await supabase.from('cardio_logs').select('stroke, distance_m, seconds').eq('kind', 'swim').gte('distance_m', 50).limit(500)
  const best = {}
  for (const l of data ?? []) {
    const per100 = (l.seconds / Number(l.distance_m)) * 100
    if (l.stroke && (!best[l.stroke] || per100 < best[l.stroke])) best[l.stroke] = per100
  }
  return Object.keys(best).length
    ? Object.fromEntries(Object.entries(best).map(([k, v]) => [k, `${Math.floor(Math.round(v) / 60)}:${String(Math.round(v) % 60).padStart(2, '0')}`]))
    : undefined
}

export async function generatePlan(fitnessProfile, nutritionTargets, mode = 'new') {
  if ([fitnessProfile.primaryGoal, ...(fitnessProfile.secondaryGoals ?? [])].includes('swimming')) {
    fitnessProfile = { ...fitnessProfile, swimPaces: await swimPaces().catch(() => undefined) }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-fitness-plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ fitnessProfile, nutritionTargets, mode }),
    }
  )
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || `Generation failed (${resp.status})`)
  return data.plan
}

// ── Active Plan ───────────────────────────────────────────────────────────────

export async function fetchActivePlan() {
  const { data, error } = await supabase
    .from('fitness_plans')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Save edits to the active plan (e.g. a swapped exercise)
export async function updatePlanData(planId, planData) {
  const { error } = await supabase
    .from('fitness_plans')
    .update({ plan_data: planData, updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) throw error
}

// ── Progress Check-ins ────────────────────────────────────────────────────────

export async function saveCheckin(checkin) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('progress_checkins')
    .insert({ ...checkin, user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchLatestCheckin() {
  const { data, error } = await supabase
    .from('progress_checkins')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
