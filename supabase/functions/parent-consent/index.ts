import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { MIN_AGE, ADULT_AGE, LEGAL_VERSION, validEmail, adultOn, canSend, newToken, hashToken, consentEmail } from "./consent.ts"

// Parent approval for 13 to 15 year olds (032). Deployed with --no-verify-jwt: the parent's
// actions (view, approve, decline) carry only the emailed token; `request` checks the teen's JWT.
// Secrets: RESEND_API_KEY, CONSENT_FROM (e.g. "ATHRION <consent@athrion.app>", a domain verified
// in Resend), SITE_URL (https://athrion.app).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ error: { message } }, status)

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function send(to: string, childName: string, token: string) {
  const site = Deno.env.get('SITE_URL') ?? 'https://athrion.app'
  const { subject, text, html } = consentEmail({ childName, link: `${site}/parent/${token}` })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('CONSENT_FROM') ?? 'ATHRION <consent@athrion.app>', to: [to], subject, text, html }),
  })
  if (!res.ok) throw new Error(`email ${res.status}: ${await res.text()}`)
}

async function byToken(db: any, token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null
  const { data } = await db.from('parental_consents').select('*').eq('token_hash', await hashToken(token)).maybeSingle()
  return data
}

async function childName(db: any, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId)
  const full = String(data?.user?.user_metadata?.full_name ?? '').trim()
  return full.split(/\s+/)[0] || 'Your child'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let body: any
  try { body = await req.json() } catch { return fail('Invalid JSON body') }
  const db = admin()

  try {
    // The teen asks: their age and a parent's email; a new link each time, the old one stops working
    if (body?.action === 'request') {
      const auth = req.headers.get('Authorization')
      if (!auth) return fail('Please sign in again.', 401)
      const { data: { user } } = await createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: auth } } }).auth.getUser()
      if (!user) return fail('Please sign in again.', 401)
      const age = Number(body.age)
      if (!Number.isInteger(age) || age < MIN_AGE || age >= ADULT_AGE) return fail(`This is for ages ${MIN_AGE} to ${ADULT_AGE - 1}.`)
      const email = String(body.parentEmail ?? '').trim().toLowerCase()
      if (!validEmail(email)) return fail('Enter your parent\'s email address.')
      if (email === String(user.email ?? '').toLowerCase()) return fail('Use your parent\'s email, not your own.')

      const { data: row } = await db.from('parental_consents').select('*').eq('user_id', user.id).maybeSingle()
      if (row?.status === 'approved') return json({ status: 'approved' })
      const gate = canSend(row)
      if (!gate.ok) return fail(gate.reason!, 429)

      const token = newToken()
      const fields = {
        user_id: user.id, parent_email: email, child_age: age, adult_on: row?.adult_on ?? adultOn(age),
        status: 'pending', token_hash: await hashToken(token), sends: gate.sends, last_sent_at: new Date().toISOString(),
      }
      const { error } = await db.from('parental_consents').upsert(fields, { onConflict: 'user_id' })
      if (error) throw error
      await send(email, await childName(db, user.id), token)
      return json({ status: 'pending' })
    }

    // The parent opens the link
    const row = await byToken(db, body?.token)
    if (!row) return fail('This link has expired or was replaced by a newer email.', 404)
    if (body?.action === 'view') {
      return json({ childName: await childName(db, row.user_id), childAge: row.child_age, status: row.status })
    }
    if (body?.action === 'approve' || body?.action === 'decline') {
      if (row.status !== 'pending') return json({ status: row.status })
      if (body.action === 'approve' && body.agree !== true) return fail('Tick the box to approve.')
      const status = body.action === 'approve' ? 'approved' : 'declined'
      const { error } = await db.from('parental_consents').update({
        status, decided_at: new Date().toISOString(), token_hash: null, ...(status === 'approved' && { legal_version: LEGAL_VERSION }),
      }).eq('user_id', row.user_id)
      if (error) throw error
      await db.from('notifications').insert({
        user_id: row.user_id, kind: status === 'approved' ? 'parent_approved' : 'parent_declined', push: true, url: '/',
        title: status === 'approved' ? 'Your parent approved your account' : 'Your parent didn\'t approve your account',
        body: status === 'approved' ? 'You can start using ATHRION.' : 'Your account stays locked. You can delete it in the app.',
      })
      return json({ status })
    }
    return fail('Unknown action')
  } catch (e) {
    console.error('[parent-consent]', (e as Error).message)
    return fail('Something went wrong. Try again in a minute.', 500)
  }
})
