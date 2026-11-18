import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { isMinor, MINOR_MESSAGE } from './_minor.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// The only prices this endpoint sells; the browser picks a plan name, never a price.
// coach_*: the coach and club plan (039), Pro plus clubs, rooms of 12 and templates.
const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
  coach_monthly: process.env.STRIPE_PRICE_COACH_MONTHLY,
  coach_annual: process.env.STRIPE_PRICE_COACH_ANNUAL,
}
const LIVE = new Set(['active', 'trialing', 'past_due'])
const TRIAL_DAYS = 7

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  // The user comes from their token, not the request body
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })
  if (await isMinor(supabase, user.id)) return res.status(403).json({ error: MINOR_MESSAGE })

  let body
  try {
    body = await readJson(req)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }
  const plan = body.plan ?? 'monthly'
  if (!Object.hasOwn(PRICES, plan)) return res.status(400).json({ error: 'Unknown plan' })
  if (!PRICES[plan]) return res.status(500).json({ error: plan.startsWith('coach') ? "The coach plan isn't on sale yet." : 'Pro price is not configured' })

  // One free trial per person: anyone who has been through checkout before already has a Stripe customer
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const customer = sub?.stripe_customer_id
  const appUrl = process.env.APP_URL || 'https://athrion.app'

  // Already subscribed (Pro to coach, or back): move the live subscription to the new price,
  // prorated, rather than starting a second one. The webhook updates the tier.
  if (sub?.stripe_subscription_id) {
    try {
      const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      if (LIVE.has(live.status)) {
        const item = live.items.data[0]
        if (item.price.id === PRICES[plan]) return res.json({ switched: true })
        await stripe.subscriptions.update(live.id, {
          items: [{ id: item.id, price: PRICES[plan] }],
          proration_behavior: 'create_prorations',
          cancel_at_period_end: false,
        })
        return res.json({ switched: true })
      }
    } catch (err) {
      if (err?.code !== 'resource_missing') {
        console.error('Stripe plan switch error:', err.message)
        return res.status(500).json({ error: err.message })
      }
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      allow_promotion_codes: true,
      ...(customer ? { customer } : { customer_email: user.email }),
      // user_id on the subscription too, so the webhook can always tie it back to the account
      subscription_data: {
        metadata: { user_id: user.id },
        ...(!customer && {
          trial_period_days: TRIAL_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        }),
      },
      success_url: `${appUrl}?upgraded=1`,
      cancel_url: appUrl,
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan },
    })
    res.json({ url: session.url, trial: !customer })
  } catch (err) {
    console.error('Stripe checkout error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
