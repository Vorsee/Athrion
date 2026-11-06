// Coaches and their clients (031): invite link /trainer/<code>, the coach's client list and
// each client's training, workouts the coach assigns, and the client's side of it. Every
// cross-user read goes through the 031 functions, which check the coach-client link.
import { supabase } from './supabase.js'

function must({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong')
  return data
}
const one = data => (Array.isArray(data) ? data[0] ?? null : data)
// Before 031 runs, the functions don't exist: treat that as "no trainer / no clients"
async function optional(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) return null
    throw new Error(error.message || 'Something went wrong')
  }
  return data
}

export const trainerLink = code => `${window.location.origin}/trainer/${code}`
export const TRAINER_PATH = /^\/trainer\/([a-z0-9]{6,16})\/?$/i

// The invite survives sign-up, like friend and swim team invites
const KEY = 'athrion_trainer_invite'
export const rememberTrainerInvite = code => { try { localStorage.setItem(KEY, code) } catch { /* convenience */ } }
export const readTrainerInvite = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const clearTrainerInvite = () => { try { localStorage.removeItem(KEY) } catch { /* convenience */ } }

// ── Coach ──
export const fetchClientCode = async () => must(await supabase.rpc('my_client_code'))
export const newClientCode = async () => must(await supabase.rpc('new_client_code'))
export const fetchClients = async () => (await optional('my_clients')) ?? []
export const fetchClientWorkouts = async (id, limit = 30) => must(await supabase.rpc('client_workouts', { p_client: id, p_limit: limit })) ?? []
export const fetchClientWeights = async id => must(await supabase.rpc('client_weights', { p_client: id })) ?? []
export const removeClient = async id => must(await supabase.rpc('remove_client', { p_client: id }))

export async function fetchAssignmentsFor(clientId) {
  return must(await supabase.from('coach_assignments').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(30)) ?? []
}
export async function assignWorkout(clientId, { title, day = null, note = '', exercises }) {
  const { data: { user } } = await supabase.auth.getUser()
  return must(await supabase.from('coach_assignments')
    .insert({ coach_id: user.id, client_id: clientId, title: title.trim(), day: day || null, note: note.trim(), exercises })
    .select().single())
}
export const deleteAssignment = async id => must(await supabase.from('coach_assignments').delete().eq('id', id))

// ── Client ──
export const trainerByCode = async code => one(must(await supabase.rpc('trainer_by_code', { p_code: code })))
export const joinTrainer = async code => must(await supabase.rpc('join_trainer', { p_code: code }))
export const fetchMyTrainer = async () => one(await optional('my_trainer'))
export const leaveTrainer = async () => must(await supabase.rpc('leave_trainer'))
export const finishAssignment = async id => must(await supabase.rpc('finish_assignment', { p_id: id }))

// Assigned workouts not done yet, the ones for today or with no day first
export async function fetchMyAssignments() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('coach_assignments').select('*')
    .eq('client_id', user.id).is('done_at', null).order('created_at', { ascending: false }).limit(10)
  if (error) return [] // before 031 runs
  return data ?? []
}

// The assignment Train starts from, kept on the device until the workout is saved
const RUN_KEY = 'athrion_assignment'
export const markAssignmentStarted = id => { try { id ? localStorage.setItem(RUN_KEY, id) : localStorage.removeItem(RUN_KEY) } catch { /* convenience */ } }
export const takeStartedAssignment = () => {
  try { const id = localStorage.getItem(RUN_KEY); localStorage.removeItem(RUN_KEY); return id } catch { return null }
}
