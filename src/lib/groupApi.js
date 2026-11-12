import { supabase } from './supabase.js'

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }
  return code
}

// Most people in one room (034 enforces it when joining)
export const ROOM_SIZE = 6

export async function createGroupSession({ displayName }) {
  const { data: { user } } = await supabase.auth.getUser()

  // Codes are unique for good: on the rare clash, try a new one
  let session, error
  for (let tries = 0; tries < 5; tries++) {
    ({ data: session, error } = await supabase
      .from('group_sessions')
      .insert({ host_id: user.id, code: makeCode(), status: 'lobby' })
      .select()
      .single())
    if (!error || error.code !== '23505') break
  }
  if (error) throw error

  const { error: pErr } = await supabase
    .from('group_participants')
    .insert({ session_id: session.id, user_id: user.id, display_name: displayName })

  if (pErr) throw pErr

  return session
}

// Rooms are private; the join_group_session function looks the code up and adds the user
export async function joinGroupSession(code, displayName) {
  const { data, error } = await supabase.rpc('join_group_session', {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName,
  })
  if (error) throw roomError(error)
  return data
}

// What a failed join says, and whether to offer starting your own room
const JOIN_ERRORS = {
  P0002: ['Room not found. Check the code and try again.', false],
  P0003: ['This room has ended. Start your own.', true],
  P0004: [`This room is full: ${ROOM_SIZE} people already.`, true],
  P0005: ['The host removed you from this room.', true],
}
export function roomError(error) {
  const [message, startOwn] = JOIN_ERRORS[error?.code] ?? [error?.message || "Couldn't join the room. Try again.", false]
  return Object.assign(new Error(message), { code: error?.code, startOwn })
}

// The host takes someone out of the room; they can't join it again (034)
export async function removeRoomMember(sessionId, userId) {
  const { error } = await supabase.rpc('remove_room_member', { p_session: sessionId, p_user: userId })
  if (error) throw error
}

// Leaving: from the lobby the seat goes too; finished (keepSeat) stays to see the standings.
// A host hands over to the earliest joiner, or the room ends with no one left (034).
// Throws before 034 (no function yet), so a finishing host can end the room the old way.
export async function leaveGroupSession(sessionId, { keepSeat = false } = {}) {
  const { data, error } = await supabase.rpc('leave_group_session', { p_session: sessionId, p_keep_seat: keepSeat })
  if (error) throw error
  return data ?? null
}

// The set-by-set plan (013) plus the old columns, so older app versions in the room still follow along.
// Before 013 is applied the plan column is missing: save the old columns alone.
export async function saveSessionPlan(sessionId, plan) {
  const legacy = {
    exercises: plan.map(e => e.name).filter(Boolean), // a free room's plan has no names
    total_sets: Math.max(1, ...plan.map(e => e.sets.length)),
    rest_secs: plan[0]?.sets[0]?.rest ?? 60,
  }
  let { error } = await supabase.from('group_sessions').update({ ...legacy, plan }).eq('id', sessionId)
  if (error && /plan/.test(error.message || '') && /column/.test(error.message || '')) {
    ({ error } = await supabase.from('group_sessions').update(legacy).eq('id', sessionId))
  }
  if (error) throw error
}

export async function fetchGroupSession(sessionId) {
  const { data, error } = await supabase
    .from('group_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return data
}

export async function startGroupSession(sessionId) {
  const { error } = await supabase
    .from('group_sessions')
    .update({ status: 'active' })
    .eq('id', sessionId)

  if (error) throw error
}

export async function endGroupSession(sessionId) {
  const { error } = await supabase
    .from('group_sessions')
    .update({ status: 'done' })
    .eq('id', sessionId)

  if (error) throw error
}

export async function fetchParticipants(sessionId) {
  const { data, error } = await supabase
    .from('group_participants')
    .select('*')
    .eq('session_id', sessionId)

  if (error) throw error
  return data || []
}

// clientId / loggedAt: the set's id and time from the phone (roomQueue.js), so a set queued
// without signal keeps its place and is stored once however often it's sent (035)
export async function logGroupSet({ sessionId, displayName, exercise, setNum, weight, reps, clientId, loggedAt }) {
  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    session_id: sessionId,
    user_id: user.id,
    display_name: displayName,
    exercise,
    set_num: setNum,
    weight,
    reps,
  }
  const insert = values => supabase.from('group_sets').insert(values).select().single()

  let { data, error } = await insert(clientId ? { ...row, client_id: clientId, logged_at: loggedAt } : row)
  if (error?.code === '23505') return null // already stored: the first send got through
  if (error && clientId && /client_id/.test(error.message || '')) {
    ({ data, error } = await insert(row)) // before 035
  }
  if (error) throw error
  return data // shown straight away, before realtime or polling brings it back
}

export async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function fetchGroupSets(sessionId) {
  const { data, error } = await supabase
    .from('group_sets')
    .select('*')
    .eq('session_id', sessionId)
    .order('logged_at', { ascending: true })

  if (error) throw error
  return data || []
}

// Reactions on someone's set (037): laughing, like, dumbbell
export const REACTIONS = [['laugh', 'mdi:emoticon-lol-outline', 'Laughing'], ['like', 'mdi:thumb-up-outline', 'Like'], ['lift', 'mdi:dumbbell', 'Strong']]

export async function sendReaction({ sessionId, set, kind, fromName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('group_reactions')
    .insert({ session_id: sessionId, set_id: set.id, to_user: set.user_id, from_user: user.id, from_name: fromName, kind })
    .select().single()
  if (error?.code === '23505') return null // already sent this one
  if (error) throw error
  return data
}

// null before 037 (no table yet): the room then shows no reaction buttons
export async function fetchReactions(sessionId) {
  const { data, error } = await supabase.from('group_reactions').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
  if (error) return ['42P01', 'PGRST205'].includes(error.code) ? null : []
  return data || []
}

export function subscribeToGroupSession(sessionId, { onSet, onParticipant, onSessionUpdate, onReaction }) {
  const channel = supabase
    .channel(`group-session-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_sets', filter: `session_id=eq.${sessionId}` },
      payload => onSet(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_participants', filter: `session_id=eq.${sessionId}` },
      payload => onParticipant(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_sessions', filter: `id=eq.${sessionId}` },
      payload => onSessionUpdate(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_reactions', filter: `session_id=eq.${sessionId}` },
      payload => onReaction?.(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
