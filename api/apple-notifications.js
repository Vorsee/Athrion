// App Store Server Notifications V2: renewals, expiry, refunds, cancelled auto-renew. Set this
// URL (https://athrion.app/api/apple-notifications) for both Production and Sandbox in App Store
// Connect → the app → App Information. Apple signs every payload; anything that doesn't verify
// is refused. The person is found by the purchase's appAccountToken (their user id) or, failing
// that, the original transaction id saved at purchase.
import { supabase, verifier, applyTransaction, readJson } from './_apple.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  let body
  try { body = await readJson(req) } catch { return res.status(400).end() }
  if (typeof body.signedPayload !== 'string') return res.status(400).end()

  let note, env
  for (const e of ['Production', 'Sandbox']) {
    try { note = await (await verifier(e)).verifyAndDecodeNotification(body.signedPayload); env = e; break } catch { /* try the other */ }
  }
  if (!note) return res.status(400).end()

  const signed = note.data?.signedTransactionInfo
  if (!signed) return res.status(200).end() // e.g. a TEST notification
  let tx
  try { tx = await (await verifier(env)).verifyAndDecodeTransaction(signed) } catch { return res.status(400).end() }

  let userId = tx.appAccountToken?.toLowerCase() ?? null
  if (!userId) {
    const { data } = await supabase.from('subscriptions').select('user_id').eq('apple_original_transaction_id', String(tx.originalTransactionId)).maybeSingle()
    userId = data?.user_id ?? null
  }
  if (!userId) {
    console.log('[apple] notification for an unknown purchase', note.notificationType, tx.originalTransactionId)
    return res.status(200).end()
  }

  try {
    // REFUND / REVOKE carry revocationDate, EXPIRED an expiresDate in the past: both end Pro
    await applyTransaction(userId, tx, env)
    return res.status(200).end()
  } catch (e) {
    console.error('[apple] notification save failed', note.notificationType, e?.message)
    return res.status(500).end() // Apple retries
  }
}
