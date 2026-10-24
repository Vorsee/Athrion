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

// Rooms are private; the join_group_session function looks the code up and adds the user
export async function joinGroupSession(code, displayName) {
  const { data, error } = await supabase.rpc('join_group_session', {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName,
  })
  if (error) throw new Error(error.code === 'P0002' ? 'Room not found — check the code and try again' : error.message)
  return data
}

export async function updateSessionExercises(sessionId, exercises, totalSets, restSecs) {
  const { error } = await supabase
    .from('group_sessions')
    .update({ exercises, total_sets: totalSets, rest_secs: restSecs })
    .eq('id', sessionId)

  if (error) throw error
}

export async function updateExercisesOnly(sessionId, exerciseNames) {
  const { error } = await supabase
    .from('group_sessions')
    .update({ exercises: exerciseNames })
    .eq('id', sessionId)

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

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function fetchMyTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*, team_members(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchTeamMembers(teamId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at')
  if (error) throw error
  return data || []
}

export async function createTeam(name, displayName) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: team, error } = await supabase
    .from('teams')
    .insert({ name, created_by: user.id })
    .select().single()
  if (error) throw error
  await supabase.from('team_members')
    .insert({ team_id: team.id, user_id: user.id, display_name: displayName, role: 'admin' })
  return team
}

export async function joinTeamByCode(code, displayName) {
  const { data, error } = await supabase.rpc('join_team_by_code', {
    p_code: code.toUpperCase().trim(),
    p_display_name: displayName,
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function leaveTeam(teamId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('team_members')
    .delete().eq('team_id', teamId).eq('user_id', user.id)
  if (error) throw error
}

export async function fetchTeamActiveSession(teamId) {
  const { data, error } = await supabase
    .from('group_sessions')
    .select('*')
    .eq('team_id', teamId)
    .in('status', ['lobby', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createTeamSession({ teamId, exercises, totalSets, restSecs, displayName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: session, error } = await supabase
    .from('group_sessions')
    .insert({
      host_id: user.id,
      code: '',           // not used for team sessions
      team_id: teamId,
      exercises,
      total_sets: totalSets,
      rest_secs: restSecs,
      status: 'lobby',
    })
    .select().single()
  if (error) throw error

  // Add host as first participant
  await supabase.from('group_participants')
    .insert({ session_id: session.id, user_id: user.id, display_name: displayName })

  // Add host's ready row (not ready yet)
  await supabase.from('team_ready')
    .insert({ session_id: session.id, user_id: user.id, display_name: displayName, is_ready: false })

  return session
}

export async function joinTeamSession(sessionId, displayName) {
  const { data: { user } } = await supabase.auth.getUser()
  // Add to participants (ignore duplicate)
  const { error: pErr } = await supabase.from('group_participants')
    .insert({ session_id: sessionId, user_id: user.id, display_name: displayName })
  if (pErr && pErr.code !== '23505') throw pErr
  // Upsert ready row as not-ready
  await supabase.from('team_ready')
    .upsert({ session_id: sessionId, user_id: user.id, display_name: displayName, is_ready: false, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,user_id' })
}

export async function setReady(sessionId, isReady, displayName) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('team_ready')
    .upsert({ session_id: sessionId, user_id: user.id, display_name: displayName, is_ready: isReady, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,user_id' })
  if (error) throw error
}

export async function fetchReadyStatus(sessionId) {
  const { data, error } = await supabase
    .from('team_ready')
    .select('*')
    .eq('session_id', sessionId)
  if (error) throw error
  return data || []
}

export function subscribeToTeamSession(sessionId, { onReady, onSessionUpdate, onSet, onParticipant }) {
  const channel = supabase
    .channel(`team-session-${sessionId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'team_ready', filter: `session_id=eq.${sessionId}` },
      payload => onReady?.(payload.new))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_sessions', filter: `id=eq.${sessionId}` },
      payload => onSessionUpdate?.(payload.new))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_sets', filter: `session_id=eq.${sessionId}` },
      payload => onSet?.(payload.new))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_participants', filter: `session_id=eq.${sessionId}` },
      payload => onParticipant?.(payload.new))
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export function subscribeToTeamSessions(teamId, onNewSession) {
  const channel = supabase
    .channel(`team-sessions-${teamId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_sessions', filter: `team_id=eq.${teamId}` },
      payload => onNewSession?.(payload.new))
    .subscribe()
  return () => supabase.removeChannel(channel)
}
