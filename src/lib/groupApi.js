import { supabase } from './supabase.js'

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }
  return code
}

export async function createGroupSession({ displayName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const code = makeCode()

  const { data: session, error } = await supabase
    .from('group_sessions')
    .insert({
      host_id: user.id,
      code,
      status: 'lobby',
    })
    .select()
    .single()

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
  if (error) throw new Error(error.code === 'P0002' ? 'Room not found — check the code and try again' : error.message)
  return data
}

// The set-by-set plan (013) plus the old columns, so older app versions in the room still follow along.
// Before 013 is applied the plan column is missing: save the old columns alone.
export async function saveSessionPlan(sessionId, plan) {
  const legacy = {
    exercises: plan.map(e => e.name),
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

export async function logGroupSet({ sessionId, displayName, exercise, setNum, weight, reps }) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('group_sets')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      display_name: displayName,
      exercise,
      set_num: setNum,
      weight,
      reps,
    })
    .select()
    .single()

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

export function subscribeToGroupSession(sessionId, { onSet, onParticipant, onSessionUpdate }) {
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
    .subscribe()

  return () => supabase.removeChannel(channel)
}
