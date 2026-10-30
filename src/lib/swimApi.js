import { supabase } from './supabase.js'

// Swim teams (017): everything goes through the database functions, which check who's asking
const PHOTOS = 'swimmer-photos'

function must({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong')
  return data
}
const one = data => (Array.isArray(data) ? data[0] ?? null : data)

// ── Photos (private bucket, signed links for an hour) ────────────────────────
export async function photoUrls(paths) {
  const list = [...new Set(paths.filter(Boolean))]
  if (!list.length) return {}
  const { data } = await supabase.storage.from(PHOTOS).createSignedUrls(list, 3600)
  return Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}

export async function fetchMyPhoto() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('swim_profiles').select('photo_path').eq('user_id', user.id).maybeSingle()
  return data?.photo_path ?? null
}

export async function uploadMyPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP photo')
  if (file.size > 5 * 1024 * 1024) throw new Error('That photo is over 5 MB')
  const { data: { user } } = await supabase.auth.getUser()
  const old = await fetchMyPhoto()
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${user.id}/photo-${Date.now()}.${ext}`
  must(await supabase.storage.from(PHOTOS).upload(path, file, { contentType: file.type, upsert: false }))
  must(await supabase.from('swim_profiles').upsert({ user_id: user.id, photo_path: path, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }))
  if (old) await supabase.storage.from(PHOTOS).remove([old])
  return path
}

// ── Coach ────────────────────────────────────────────────────────────────────
export const fetchCoachedTeam = async () => one(must(await supabase.rpc('my_coached_team')))
export const saveTeam = async name => one(must(await supabase.rpc('save_swim_team', { p_name: name })))
export const newTeamCode = async () => one(must(await supabase.rpc('new_swim_team_code')))
export const fetchRoster = async () => must(await supabase.rpc('my_swim_roster')) ?? []
export const fetchSwimmerSwims = async userId => must(await supabase.rpc('swimmer_swims', { p_user: userId })) ?? []
// Every swimmer's PR per stroke (020). Before 020 runs there is no leaderboard: empty, not an error
export async function fetchTeamPrs() {
  const { data, error } = await supabase.rpc('my_team_prs')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return []
    throw new Error(error.message || 'Something went wrong')
  }
  return data ?? []
}
// A missing function (a migration not run yet) reads as empty, not an error
async function optional(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) return null
    throw new Error(error.message || 'Something went wrong')
  }
  return data ?? []
}
// A swimmer's team (027): teammates shown to the team, and their best paces
export const fetchTeammates = async () => (await optional('my_teammates')) ?? []
export const fetchTeammatesPrs = async () => (await optional('my_teammates_prs')) ?? []
export const setTeamVisible = async show => must(await supabase.rpc('set_swim_team_visible', { p_show: show }))
export const respondToSwimmer = async (userId, accept) => must(await supabase.rpc('respond_swim_request', { p_user: userId, p_accept: accept }))

// ── Swimmer ──────────────────────────────────────────────────────────────────
export const fetchMyTeam = async () => one(must(await supabase.rpc('my_swim_team')))
export const teamByCode = async code => one(must(await supabase.rpc('swim_team_by_code', { p_code: code })))
export const leaveTeam = async () => must(await supabase.rpc('leave_swim_team'))

export async function searchTeams(q) {
  if (q.trim().length < 2) return []
  return must(await supabase.rpc('search_swim_teams', { p_q: q.trim() })) ?? []
}

// 'active' (on the team) or 'pending' (the coach is asked)
export const joinTeam = async ({ team = null, code = null }) =>
  must(await supabase.rpc('join_swim_team', { p_team: team, p_code: code }))

// The name the swimmer's coach sees (026); '' clears it
export const setTeamName = async name => must(await supabase.rpc('set_swim_team_name', { p_name: name }))
// The account's own name, to suggest as the name the coach sees
export async function accountName() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.user_metadata?.full_name?.trim() ?? ''
}

// ── Practices (025) ──────────────────────────────────────────────────────────
// A team's practices from a date on, soonest first. Before 025 runs: none, and ready is false.
export async function fetchPractices(teamId, from) {
  const { data, error } = await supabase.from('swim_practices').select('id, date, title, items, notes, updated_at')
    .eq('team_id', teamId).gte('date', from).order('date').limit(14)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return { practices: [], ready: false }
    throw new Error(error.message || 'Something went wrong')
  }
  return { practices: data ?? [], ready: true }
}
// Posting one tells every swimmer on the team (025's trigger)
export async function savePractice({ teamId, date, title, items, notes = '' }) {
  const { data: { user } } = await supabase.auth.getUser()
  return one(must(await supabase.from('swim_practices').upsert(
    { team_id: teamId, coach_id: user.id, date, title: title.trim().slice(0, 60), items, notes: notes.trim().slice(0, 500), updated_at: new Date().toISOString() },
    { onConflict: 'team_id,date' }).select('id, date, title, items, notes, updated_at')))
}
export const deletePractice = async id => must(await supabase.from('swim_practices').delete().eq('id', id))
