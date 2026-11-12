// Block and report (037). A block ends the friendship, keeps them out of your rooms and stops
// their friend requests; a report goes to every admin. Both work by account id.
import { supabase } from './supabase.js'

export const REPORT_REASONS = [
  ['abuse', 'Harassment or abuse'],
  ['inappropriate', 'Inappropriate name or behaviour'],
  ['spam', 'Spam or scam'],
  ['underage', 'Seems under 13'],
  ['other', 'Something else'],
]

// Before 037 runs the functions don't exist: say so plainly
const missing = e => e?.code === 'PGRST202' || /could not find the function/i.test(e?.message || '')
const fail = (e, what) => { throw new Error(missing(e) ? `${what} isn't available yet. Try again later.` : e.message || `Couldn't ${what.toLowerCase()}.`) }

// person: { id } (in a room) or { nickname } (from Friends)
export async function blockUser(person) {
  const { error } = person.id
    ? await supabase.rpc('block_user', { p_user: person.id })
    : await supabase.rpc('block_nickname', { p_nickname: person.nickname })
  if (error) fail(error, 'Blocking')
}

export async function unblockUser(userId) {
  const { error } = await supabase.rpc('unblock_user', { p_user: userId })
  if (error) fail(error, 'Unblocking')
}

// [{ user_id, nickname, created_at }], or [] before 037
export async function fetchBlocks() {
  const { data, error } = await supabase.rpc('my_blocks')
  if (error) { if (missing(error)) return []; throw error }
  return data || []
}

export async function reportUser(person, reason, details = '', sessionId = null) {
  const { error } = person.id
    ? await supabase.rpc('report_user', { p_user: person.id, p_reason: reason, p_details: details, p_session: sessionId })
    : await supabase.rpc('report_nickname', { p_nickname: person.nickname, p_reason: reason, p_details: details })
  if (error) fail(error, 'Reporting')
}
