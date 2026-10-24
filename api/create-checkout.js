import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// The only price this endpoint sells; never trust a price sent by the browser
const PRO_PRICE_ID = process.env.STRIPE_PRICE_ID || process.env.VITE_STRIPE_PRICE_ID

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

  let body
  try {
    body = await readJson(req)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }
  if (!PRO_PRICE_ID) return res.status(500).json({ error: 'Pro price is not configured' })
  if (body.price_id && body.price_id !== PRO_PRICE_ID) return res.status(400).json({ error: 'Unknown price' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'https://athrion.app'}?upgraded=1`,
      cancel_url: process.env.APP_URL || 'https://athrion.app',
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { user_id: user.id },
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
