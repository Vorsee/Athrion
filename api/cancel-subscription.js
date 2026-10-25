import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : {}
}

const iso = secs => (secs ? new Date(secs * 1000).toISOString() : null)

// What the app shows: still renewing, or cancelled and ending on a date.
// Newer Stripe API versions report the period end on the subscription items.
function describe(sub) {
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? sub.cancel_at
  const cancelled = !!(sub.cancel_at_period_end || sub.cancel_at)
  return {
    success: true,
    status: sub.status,
    cancelled,
    cancel_at: cancelled ? iso(sub.cancel_at ?? periodEnd) : null,
    period_end: iso(periodEnd),
  }
}

// action: 'cancel' (default, at period end), 'resume' (undo a pending cancel), 'status'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify the caller's JWT
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  let body
  try {
    body = await readJson(req)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }
  const action = body.action ?? 'cancel'
  if (!['cancel', 'resume', 'status'].includes(action)) return res.status(400).json({ error: 'Unknown action' })

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
    const stripeSub = action === 'status'
      ? await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      // Cancel at period end: the person keeps Pro until the billing cycle ends
      : await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: action === 'cancel' })
    res.json(describe(stripeSub))
  } catch (err) {
    console.error(`Subscription ${action} error:`, err.message)
    res.status(500).json({ error: err.message })
  }
}
