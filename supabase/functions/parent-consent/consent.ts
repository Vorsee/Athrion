// Parent approval for 13 to 15 year olds (032): the rules, kept apart from Deno so Vitest can
// test them. index.ts does the requests, the database and the email.

export const MIN_AGE = 13
export const ADULT_AGE = 16
export const MAX_SENDS_A_DAY = 3
export const RESEND_GAP_MS = 60_000
// Keep equal to LEGAL_VERSION in src/lib/legal.js (a test checks)
export const LEGAL_VERSION = '2026-10-26'

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i
export const validEmail = (s: unknown) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s.trim())

// The day they turn 16, roughly: today plus the years left (age is all we ask)
export function adultOn(age: number, today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear() + (ADULT_AGE - age), today.getUTCMonth(), today.getUTCDate()))
  return d.toISOString().slice(0, 10)
}

// Whether another email may go now: at most 3 a day, a minute apart
export function canSend(row: { sends?: number, last_sent_at?: string | null } | null, now = Date.now()) {
  if (!row?.last_sent_at) return { ok: true, sends: 1 }
  const last = Date.parse(row.last_sent_at)
  if (now - last < RESEND_GAP_MS) return { ok: false, reason: 'Wait a minute before sending again.' }
  const sends = now - last > 864e5 ? 0 : row.sends ?? 0
  if (sends >= MAX_SENDS_A_DAY) return { ok: false, reason: 'That\'s 3 emails today. Try again tomorrow.' }
  return { ok: true, sends: sends + 1 }
}

export function newToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('')
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// The email to the parent: plain, what it is, one link, no tracking
export function consentEmail({ childName, link }: { childName: string, link: string }) {
  const name = esc(childName || 'Your child')
  const subject = `${childName || 'Your child'} asked to use ATHRION`
  const text = [
    `${childName || 'Your child'} signed up for ATHRION, a fitness app for workouts, swimming, running and food, and gave your email as their parent or guardian.`,
    'Because they are under 16, they can only use it once you approve. You will see what we collect and what is switched off for them.',
    `Approve or decline: ${link}`,
    'If you don\'t know about this, ignore this email and the account stays locked.',
    'ATHRION · Athrion LLC · athrionsportapp@gmail.com',
  ].join('\n\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1C1917;max-width:520px">
<p><strong>${name}</strong> signed up for ATHRION, a fitness app for workouts, swimming, running and food, and gave your email as their parent or guardian.</p>
<p>Because they are under 16, they can only use it once you approve. You will see what we collect and what is switched off for them.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#C8F135;color:#1C1917;font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none">Review and decide</a></p>
<p style="color:#57534E;font-size:14px">If you don't know about this, ignore this email and the account stays locked.<br>ATHRION · Athrion LLC · athrionsportapp@gmail.com</p>
</div>`
  return { subject, text, html }
}
