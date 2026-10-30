// The Pro AI meal plan (025's meal_plans, written by the generate-meal-plan Edge Function)
import { supabase } from './supabase.js'

// The saved plan, or null. Before 025 runs there's none.
export async function fetchMealPlan() {
  const { data, error } = await supabase.from('meal_plans').select('plan, prefs, created_at').maybeSingle()
  if (error) return null
  return data
}

// { calories, protein, carbs, fat, diet, likes, dislikes, cookTime } → the saved row. Takes about a minute.
export async function generateMealPlan(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-meal-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(input),
  })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(body.error || "Couldn't build your meal plan. Try again.")
  return body.plan
}
