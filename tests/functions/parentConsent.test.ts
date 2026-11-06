// Parent approval for 13 to 15 year olds (032): the Edge Function's rules
import { describe, it, expect } from 'vitest'
import { validEmail, adultOn, canSend, newToken, hashToken, consentEmail, LEGAL_VERSION } from '../../supabase/functions/parent-consent/consent.ts'
import { LEGAL_VERSION as APP_LEGAL } from '../../src/lib/legal.js'

describe('parent consent', () => {
  it('keeps the legal version equal to the app', () => expect(LEGAL_VERSION).toBe(APP_LEGAL))
  it('checks email addresses', () => {
    expect(validEmail('mom@example.com')).toBe(true)
    expect(validEmail('nope')).toBe(false)
    expect(validEmail('a@b')).toBe(false)
  })
  it('works out the day they turn 16', () => {
    expect(adultOn(14, new Date('2026-11-05T12:00:00Z'))).toBe('2028-11-05')
    expect(adultOn(13, new Date('2026-02-01T12:00:00Z'))).toBe('2029-02-01')
  })
  it('sends at most 3 emails a day, a minute apart', () => {
    const now = Date.parse('2026-11-05T12:00:00Z')
    expect(canSend(null, now)).toEqual({ ok: true, sends: 1 })
    expect(canSend({ sends: 1, last_sent_at: '2026-11-05T11:59:30Z' }, now).ok).toBe(false)
    expect(canSend({ sends: 2, last_sent_at: '2026-11-05T11:00:00Z' }, now)).toEqual({ ok: true, sends: 3 })
    expect(canSend({ sends: 3, last_sent_at: '2026-11-05T11:00:00Z' }, now).ok).toBe(false)
    expect(canSend({ sends: 3, last_sent_at: '2026-11-04T10:00:00Z' }, now)).toEqual({ ok: true, sends: 1 })
  })
  it('makes long random tokens and stores only their hash', async () => {
    const t = newToken()
    expect(t.length).toBeGreaterThanOrEqual(40)
    expect(newToken()).not.toBe(t)
    expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
  it('writes the email with the link and no markup from the name', () => {
    const e = consentEmail({ childName: '<b>Mia</b>', link: 'https://athrion.app/parent/abc' })
    expect(e.html).toContain('https://athrion.app/parent/abc')
    expect(e.html).not.toContain('<b>Mia</b>')
    expect(e.text).toContain('Approve or decline: https://athrion.app/parent/abc')
  })
})
