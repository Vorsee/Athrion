// Room links: athrion.app/r/<code>. Signed out they open a preview of the room (who invited
// you, the workout, how many are in); the code is kept on the phone and in the new account's
// metadata, so the first screen after sign-up (even on another device) is the room.
import { supabase } from './supabase.js'

export const ROOM_PATH = /^\/r\/([A-Za-z0-9]{6})\/?$/
const KEY = 'athrion_room_link'
const KEEP_MS = 12 * 3600 * 1000 // a room ends 12 hours after its last activity (034)

export const roomUrl = code => `${window.location.origin}/r/${code}`

// The words that go with a shared room link
export const roomShareText = code => `Train with me on ATHRION, live. Join with code ${code}`

export function parseRoomPath(pathname) {
  const m = ROOM_PATH.exec(pathname || '')
  return m ? m[1].toUpperCase() : null
}

export function rememberRoomLink(code) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch {}
}

// The remembered code, from this phone or else the account (signed up from the link elsewhere)
export function readRoomLink(user) {
  const fresh = r => r?.code && /^[A-Z0-9]{6}$/.test(r.code) && Date.now() - (r.at || 0) < KEEP_MS ? r.code : null
  let local = null
  try { local = JSON.parse(localStorage.getItem(KEY)) } catch {}
  const meta = user?.user_metadata
  return fresh(local) || fresh(meta?.room_code ? { code: meta.room_code, at: meta.room_at } : null)
}

// What sign-up adds to the new account, so the room opens wherever the email is confirmed
export function roomLinkMetadata() {
  const code = readRoomLink()
  return code ? { room_code: code, room_at: Date.now() } : {}
}

export function clearRoomLink(user) {
  try { localStorage.removeItem(KEY) } catch {}
  if (user?.user_metadata?.room_code) supabase.auth.updateUser({ data: { room_code: null, room_at: null } }).catch(() => {})
}

// The public preview of a room: { host, title, people, live } or null
export async function fetchRoomPreview(code) {
  try {
    const res = await fetch(`/api/room-preview?code=${encodeURIComponent(code)}`)
    if (res.status === 404) return { ended: true }
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}
