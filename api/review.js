import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Per visitor (hashed address): this many reviews a day; and at most this many waiting from everyone in an hour
const PER_VISITOR_DAY = 2
const ALL_HOUR = 40

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString().slice(0, 10000)
  try { return text ? JSON.parse(text) : {} } catch { return {} }
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)

// Checks one review from the landing page form. Returns { name, rating, body } or { error }.
export function readReview(input) {
  if (input?.website) return { error: 'spam' } // a field people never see; bots fill it
  const name = clean(input?.name, 40)
  const body = clean(input?.body, 600)
  const rating = Number(input?.rating)
  if (!name) return { error: 'Add your name' }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Pick 1 to 5 stars' }
  if (body.length < 10) return { error: 'Write at least 10 characters' }
  if (/https?:\/\/|www\./i.test(body + name)) return { error: 'Please leave links out of reviews' }
  return { name, rating, body }
}

// POST { name, rating, body, website } from the landing page, no account needed.
// Saved hidden: it shows once an admin approves it (022 notifies them).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }
  const review = readReview(await readJson(req))
  // Bots get a quiet yes, so they don't learn what gave them away
  if (review.error === 'spam') return res.status(200).json({ ok: true })
  if (review.error) return res.status(400).json({ error: review.error })

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
  const ipHash = createHash('sha256').update(`athrion-review:${ip}`).digest('hex').slice(0, 64)

  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const hourAgo = new Date(Date.now() - 3600000).toISOString()
  const [{ count: mine }, { count: all }] = await Promise.all([
    supabase.from('app_reviews').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', dayAgo),
    supabase.from('app_reviews').select('id', { count: 'exact', head: true }).is('user_id', null).gte('created_at', hourAgo),
  ])
  if ((mine ?? 0) >= PER_VISITOR_DAY) return res.status(429).json({ error: "Thanks, we've already got your review." })
  if ((all ?? 0) >= ALL_HOUR) return res.status(429).json({ error: 'Too many reviews right now. Try again later.' })

  const { error } = await supabase.from('app_reviews').insert({ ...review, user_id: null, hidden: true, ip_hash: ipHash })
  if (error) {
    console.error('review insert:', error.message)
    return res.status(500).json({ error: "Couldn't send your review. Try again." })
  }
  return res.status(200).json({ ok: true })
}
