import { supabase } from './supabase.js'

// TODO: Replace with your Stripe Price ID from the Stripe Dashboard
export const PRICE_ID = 'price_REPLACE_ME'

// Called when user taps "Upgrade to Pro"
// Uncomment the body below once you've:
//   1. Created a Stripe product + price ($5.99/mo recurring)
//   2. Deployed the Supabase edge function `create-checkout` (see /supabase/functions/)
export async function createCheckoutSession() {
  // const { data, error } = await supabase.functions.invoke('create-checkout', {
  //   body: {
  //     price_id:    PRICE_ID,
  //     success_url: `${window.location.origin}?upgraded=1`,
  //     cancel_url:  window.location.origin,
  //   },
  // })
  // if (error) throw error
  // window.location.href = data.url

  alert('Stripe not wired up yet — add your PRICE_ID and deploy the edge function in src/lib/stripe.js')
}
