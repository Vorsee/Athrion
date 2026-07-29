import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return JSON.parse(Buffer.concat(chunks).toString())
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  let user_id, price_id
  try {
    ;({ user_id, price_id } = await readJson(req))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  if (!user_id || !price_id) {
    return res.status(400).json({ error: 'user_id and price_id are required' })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'https://athrion.app'}?upgraded=1`,
      cancel_url: process.env.APP_URL || 'https://athrion.app',
      client_reference_id: user_id,
      metadata: { user_id },
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
