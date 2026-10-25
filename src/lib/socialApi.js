import { supabase } from './supabase.js'
import { cleanNickname } from './points.js'

// ── Nickname ─────────────────────────────────────────────────────────────────

export async function fetchMySocial() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('social_profiles')
    .select('nickname, on_leaderboard')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data // null until a nickname is picked
}

export async function saveNickname(nickname) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('social_profiles')
    .upsert({ user_id: user.id, nickname: cleanNickname(nickname) }, { onConflict: 'user_id' })
    .select('nickname, on_leaderboard')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That nickname is taken')
    if (error.code === '23514') throw new Error('That nickname is not allowed')
    throw error
  }
  return data
}

export async function setOnLeaderboard(on) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('social_profiles').update({ on_leaderboard: on }).eq('user_id', user.id)
  if (error) throw error
}

// ── Friends ──────────────────────────────────────────────────────────────────

export async function searchNicknames(query, mine) {
  const q = cleanNickname(query).replace(/[%_\\]/g, '\\$&')
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('social_profiles')
    .select('nickname')
    .ilike('nickname', `${q}%`)
    .order('nickname')
    .limit(6)
  if (error) throw error
  return (data || []).map(r => r.nickname).filter(n => n !== mine)
}

// 'pending' when a request was sent, 'friends' when you're now friends
export async function sendFriendRequest(nickname) {
  const { data, error } = await supabase.rpc('send_friend_request', { p_nickname: cleanNickname(nickname) })
  if (error) throw new Error(error.message || 'Could not send the request')
  return data
}

export async function respondFriendRequest(id, accept) {
  const { error } = await supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept })
  if (error) throw error
}

export async function removeFriend(id) {
  const { error } = await supabase.rpc('remove_friend', { p_id: id })
  if (error) throw error
}

// [{ id, nickname, status: 'pending' | 'accepted', incoming }]
export async function fetchFriends() {
  const { data, error } = await supabase.rpc('my_friends')
  if (error) throw error
  return data || []
}

// ── Points ───────────────────────────────────────────────────────────────────

// scope: 'friends' | 'everyone' → [{ place, nickname, points, workout_days, lifetime, medals, is_me }]
export async function fetchLeaderboard(scope) {
  const { data, error } = await supabase.rpc('leaderboard', { p_scope: scope })
  if (error) throw error
  return data || []
}

export async function fetchMyPoints() {
  const { data, error } = await supabase.rpc('my_points')
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) || { points: 0, workout_days: 0, full_weeks: 0, prs: 0, together: 0, lifetime: 0 }
}

// Closed months, newest first: [{ month, points, workout_days, rank, prize_pro }]
export async function fetchMyMonths() {
  const { data, error } = await supabase
    .from('monthly_scores')
    .select('month, points, workout_days, rank, prize_pro')
    .order('month', { ascending: false })
  if (error) throw error
  return data || []
}

// ── Invite links: athrion.app/add/<nickname> ────────────────────────────────

export const inviteUrl = nickname => `${window.location.origin}/add/${nickname}`

const INVITE_KEY = 'athrion_friend_invite'
export function rememberInvite(nickname) {
  try { localStorage.setItem(INVITE_KEY, cleanNickname(nickname)) } catch {}
}
export function readInvite() {
  try { return localStorage.getItem(INVITE_KEY) || null } catch { return null }
}
export function clearInvite() {
  try { localStorage.removeItem(INVITE_KEY) } catch {}
}
