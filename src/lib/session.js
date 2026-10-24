import { supabase } from './supabase.js'
import { disablePush } from './push.js'

// Per-user state kept on the device; cleared on sign out so the next person doesn't see it
const USER_KEYS = ['athrion_workout', 'athrion_rest_end', 'athrion_group_session_state', 'athrion_group_rest_end', 'athrion_session']

export async function signOut() {
  // Stop this device getting the signed-out user's reminders (needs the session, so first)
  await disablePush().catch(() => {})
  for (const k of USER_KEYS) localStorage.removeItem(k)
  await supabase.auth.signOut()
}
