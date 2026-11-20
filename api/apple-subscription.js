// The iPhone app reports a purchase or a restore: { signedTransaction } (StoreKit 2's
// jwsRepresentation), with the person's Supabase token. The transaction must carry their user
// id as appAccountToken, which the app sets at purchase, so one Apple ID can't hand Pro to
// someone else's account.
import { supabase, verifyTransaction, applyTransaction, readJson } from './_apple.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  let body
  try { body = await readJson(req) } catch { return res.status(400).json({ error: 'Invalid JSON body' }) }
  if (typeof body.signedTransaction !== 'string') return res.status(400).json({ error: 'Missing signedTransaction' })

  let tx, env
  try { ({ tx, env } = await verifyTransaction(body.signedTransaction)) }
  catch (e) {
    console.error('[apple] verify failed', e?.message)
    return res.status(400).json({ error: "That purchase couldn't be checked with Apple." })
  }
  if (!tx.appAccountToken || tx.appAccountToken.toLowerCase() !== user.id.toLowerCase()) {
    return res.status(403).json({ error: 'This purchase belongs to another ATHRION account.' })
  }

  try {
    const { active } = await applyTransaction(user.id, tx, env)
    return res.status(200).json({ pro: active })
  } catch (e) {
    console.error('[apple] save failed', e?.message)
    return res.status(500).json({ error: "Couldn't save the subscription." })
  }
}
