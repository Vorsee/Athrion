import { supabase } from './supabase.js'

// App reviews (021): public on the landing page, one per person, written in the app.
const SHOWN = 'id, user_id, name, rating, body, created_at'

export async function fetchReviews(limit = 12) {
  // Signed out, RLS (021) only returns shown reviews; this is only called from the landing page
  const { data, error } = await supabase.from('app_reviews').select('name, rating, body, created_at').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchReviewSummary() {
  const { data, error } = await supabase.rpc('review_summary')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { average: row?.average == null ? null : Number(row.average), count: row?.count ?? 0 }
}

export async function fetchMyReview() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('app_reviews').select(`${SHOWN}, hidden`).eq('user_id', user.id).maybeSingle()
  if (error) throw error
  return data
}

export async function saveMyReview({ name, rating, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const row = { name: name.trim().slice(0, 40), rating, body: body.trim().slice(0, 600) }
  const existing = await fetchMyReview()
  const { error } = existing
    ? await supabase.from('app_reviews').update(row).eq('user_id', user.id)
    : await supabase.from('app_reviews').insert({ user_id: user.id, ...row })
  if (error) throw error
}

export async function deleteMyReview() {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('app_reviews').delete().eq('user_id', user.id)
  if (error) throw error
}

// Admins: every review, hidden ones too, and hide or show one
export async function fetchAllReviews() {
  const { data, error } = await supabase.from('app_reviews').select(`${SHOWN}, hidden`).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data ?? []
}
export async function setReviewHidden(id, hidden) {
  const { error } = await supabase.from('app_reviews').update({ hidden }).eq('id', id)
  if (error) throw error
}

// From the landing page, no account needed (022): it waits for an admin to approve it
export async function sendPublicReview({ name, rating, body, website = '' }) {
  const res = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, rating, body, website }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Couldn't send your review. Try again.")
}

// What still stops a review from going out, in words (null when it's ready). The button stays
// on, so tapping it says what's missing instead of doing nothing.
export function reviewProblem({ name, rating, body }) {
  if (!(rating >= 1)) return 'Tap the stars to pick a rating'
  const left = 10 - body.trim().length
  if (left > 0) return `Write ${left} more ${left === 1 ? 'character' : 'characters'} (10 at least)`
  if (!name.trim()) return 'Add your name'
  return null
}

// "Sam Tester" → "Sam T."
export function shortName(full) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}
