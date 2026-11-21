import { importPKCS8, SignJWT } from "npm:jose@5.9.6"

// Apple Push Notification service, for the iPhone app (tokens in apns_tokens, 041).
// Secrets: APNS_KEY (the .p8 file's text), APNS_KEY_ID, APNS_TEAM_ID. Without them every
// send is skipped, so the web push keeps working on its own.

const KEY = Deno.env.get('APNS_KEY')
const KEY_ID = Deno.env.get('APNS_KEY_ID')
const TEAM_ID = Deno.env.get('APNS_TEAM_ID')
export const apnsConfigured = !!(KEY && KEY_ID && TEAM_ID)

// Apple wants one token reused for up to an hour, and refuses new ones more often than every 20 min
let cached: { jwt: string, at: number } | null = null
async function providerToken() {
  if (cached && Date.now() - cached.at < 50 * 60000) return cached.jwt
  const pem = KEY!.includes('BEGIN') ? KEY! : `-----BEGIN PRIVATE KEY-----\n${KEY}\n-----END PRIVATE KEY-----`
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256')
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: KEY_ID! })
    .setIssuer(TEAM_ID!).setIssuedAt().sign(key)
  cached = { jwt, at: Date.now() }
  return jwt
}

// Tokens Apple says are gone for good
const DEAD = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken'])

export type ApnsRow = { token: string, environment: string, bundle_id: string }
export type ApnsMessage = { title: string, body?: string, tag?: string, url?: string }

// A buzz: only a sound, so the phone vibrates and nothing shows (a reaction in a room)
export function sendBuzz(row: ApnsRow) {
  return post(row, { aps: { sound: 'default' }, kind: 'reaction' }, 60)
}

// → 'sent' | 'dead' | 'failed'
export async function sendApns(row: ApnsRow, message: ApnsMessage, ttlSeconds: number) {
  const payload = {
    aps: {
      alert: { title: message.title, body: message.body ?? '' },
      sound: 'default',
      ...(message.tag ? { 'thread-id': message.tag } : {}),
    },
    url: message.url ?? '/',
    kind: message.tag ?? '',
  }
  return post(row, payload, ttlSeconds)
}

async function post(row: ApnsRow, payload: unknown, ttlSeconds: number) {
  if (!apnsConfigured) return 'failed'
  const host = row.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  try {
    const res = await fetch(`https://${host}/3/device/${row.token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await providerToken()}`,
        'apns-topic': row.bundle_id,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + ttlSeconds),
      },
      body: JSON.stringify(payload),
    })
    if (res.ok) return 'sent'
    const reason = (await res.json().catch(() => ({})))?.reason
    if (res.status === 410 || DEAD.has(reason)) return 'dead'
    if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') cached = null
    console.error('apns failed', res.status, reason)
    return 'failed'
  } catch (e: any) {
    console.error('apns error', e?.message ?? e)
    return 'failed'
  }
}
