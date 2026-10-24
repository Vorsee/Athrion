import { supabase } from './supabase.js'

// plan is 'monthly' or 'annual'; the server picks the Stripe price
export async function createCheckoutSession(plan = 'monthly') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not logged in')

  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ plan }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Checkout session failed')

  window.location.href = data.url
}

export async function cancelSubscription() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not logged in')

  const res = await fetch('/api/cancel-subscription', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Cancellation failed')
  return data // { success, cancel_at, period_end }
}
