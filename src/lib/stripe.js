import { supabase } from './supabase.js'

const PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID

export async function createCheckoutSession() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  if (!PRICE_ID) throw new Error('Stripe price ID not configured (VITE_STRIPE_PRICE_ID)')

  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, price_id: PRICE_ID }),
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
