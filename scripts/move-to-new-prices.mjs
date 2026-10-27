// Moves every Pro subscription on an old price to the new one, from its next bill (no
// proration, no charge today). Trials keep their trial. Run from your own terminal:
//
//   STRIPE_SECRET_KEY=sk_live_... node scripts/move-to-new-prices.mjs \
//     --monthly price_OLD_MONTHLY:price_NEW_MONTHLY --annual price_OLD_ANNUAL:price_NEW_ANNUAL
//
// It only lists what it would change. Add --apply to change the subscriptions.
import Stripe from 'stripe'

const args = process.argv.slice(2)
const arg = name => args[args.indexOf(`--${name}`) + 1]
const apply = args.includes('--apply')
const pairs = ['monthly', 'annual']
  .map(n => (args.includes(`--${n}`) ? arg(n).split(':') : null))
  .filter(Boolean)

if (!process.env.STRIPE_SECRET_KEY || !pairs.length || pairs.some(p => p.length !== 2 || !p[0] || !p[1])) {
  console.error('Usage: STRIPE_SECRET_KEY=sk_... node scripts/move-to-new-prices.mjs --monthly old:new --annual old:new [--apply]')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
let moved = 0, failed = 0

for (const [from, to] of pairs) {
  for (const status of ['active', 'trialing', 'past_due']) {
    for await (const sub of stripe.subscriptions.list({ price: from, status, limit: 100 })) {
      const item = sub.items.data.find(i => i.price.id === from)
      if (!item) continue
      const when = new Date((item.current_period_end ?? sub.current_period_end) * 1000).toISOString().slice(0, 10)
      console.log(`${apply ? 'Moving' : 'Would move'} ${sub.id} (${sub.customer}, ${status}) ${from} → ${to}, new price from ${when}`)
      if (!apply) { moved++; continue }
      try {
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: to }],
          proration_behavior: 'none',
        })
        moved++
      } catch (err) {
        failed++
        console.error(`  failed: ${err.message}`)
      }
    }
  }
}

console.log(`\n${apply ? 'Moved' : 'Would move'} ${moved} subscription(s)${failed ? `, ${failed} failed` : ''}.${apply ? '' : ' Run again with --apply to do it.'}`)
