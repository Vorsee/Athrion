// Coaches and the shop (014_coaches.sql). Listings are public to signed-in people; a product's
// content (sets, tips, video paths) is only readable by its coach and people who have it.
import { supabase } from './supabase.js'
import { postAsUser } from './stripe.js'

// coach_profiles is readable column by column (the Stripe account id isn't), so never select('*')
export const COACH_COLUMNS = 'user_id, display_name, bio, credentials, specialties, links, avatar_path, status, review_note, charges_enabled, applied_at, reviewed_at'
const PRODUCT_COLUMNS = 'id, coach_id, kind, title, summary, description, level, price_cents, minutes, outline, published, created_at, updated_at'

export const LEVELS = ['All levels', 'Beginner', 'Intermediate', 'Advanced']
export const SPECIALTIES = ['Strength', 'Muscle', 'Fat loss', 'Mobility', 'Running', 'Swimming', 'Home workouts', 'Beginners', 'Sport']
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MAX_VIDEO_MB = 100

const uid = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  return user.id
}
const must = ({ data, error }) => { if (error) throw error; return data }

export const avatarUrl = path => (path ? supabase.storage.from('coach-avatars').getPublicUrl(path).data.publicUrl : null)
export const priceText = cents => (cents ? `$${(cents / 100).toFixed(2)}` : 'Free')

// ── The coach's own side ────────────────────────────────────────────────────
export async function fetchMyCoach() {
  const id = await uid()
  return must(await supabase.from('coach_profiles').select(COACH_COLUMNS).eq('user_id', id).maybeSingle())
}

const PROFILE_FIELDS = ['display_name', 'bio', 'credentials', 'specialties', 'links', 'avatar_path']
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

// First application, an edit, or (after a no) applying again
export async function saveCoachProfile(fields, { reapply = false, isNew = false } = {}) {
  const id = await uid()
  const row = pick(fields, PROFILE_FIELDS)
  if (isNew) must(await supabase.from('coach_profiles').insert({ user_id: id, ...row }))
  else must(await supabase.from('coach_profiles').update(row).eq('user_id', id))
  if (reapply) must(await supabase.rpc('reapply_coach'))
  return fetchMyCoach()
}

export async function uploadAvatar(file) {
  const id = await uid()
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${id}/avatar-${Date.now()}.${ext}`
  must(await supabase.storage.from('coach-avatars').upload(path, file, { contentType: file.type, upsert: false }))
  return path
}

export async function fetchMyProducts() {
  const id = await uid()
  return must(await supabase.from('coach_products').select(PRODUCT_COLUMNS).eq('coach_id', id).order('created_at', { ascending: false })) ?? []
}

// Sales of my products: what each sold and what I earned (after ATHRION's share)
export async function fetchMySales() {
  const id = await uid()
  const rows = must(await supabase.from('coach_purchases').select('product_id, amount_cents, fee_cents, status, created_at').eq('coach_id', id)) ?? []
  const paid = rows.filter(r => r.status === 'paid' && r.amount_cents > 0)
  const byProduct = {}
  for (const r of rows.filter(r => r.status === 'paid')) byProduct[r.product_id] = (byProduct[r.product_id] ?? 0) + 1
  return { byProduct, sales: paid.length, earnedCents: paid.reduce((a, r) => a + r.amount_cents - r.fee_cents, 0) }
}

// What the listing shows before anyone buys: exercise names, or each day's title
export function outlineOf(kind, content) {
  if (kind === 'workout') return (content.exercises ?? []).map(e => e.name)
  return (content.days ?? []).map(d => ({ day: d.day, title: d.rest ? 'Rest' : d.title || 'Workout', rest: !!d.rest, count: d.rest ? 0 : d.exercises?.length ?? 0 }))
}

export async function saveProduct(product, content) {
  const id = await uid()
  const row = {
    kind: product.kind,
    title: product.title.trim(),
    summary: product.summary?.trim() ?? '',
    description: product.description?.trim() ?? '',
    level: product.level,
    price_cents: product.price_cents,
    minutes: product.minutes || null,
    outline: outlineOf(product.kind, content),
    published: !!product.published,
    updated_at: new Date().toISOString(),
  }
  // New products bring their own id, made in the editor, so videos can be uploaded before the first save
  const saved = product._new
    ? must(await supabase.from('coach_products').upsert({ ...row, id: product.id, coach_id: id }, { onConflict: 'id' }).select(PRODUCT_COLUMNS).single())
    : must(await supabase.from('coach_products').update(row).eq('id', product.id).select(PRODUCT_COLUMNS).single())
  must(await supabase.from('coach_product_content').upsert({ product_id: saved.id, content }, { onConflict: 'product_id' }))
  return saved
}

export async function deleteProduct(productId) {
  const { data, error } = await supabase.from('coach_products').delete().eq('id', productId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('People have bought this, so it can only be unpublished.')
}

// Videos go to <my id>/<product id>-<time>.<ext>; the product id in the name is what lets buyers watch
export async function uploadVideo(productId, file) {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Videos can be up to ${MAX_VIDEO_MB} MB. Try a shorter clip.`)
  const id = await uid()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const path = `${id}/${productId}-${Date.now()}.${ext}`
  must(await supabase.storage.from('coach-videos').upload(path, file, { contentType: file.type || 'video/mp4', upsert: false }))
  return path
}

