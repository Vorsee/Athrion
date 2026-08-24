import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify the caller's JWT
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  // Look up their subscription row
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub?.stripe_subscription_id || sub.status !== 'pro') {
    return res.status(400).json({ error: 'No active subscription found' })
  }

  try {
    // Cancel at period end — user keeps Pro access until billing cycle ends
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    res.json({
      success: true,
      cancel_at: new Date(updated.cancel_at * 1000).toISOString(),
      period_end: new Date(updated.current_period_end * 1000).toISOString(),
    })
  } catch (err) {
    console.error('Cancel subscription error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
