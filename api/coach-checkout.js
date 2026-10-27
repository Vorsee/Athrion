import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { COACH_FEE_RATE } from './_coach-fee.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : {}
}

// Buying a coach's workout or plan: a one-off Checkout payment. The price and coach come from
// the database, never the browser. The webhook records the purchase (kind 'coach_product').
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  let body
  try { body = await readJson(req) } catch { return res.status(400).json({ error: 'Invalid JSON body' }) }
  const productId = body.productId
  if (typeof productId !== 'string' || !/^[0-9a-f-]{36}$/.test(productId)) return res.status(400).json({ error: 'Unknown product' })

  const { data: product } = await supabase
    .from('coach_products')
    .select('id, title, price_cents, published, coach_id')
    .eq('id', productId)
    .maybeSingle()
  if (!product || !product.published) return res.status(404).json({ error: "This isn't on sale any more" })
  if (!(product.price_cents > 0)) return res.status(400).json({ error: 'This one is free' })
  if (product.coach_id === user.id) return res.status(400).json({ error: "You can't buy your own workout" })

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('status, stripe_account_id, charges_enabled')
    .eq('user_id', product.coach_id)
    .maybeSingle()
  if (coach?.status !== 'approved' || !coach.stripe_account_id || !coach.charges_enabled) {
    return res.status(409).json({ error: "This coach can't take payments right now" })
  }

  const { data: owned } = await supabase
    .from('coach_purchases')
    .select('id')
    .eq('product_id', product.id)
    .eq('buyer_id', user.id)
    .eq('status', 'paid')
    .maybeSingle()
  if (owned) return res.status(409).json({ error: 'You already have this' })

  const appUrl = process.env.APP_URL || 'https://athrion.app'
  const fee = Math.round(product.price_cents * COACH_FEE_RATE)
  const metadata = { kind: 'coach_product', product_id: product.id, buyer_id: user.id, coach_id: product.coach_id }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: product.price_cents, product_data: { name: product.title } },
      }],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: coach.stripe_account_id },
        metadata,
      },
      customer_email: user.email,
      client_reference_id: user.id,
      metadata,
      success_url: `${appUrl}/?open=shop&product=${product.id}&paid=1`,
      cancel_url: `${appUrl}/?open=shop&product=${product.id}`,
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Coach checkout error:', err.message)
    res.status(500).json({ error: "Couldn't start the payment. Try again in a moment." })
  }
}
