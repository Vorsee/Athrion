import { supabase } from './supabase.js'
import { localDateKey } from './data.js'

async function userId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user.id
}

// ── Body measurements ─────────────────────────────────────────────────────────

export async function fetchMeasurements(limit = 120) {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// One row per day; saving again on the same day updates it
export async function saveMeasurement(m) {
  const { data, error } = await supabase
    .from('body_measurements')
    .upsert({ ...m, user_id: await userId() }, { onConflict: 'user_id,date' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMeasurement(id) {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id)
  if (error) throw error
}

// ── Daily health (manual, HealthKit, Health Connect) ──────────────────────────

export async function fetchDailyHealth(days = 30) {
  const since = localDateKey(Date.now() - days * 86400000)
  const { data, error } = await supabase
    .from('daily_health')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function saveDailyHealth(rows) {
  const uid = await userId()
  const list = (Array.isArray(rows) ? rows : [rows]).map(r => ({ ...r, user_id: uid, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from('daily_health').upsert(list, { onConflict: 'user_id,date' })
  if (error) throw error
}

// ── Progress photos (private bucket, one folder per user) ─────────────────────

const PHOTO_BUCKET = 'progress-photos'

export async function fetchProgressPhotos() {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  if (!data.length) return []
  // Signed URLs expire after an hour; the bucket itself is private
  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(data.map(p => p.storage_path), 3600)
  return data.map((p, i) => ({ ...p, url: signed?.[i]?.signedUrl ?? null }))
}

export async function uploadProgressPhoto(file, { date, pose }) {
  const uid = await userId()
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${uid}/${date}-${pose}-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type })
  if (upErr) throw upErr
  const { data, error } = await supabase
    .from('progress_photos')
    .insert({ user_id: uid, date, pose, storage_path: path })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProgressPhoto(photo) {
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id)
  if (error) throw error
}

// ── Badges ────────────────────────────────────────────────────────────────────

export async function fetchBadges() {
  const { data, error } = await supabase.from('user_badges').select('*')
  if (error) throw error
  return data
}

export async function awardBadges(badgeIds) {
  if (!badgeIds.length) return
  const uid = await userId()
  const { error } = await supabase
    .from('user_badges')
    .upsert(badgeIds.map(badge_id => ({ user_id: uid, badge_id })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
  if (error) throw error
}

// ── Push reminders ────────────────────────────────────────────────────────────

export async function fetchReminderSettings() {
  const { data, error } = await supabase.from('reminder_settings').select('*').maybeSingle()
  if (error) throw error
  return data
}

export async function saveReminderSettings(settings) {
  const { error } = await supabase
    .from('reminder_settings')
    .upsert({ ...settings, user_id: await userId(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function savePushSubscription(sub) {
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: await userId(),
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// Weigh-ins recorded in weekly check-ins, as { date, weight_lb }
export async function fetchCheckinWeights() {
  const { data, error } = await supabase
    .from('progress_checkins')
    .select('created_at, weight_lb')
    .not('weight_lb', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data.map(c => ({ date: localDateKey(c.created_at), weight_lb: c.weight_lb }))
}
