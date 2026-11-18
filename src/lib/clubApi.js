import { supabase } from './supabase.js'

// Clubs (039): up to 50 people with their own monthly board. Made on the coach and club plan,
// joined free with the invite link /club/<code>. Every read and write goes through the 039
// functions; before 039 runs they're missing, and `clubsMissing` tells the UI to stay quiet.

export const CLUB_PATH = /^\/club\/([a-z0-9]{8})\/?$/i
const KEY = 'athrion_club_invite'

export const clubUrl = code => `${window.location.origin}/club/${code}`
export const clubShareText = name => `Join ${name} on ATHRION: we race each other on our own monthly board.`

export const clubsMissing = e => ['PGRST202', '42883', 'PGRST205', '42P01'].includes(e?.code)

// Kept through sign-up, as room and swim links are
export function rememberClubInvite(code) { try { localStorage.setItem(KEY, code.toLowerCase()) } catch {} }
export function readClubInvite() { try { return localStorage.getItem(KEY) } catch { return null } }
export function clearClubInvite() { try { localStorage.removeItem(KEY) } catch {} }

const ERRORS = {
  P0002: 'That club doesn\'t exist any more.',
  P0004: 'This club is full: 50 people already.',
  P0006: 'Clubs open when you turn 16.',
  P0007: 'Clubs come with the coach and club plan.',
}
function clubError(e) {
  const err = new Error(ERRORS[e?.code] || e?.message || 'Something went wrong')
  err.code = e?.code
  return err
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw clubError(error)
  return data
}

export const fetchMyClubs = () => rpc('my_clubs').then(r => r ?? [])
export const createClub = name => rpc('create_club', { p_name: name.trim() }).then(r => (Array.isArray(r) ? r[0] : r))
export const previewClub = code => rpc('club_preview', { p_code: code }).then(r => (Array.isArray(r) ? r[0] : r) ?? null)
export const joinClub = code => rpc('join_club', { p_code: code }).then(r => (Array.isArray(r) ? r[0] : r))
export const leaveClub = id => rpc('leave_club', { p_club: id })
export const deleteClub = id => rpc('delete_club', { p_club: id })
export const removeClubMember = (id, nickname) => rpc('remove_club_member', { p_club: id, p_nickname: nickname })
export const fetchClubBoard = id => rpc('club_board', { p_club: id }).then(r => r ?? [])
