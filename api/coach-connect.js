import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : {}
}

// Coach payouts through Stripe Connect (Express accounts). Stripe collects the coach's
// identity, bank and tax details; ATHRION only keeps the account id and whether it can be paid.
//   { action: 'onboard' }   → { url } to start or finish Stripe's setup
//   { action: 'status' }    → { charges_enabled }, refreshed from Stripe
//   { action: 'dashboard' } → { url } to the coach's own Stripe dashboard (payouts, tax forms)
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
  const action = body.action ?? 'onboard'
  if (!['onboard', 'status', 'dashboard'].includes(action)) return res.status(400).json({ error: 'Unknown action' })

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('user_id, status, stripe_account_id, charges_enabled')
    .eq('user_id', user.id)
    .maybeSingle()
  if (coach?.status !== 'approved') return res.status(403).json({ error: 'Only approved coaches can set up payouts' })

  const appUrl = process.env.APP_URL || 'https://athrion.app'

  try {
    let account = coach.stripe_account_id
    if (action === 'onboard' && !account) {
      const created = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: { product_description: 'Workouts and training plans sold on ATHRION', url: appUrl },
        metadata: { user_id: user.id },
      })
      account = created.id
      const { error } = await supabase.from('coach_profiles').update({ stripe_account_id: account }).eq('user_id', user.id)
      if (error) throw new Error(error.message)
    }
    if (!account) return res.json({ charges_enabled: false, connected: false })

    if (action === 'onboard') {
      const link = await stripe.accountLinks.create({
        account,
        type: 'account_onboarding',
        refresh_url: `${appUrl}/?open=coach`,
        return_url: `${appUrl}/?open=coach`,
      })
      return res.json({ url: link.url })
    }

    if (action === 'dashboard') {
      const link = await stripe.accounts.createLoginLink(account)
      return res.json({ url: link.url })
    }

    const acct = await stripe.accounts.retrieve(account)
    const charges = !!acct.charges_enabled
    if (charges !== coach.charges_enabled) {
      await supabase.from('coach_profiles').update({ charges_enabled: charges }).eq('user_id', user.id)
    }
    res.json({ charges_enabled: charges, connected: true, details_submitted: !!acct.details_submitted })
  } catch (err) {
    console.error('Coach connect error:', err.message)
    res.status(500).json({ error: "Couldn't reach Stripe. Try again in a moment." })
  }
}
