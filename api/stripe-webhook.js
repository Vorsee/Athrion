import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { COACH_FEE_RATE } from './_coach-fee.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  const { type, data } = event

  // A coach's workout or plan (api/coach-checkout.js): record the purchase, nothing to do with Pro
  if (type === 'checkout.session.completed' && data.object.metadata?.kind === 'coach_product') {
    const session = data.object
    const m = session.metadata
    if (session.payment_status === 'paid' && m.product_id && m.buyer_id) {
      const { data: product } = await supabase.from('coach_products').select('title').eq('id', m.product_id).maybeSingle()
      const amount = session.amount_total ?? 0
      const { error } = await supabase.from('coach_purchases').upsert({
        product_id: m.product_id,
        coach_id: m.coach_id || null,
        buyer_id: m.buyer_id,
        title: product?.title ?? 'Coach workout',
        amount_cents: amount,
        fee_cents: Math.round(amount * COACH_FEE_RATE),
        status: 'paid',
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent,
      }, { onConflict: 'product_id,buyer_id' })
      // Stripe retries on a 500, so a failed write isn't lost
      if (error) {
        console.error('Coach purchase write failed:', error.message)
        return res.status(500).json({ error: 'write failed' })
      }
    }
    return res.json({ received: true })
  }

  // A refunded coach sale takes the workout away again
  if (type === 'charge.refunded' && data.object.refunded && data.object.payment_intent) {
    await supabase.from('coach_purchases')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent', data.object.payment_intent)
  }

  if (type === 'checkout.session.completed') {
    const session = data.object
    const userId = session.client_reference_id || session.metadata?.user_id
    if (userId) {
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        status: 'pro',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    }
  }

  if (type === 'customer.subscription.updated') {
    const sub = data.object
    // Follow Stripe both ways: lapsed → free, paid again → pro
    const status = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free'
    const { data: row } = await supabase.from('subscriptions')
      .select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle()
    if (row) {
      await supabase.from('subscriptions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('user_id', row.user_id)
    }
  }

  if (type === 'customer.subscription.deleted') {
    const sub = data.object
    const { data: row } = await supabase.from('subscriptions')
      .select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle()
    if (row) {
      await supabase.from('subscriptions')
        .update({ status: 'free', stripe_subscription_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', row.user_id)
    }
  }

  res.json({ received: true })
}
