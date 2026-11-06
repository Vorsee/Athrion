// Accounts for 13 to 15 year olds (032): a parent approves by email. The teen's side reads the
// status and asks for the email; the parent's page (/parent/<token>) views and decides. The
// parent-consent Edge Function sends the email and records the answer.
import { supabase } from './supabase.js'

export const MIN_AGE = 13
export const ADULT_AGE = 16
export const PARENT_PATH = /^\/parent\/([A-Za-z0-9_-]{20,})\/?$/

// null: no record (16 or over, or before 032 runs); else { status, parent_email, minor, ... }
export async function fetchParentalConsent() {
  const { data, error } = await supabase.rpc('my_parental_consent')
  if (error) return null
  return (Array.isArray(data) ? data[0] : data) ?? null
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('parent-consent', { body })
  if (error) {
    let message = error.message
    try { message = (await error.context?.json())?.error?.message || message } catch { /* keep the generic one */ }
    throw new Error(message || 'Something went wrong')
  }
  return data
}
export const requestParentConsent = (age, parentEmail) => call({ action: 'request', age, parentEmail })
export const viewConsent = token => call({ action: 'view', token })
export const decideConsent = (token, approve) => call({ action: approve ? 'approve' : 'decline', token, agree: approve })

// What a teen's account can't do until 16 (the server enforces each)
export const MINOR_LIMITS = [
  'Not on the public Everyone board or in its monthly prize',
  'No friends or Train together rooms',
  'No purchases: no Pro subscription and no coach shop',
]
