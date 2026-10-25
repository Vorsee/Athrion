import { supabase } from './supabase.js'

// ── User Profile ──────────────────────────────────────────────────────────────

export async function fetchUserProfile() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveUserProfile({ sex, height_cm, weight_lb, age, weight_unit }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: user.id, sex, height_cm, weight_lb, age, ...(weight_unit && { weight_unit }), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveGoals({ calorie_goal, protein_goal, carb_goal }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: user.id, calorie_goal, protein_goal, carb_goal, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Custom Workouts ───────────────────────────────────────────────────────────

export async function fetchCustomWorkouts() {
  const { data, error } = await supabase
    .from('custom_workouts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function saveCustomWorkout(name, exercises, id = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (id) {
    const { data, error } = await supabase
      .from('custom_workouts')
      .update({ name, exercises })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('custom_workouts')
      .insert({ user_id: user.id, name, exercises })
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function deleteCustomWorkout(id) {
  const { error } = await supabase.from('custom_workouts').delete().eq('id', id)
  if (error) throw error
}

// ── Workouts ──────────────────────────────────────────────────────────────────

export async function fetchWorkoutHistory() {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function saveWorkoutEntry(entry) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('workout_logs')
    .insert({
      user_id:  user.id,
      date:     entry.date,
      name:     entry.name,
      duration: entry.duration,
      volume:   entry.volume,
      sets:     entry.sets,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Subscription ─────────────────────────────────────────────────────────────

// Pro from Stripe, or a free month won on the leaderboard (comp_pro_until)
export async function fetchProState() {
  const { data } = await supabase.from('subscriptions').select('*').maybeSingle()
  const prizeUntil = data?.comp_pro_until && new Date(data.comp_pro_until) > new Date() ? data.comp_pro_until : null
  return { paid: data?.status === 'pro', prizeUntil }
}

export async function fetchSubscriptionStatus() {
  try {
    const { paid, prizeUntil } = await fetchProState()
    return paid || !!prizeUntil
  } catch {
    return false
  }
}

// One free trial per person: anyone who has been through checkout already has a Stripe customer
export async function fetchTrialEligible() {
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .maybeSingle()
    return !data?.stripe_customer_id
  } catch {
    return true // the server makes the real decision at checkout
  }
}

// ── Calories ──────────────────────────────────────────────────────────────────

export async function fetchCalorieLogs() {
  const { data, error } = await supabase
    .from('calorie_logs')
    .select('*')
    .order('date', { ascending: false })
    .limit(60)
  if (error) throw error
  return data
}

export async function fetchTodayCalorieLog(date) {
  const { data, error } = await supabase
    .from('calorie_logs')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data
}

// One log per user per day (unique user_id, date), so saving is an upsert
export async function saveTodayCalorieLog(date, foods) {
  const total_calories = foods.reduce((sum, f) => sum + (f.kcal || 0), 0)
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('calorie_logs')
    .upsert({ user_id: user.id, date, foods, total_calories }, { onConflict: 'user_id,date' })
    .select()
    .single()
  if (error) throw error
  return data
}
