// The person's own data: download a copy, or delete the account (privacy policy, "Your rights")
import { supabase } from './supabase.js'
import { postAsUser } from './stripe.js'
import { signOut } from './session.js'
import { todayKey } from './data.js'
import { COACH_COLUMNS } from './coachApi.js'

// Row-level security limits each read to the signed-in person's rows
const EXPORT_TABLES = [
  'user_profiles', 'fitness_profiles', 'fitness_plans', 'nutrition_targets', 'progress_checkins',
  'workout_logs', 'custom_workouts', 'calorie_logs', 'body_measurements', 'daily_health',
  'progress_photos', 'user_badges', 'reminder_settings', 'social_profiles', 'monthly_scores',
  'notifications', 'subscriptions',
]
// Tables keyed by another column, or (coach_profiles) only readable column by column
const EXPORT_OTHER = [
  ['coach_profiles', 'user_id', COACH_COLUMNS],
  ['coach_products', 'coach_id', '*'],
  ['coach_purchases', 'buyer_id', '*'],
]

export async function collectMyData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const out = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at, metadata: user.user_metadata },
  }
  await Promise.all([...EXPORT_TABLES.map(t => [t, 'user_id', '*']), ...EXPORT_OTHER].map(async ([t, col, cols]) => {
    const { data, error } = await supabase.from(t).select(cols).eq(col, user.id)
    out[t] = error ? { error: error.message } : data ?? []
  }))
  const { data: friends } = await supabase.rpc('my_friends')
  out.friends = friends ?? []
  return out
}

// Saves athrion-data-YYYY-MM-DD.json; photos are listed by file name (download them from Progress)
export async function downloadMyData() {
  const blob = new Blob([JSON.stringify(await collectMyData(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `athrion-data-${todayKey()}.json` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function deleteAccount() {
  const { res, data } = await postAsUser('/api/delete-account')
  if (!res.ok) throw new Error(data.error || 'Could not delete your account')
  await signOut({ deleted: true }).catch(() => {})
}
