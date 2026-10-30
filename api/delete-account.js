import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Each keeps a person's files in a folder named after their id
const BUCKETS = ['progress-photos', 'coach-videos', 'coach-avatars', 'swimmer-photos']

// Every table with the person's rows, children before parents. Most also cascade from
// auth.users, but group_sets doesn't, and deleting explicitly doesn't depend on the schema.
const USER_ROWS = [
  ['meal_plans', 'user_id'], ['swim_practices', 'coach_id'], ['meal_scans', 'user_id'],
  ['app_reviews', 'user_id'], ['swim_team_members', 'user_id'], ['swim_teams', 'coach_id'], ['swim_profiles', 'user_id'],
  ['coach_purchases', 'buyer_id'], ['coach_products', 'coach_id'], ['coach_profiles', 'user_id'],
  ['group_sets', 'user_id'], ['group_participants', 'user_id'], ['group_sessions', 'host_id'],
  ['friendships', 'requester'], ['friendships', 'addressee'],
  ['notifications', 'user_id'], ['open_workouts', 'user_id'], ['monthly_scores', 'user_id'],
  ['social_profiles', 'user_id'], ['push_subscriptions', 'user_id'], ['reminder_settings', 'user_id'],
  ['user_badges', 'user_id'], ['daily_health', 'user_id'], ['cardio_logs', 'user_id'], ['progress_photos', 'user_id'],
  ['body_measurements', 'user_id'], ['progress_checkins', 'user_id'], ['nutrition_targets', 'user_id'],
  ['fitness_plans', 'user_id'], ['fitness_profiles', 'user_id'], ['calorie_logs', 'user_id'],
  ['workout_logs', 'user_id'], ['custom_workouts', 'user_id'], ['subscriptions', 'user_id'],
  ['user_profiles', 'user_id'],
]

// List the user's folder in pages and remove it until it's empty
async function removeFolder(name, uid) {
  const bucket = supabase.storage.from(name)
  for (;;) {
    const { data, error } = await bucket.list(uid, { limit: 1000 })
    if (error) throw new Error(`${name}: ${error.message}`)
    if (!data?.length) return
    const { error: rmErr } = await bucket.remove(data.map(f => `${uid}/${f.name}`))
    if (rmErr) throw new Error(`${name}: ${rmErr.message}`)
    if (data.length < 1000) return
  }
}

// Permanently deletes the caller's account: ends any Stripe subscription now (no further
// charges), removes their photos and rows, then the login itself. Billing records stay in Stripe.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      } catch (err) {
        // Already gone in Stripe is fine; anything else must stop the delete, or they'd keep paying
        if (err.code !== 'resource_missing') throw new Error(`Subscription: ${err.message}`)
      }
    }

    for (const b of BUCKETS) await removeFolder(b, user.id)

    for (const [table, column] of USER_ROWS) {
      const { error } = await supabase.from(table).delete().eq(column, user.id)
      // A table from a migration not yet run has nothing to delete
      if (error && !['42P01', 'PGRST205'].includes(error.code)) throw new Error(`${table}: ${error.message}`)
    }

    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
    if (delErr) throw new Error(`Login: ${delErr.message}`)

    res.json({ deleted: true })
  } catch (err) {
    console.error('Delete account error:', err.message)
    res.status(500).json({ error: 'Could not delete your account. Try again, or email athrionsportapp@gmail.com.' })
  }
}
