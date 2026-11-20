// Shared by apple-subscription.js and apple-notifications.js: checks that a signed transaction
// really comes from the App Store (Apple's certificate chain, our bundle id), and writes the
// Pro row it means. Env: APPLE_BUNDLE_ID (app.athrion), APPLE_APP_ID (the numeric App
// Store id, needed for Production), APPLE_ENVIRONMENT ('Production' or 'Sandbox').
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Product ids, as set up in App Store Connect; keep equal to Store.swift
export const APPLE_PRODUCTS = { 'athrion.pro.monthly': 'pro', 'athrion.pro.annual': 'pro' }

// Apple's root certificates are public; fetched once per cold start
const ROOTS = ['https://www.apple.com/certificateauthority/AppleRootCA-G3.cer', 'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer']
let roots = null
async function appleRoots() {
  if (!roots) roots = await Promise.all(ROOTS.map(async u => Buffer.from(await (await fetch(u)).arrayBuffer())))
  return roots
}

const verifiers = {}
export async function verifier(env) {
  const key = env === 'Sandbox' ? 'Sandbox' : 'Production'
  if (!verifiers[key]) {
    verifiers[key] = new SignedDataVerifier(
      await appleRoots(), true,
      key === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION,
      process.env.APPLE_BUNDLE_ID,
      key === 'Production' ? Number(process.env.APPLE_APP_ID) : undefined,
    )
  }
  return verifiers[key]
}

// Sandbox purchases (TestFlight, Xcode) and live ones both arrive; try the live chain first
export async function verifyTransaction(jws) {
  const order = process.env.APPLE_ENVIRONMENT === 'Sandbox' ? ['Sandbox', 'Production'] : ['Production', 'Sandbox']
  let last
  for (const env of order) {
    try { return { tx: await (await verifier(env)).verifyAndDecodeTransaction(jws), env } } catch (e) { last = e }
  }
  throw last
}

// A transaction → the subscriptions row. Active while it hasn't expired or been revoked.
export async function applyTransaction(userId, tx, env) {
  if (!APPLE_PRODUCTS[tx.productId]) throw new Error('Unknown product')
  const expires = tx.expiresDate ? new Date(tx.expiresDate) : null
  const active = !tx.revocationDate && (!expires || expires > new Date())
  const { data: row } = await supabase.from('subscriptions').select('status, provider, stripe_subscription_id').eq('user_id', userId).maybeSingle()
  // Paying through Stripe already: leave that row alone, just remember the Apple one
  const stripeLive = row?.provider !== 'apple' && row?.status === 'pro' && row?.stripe_subscription_id
  const fields = {
    user_id: userId,
    apple_original_transaction_id: String(tx.originalTransactionId),
    apple_product_id: tx.productId,
    apple_expires_at: expires?.toISOString() ?? null,
    apple_environment: env,
    updated_at: new Date().toISOString(),
    ...(stripeLive ? {} : { provider: 'apple', status: active ? 'pro' : 'free', tier: APPLE_PRODUCTS[tx.productId] }),
  }
  const { error } = await supabase.from('subscriptions').upsert(fields, { onConflict: 'user_id' })
  if (error) throw error
  return { active }
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
