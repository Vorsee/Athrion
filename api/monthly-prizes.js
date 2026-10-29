import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// One calendar month later, in Unix seconds
function plusMonth(secs) {
  const d = new Date(secs * 1000)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return Math.floor(d.getTime() / 1000)
}

// Hands out the free month for a top-3 finish (see 010 in supabase/schema.sql).
// Vercel cron calls this daily; it only acts on prizes not given yet, so a failed run retries.
// Paying through Stripe: the next charge moves a month later (a free period via trial_end).
// Anyone else, or a Stripe subscription that isn't active: a free Pro month in comp_pro_until.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: due, error } = await supabase
    .from('monthly_scores')
    .select('user_id, month')
    .eq('prize_pro', true)
    .is('prize_given_at', null)
  if (error) return res.status(500).json({ error: error.message })

  const results = []
  for (const prize of due || []) {
    try {
      const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', prize.user_id).maybeSingle()
      let via = 'comp'
      if (sub?.status === 'pro' && sub.stripe_subscription_id) {
        const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
        if (s.status === 'active' || s.status === 'trialing') {
          // Newer Stripe API versions report the period end on the subscription items
          const nextCharge = Math.max(s.trial_end ?? 0, s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? 0)
          await stripe.subscriptions.update(s.id,
            { trial_end: plusMonth(nextCharge), proration_behavior: 'none' },
            { idempotencyKey: `prize-${prize.user_id}-${prize.month}` })
          via = 'stripe'
        }
      }
      if (via === 'comp') {
        const from = Math.max(Date.now(), sub?.comp_pro_until ? Date.parse(sub.comp_pro_until) : 0)
        const { error: e } = await supabase.from('subscriptions')
          .update({ comp_pro_until: new Date(plusMonth(from / 1000) * 1000).toISOString(), updated_at: new Date().toISOString() })
          .eq('user_id', prize.user_id)
        if (e) throw e
      }
      await supabase.from('monthly_scores')
        .update({ prize_given_at: new Date().toISOString() })
        .eq('user_id', prize.user_id)
        .eq('month', prize.month)
      results.push({ month: prize.month, via })
    } catch (e) {
      console.error('Prize failed:', prize.month, e.message)
      results.push({ month: prize.month, error: e.message })
    }
  }

  res.json({ given: results.filter(r => !r.error).length, results })
}
