import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Only what the signed-in shop already shows: never the Stripe account, review notes or content
const COACH = 'user_id, display_name, bio, credentials, specialties, links, avatar_path, charges_enabled'
const PRODUCT = 'id, coach_id, kind, title, summary, description, level, price_cents, minutes, outline, created_at'

// The public preview behind a shared shop link (signed-out visitors can't read the tables).
//   GET ?product=<id> → { coach, products: [that product] }
//   GET ?coach=<id>   → { coach, products: every published one }
// Only published products of approved coaches, as the signed-in read policy in 014 allows.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }
  const { product, coach } = req.query ?? {}
  const id = product || coach
  if (!id || !UUID.test(id)) return res.status(400).json({ error: 'Bad link' })

  let coachId = coach
  let products
  if (product) {
    const { data, error } = await supabase.from('coach_products').select(PRODUCT).eq('id', product).eq('published', true).maybeSingle()
    if (error) return res.status(500).json({ error: 'Could not load' })
    if (!data) return res.status(404).json({ error: 'Not found' })
    coachId = data.coach_id
    products = [data]
  }

  const { data: c, error: cErr } = await supabase.from('coach_profiles').select(COACH).eq('user_id', coachId).eq('status', 'approved').maybeSingle()
  if (cErr) return res.status(500).json({ error: 'Could not load' })
  if (!c) return res.status(404).json({ error: 'Not found' })

  if (!products) {
    const { data, error } = await supabase.from('coach_products').select(PRODUCT).eq('coach_id', coachId).eq('published', true).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: 'Could not load' })
    products = data ?? []
  }

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json({ coach: c, products })
}
