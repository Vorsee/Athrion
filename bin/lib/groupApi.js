import { supabase } from './supabase.js'

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }
  return code
}

export async function createGroupSession({ exercises, totalSets, restSecs, displayName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const code = makeCode()

  const { data: session, error } = await supabase
    .from('group_sessions')
    .insert({
      host_id: user.id,
      code,
      exercises,
      total_sets: totalSets,
      rest_secs: restSecs,
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

export async function joinGroupSession(code, displayName) {
  const { data: sessions, error } = await supabase
    .from('group_sessions')
    .select('*')
    .eq('code', code.toUpperCase())
    .in('status', ['lobby', 'active'])

  if (error) throw error
  if (!sessions || sessions.length === 0) throw new Error('Room not found — check the code and try again')

  const session = sessions[0]
  const { data: { user } } = await supabase.auth.getUser()

  const { error: pErr } = await supabase
    .from('group_participants')
    .upsert({ session_id: session.id, user_id: user.id, display_name: displayName }, { onConflict: 'session_id,user_id' })

  if (pErr) throw pErr

  return session
}

export async function updateSessionExercises(sessionId, exercises, totalSets, restSecs) {
  const { error } = await supabase
    .from('group_sessions')
    .update({ exercises, total_sets: totalSets, rest_secs: restSecs })
    .eq('id', sessionId)

  if (error) throw error
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

  const { error } = await supabase
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

  if (error) throw error
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