export async function removeVideo(path) {
  await supabase.storage.from('coach-videos').remove([path])
}

export async function videoUrl(path) {
  const { data, error } = await supabase.storage.from('coach-videos').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// Payouts: Stripe Connect, see api/coach-connect.js
export async function coachConnect(action) {
  const { res, data } = await postAsUser('/api/coach-connect', { action })
  if (!res.ok) throw new Error(data.error || "Couldn't reach Stripe")
  return data
}

// ── The shop ────────────────────────────────────────────────────────────────
export async function fetchShop() {
  const [coaches, products] = await Promise.all([
    supabase.from('coach_profiles').select(COACH_COLUMNS).eq('status', 'approved').then(must),
    supabase.from('coach_products').select(PRODUCT_COLUMNS).eq('published', true).order('created_at', { ascending: false }).then(must),
  ])
  const live = new Set((coaches ?? []).map(c => c.user_id))
  return { coaches: coaches ?? [], products: (products ?? []).filter(p => live.has(p.coach_id)) }
}

export async function fetchProduct(productId) {
  return must(await supabase.from('coach_products').select(PRODUCT_COLUMNS).eq('id', productId).maybeSingle())
}

export async function fetchCoach(coachId) {
  return must(await supabase.from('coach_profiles').select(COACH_COLUMNS).eq('user_id', coachId).maybeSingle())
}

// null when the caller can't open it yet (paid and not bought)
export async function fetchContent(productId) {
  const row = must(await supabase.from('coach_product_content').select('content').eq('product_id', productId).maybeSingle())
  return row?.content ?? null
}

export async function fetchMyPurchases() {
  const id = await uid()
  return must(await supabase.from('coach_purchases').select('product_id, title, amount_cents, status, created_at').eq('buyer_id', id).eq('status', 'paid').order('created_at', { ascending: false })) ?? []
}

export async function claimFree(productId) {
  must(await supabase.rpc('claim_free_product', { p_id: productId }))
}

export async function buyProduct(productId) {
  const { res, data } = await postAsUser('/api/coach-checkout', { productId })
  if (!res.ok) throw new Error(data.error || "Couldn't start the payment")
  window.location.href = data.url
}

// ── Admin: coach applications ───────────────────────────────────────────────
export async function fetchIsAdmin() {
  const id = await uid()
  const { data } = await supabase.from('app_admins').select('user_id').eq('user_id', id).maybeSingle()
  return !!data
}

export async function fetchApplications() {
  return must(await supabase.from('coach_profiles').select(COACH_COLUMNS).in('status', ['pending']).order('applied_at')) ?? []
}

export async function reviewCoach(userId, status, note = null) {
  must(await supabase.rpc('review_coach', { p_user: userId, p_status: status, p_note: note }))
}

// Turns a coach's workout (or a plan day) into what Workout's plan start takes
export function toPlanDay(title, exercises) {
  return {
    title,
    workout: {
      exercises: exercises.map(e => ({
        name: e.name, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds,
        coachTip: e.tip || undefined, coachVideo: e.video || undefined,
      })),
    },
  }
}
