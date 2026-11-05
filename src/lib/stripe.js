import { supabase } from './supabase.js'

// A token that is good for at least another minute. A tab that slept in the background
// can still hold an expired one, which the payment routes reject as "Invalid token".
async function freshToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not logged in')
  if (session.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
    const { data } = await supabase.auth.refreshSession()
    if (data?.session?.access_token) return data.session.access_token
  }
  return session.access_token
}

// POST to one of our api/ routes as the signed-in user; on a 401, renew the token once and retry
export async function postAsUser(path, body) {
  const send = token => fetch(path, {
    method: 'POST',
    headers: { ...(body && { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}` },
    ...(body && { body: JSON.stringify(body) }),
  })
  let res = await send(await freshToken())
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession()
    if (!data?.session?.access_token) throw new Error('Your sign-in expired. Sign in again and retry.')
    res = await send(data.session.access_token)
    if (res.status === 401) throw new Error('Your sign-in expired. Sign in again and retry.')
  }
  return { res, data: await readReply(res) }
}

// Our routes answer JSON. Anything else (a crashed function's plain-text error, or the app's own
// page when the route isn't there, as on `npm run dev`, which doesn't run api/) would make
// res.json() throw Safari's "The string did not match the expected pattern", so say what happened.
async function readReply(res) {
  if (typeof res.text !== 'function') return res.json() // a bare test double
  const text = await res.text().catch(() => '')
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    const local = typeof location !== 'undefined' && /^(localhost|127\.|192\.168\.)/.test(location.hostname)
    throw new Error(local
      ? "Payments only work on athrion.app: the local dev server doesn't run the payment routes."
      : `The payment server didn't answer properly (error ${res.status}). Try again in a minute.`)
  }
}

// plan is 'monthly' or 'annual'; the server picks the Stripe price
export async function createCheckoutSession(plan = 'monthly') {
  const { res, data } = await postAsUser('/api/create-checkout', { plan })
  if (!res.ok) throw new Error(data.error || 'Checkout session failed')
  window.location.href = data.url
}

// action: 'cancel' (at period end), 'resume' (undo a cancel) or 'status'.
// Returns { status, cancelled, cancel_at, period_end } straight from Stripe.
async function manageSubscription(action, failMsg) {
  const { res, data } = await postAsUser('/api/cancel-subscription', { action })
  if (!res.ok) throw new Error(data.error || failMsg)
  return data
}

export const cancelSubscription = () => manageSubscription('cancel', 'Cancellation failed')
export const resumeSubscription = () => manageSubscription('resume', 'Could not renew the subscription')
export const fetchSubscriptionDetails = () => manageSubscription('status', 'Could not load your subscription')
