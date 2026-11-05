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
  const { data: row } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  try {
    // The row can be missing the subscription id, or hold an old one (a new subscription after a
    // cancelled one, a webhook that didn't arrive): Stripe is the source of truth, so look it up there
    const live = await findSubscription(row, user)
    if (!live) {
      return res.status(400).json({ error: `We couldn't find a subscription for ${user.email} in Stripe. If you're being charged, email athrionsportapp@gmail.com and we'll sort it out.` })
    }
    if (live.id !== row?.stripe_subscription_id || row?.status !== 'pro') await repairRow(user.id, live)

    const stripeSub = action === 'status'
      ? live
      // Cancel at period end: the person keeps Pro until the billing cycle ends
      : await stripe.subscriptions.update(live.id, { cancel_at_period_end: action === 'cancel' })
    res.json(describe(stripeSub))
  } catch (err) {
    console.error(`Subscription ${action} error:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

const LIVE = new Set(['active', 'trialing', 'past_due'])

// Their live Stripe subscription: the saved one while it's still live, else the newest live one
// on their Stripe customer (saved, or found by their sign-in email, which checkout uses)
async function findSubscription(row, user) {
  if (row?.stripe_subscription_id) {
    try {
      const saved = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      if (LIVE.has(saved.status)) return saved
    } catch (err) {
      if (err?.code !== 'resource_missing') throw err
    }
  }
  const customers = row?.stripe_customer_id ? [row.stripe_customer_id] : []
  if (user.email) {
    const found = await stripe.customers.list({ email: user.email, limit: 10 })
    for (const c of found.data ?? []) if (!customers.includes(c.id)) customers.push(c.id)
  }
  for (const customer of customers) {
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 })
    const newest = (subs.data ?? []).filter(x => LIVE.has(x.status)).sort((a, b) => b.created - a.created)[0]
    if (newest) return newest
  }
  return null
}

// Save what Stripe says, so Pro and the next visit read the right subscription
async function repairRow(userId, live) {
  const customer = typeof live.customer === 'string' ? live.customer : live.customer?.id
  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    status: live.status === 'past_due' ? 'free' : 'pro',
    stripe_subscription_id: live.id,
    ...(customer && { stripe_customer_id: customer }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) console.error('Subscription row repair failed:', error.message)
}
