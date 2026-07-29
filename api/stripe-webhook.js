import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

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
    // Mark as free if subscription is no longer active
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      const { data: row } = await supabase.from('subscriptions')
        .select('user_id').eq('stripe_subscription_id', sub.id).single()
      if (row) {
        await supabase.from('subscriptions')
          .update({ status: 'free', updated_at: new Date().toISOString() })
          .eq('user_id', row.user_id)
      }
    }
  }

  if (type === 'customer.subscription.deleted') {
    const sub = data.object
    const { data: row } = await supabase.from('subscriptions')
      .select('user_id').eq('stripe_subscription_id', sub.id).single()
    if (row) {
      await supabase.from('subscriptions')
        .update({ status: 'free', stripe_subscription_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', row.user_id)
    }
  }

  res.json({ received: true })
}
