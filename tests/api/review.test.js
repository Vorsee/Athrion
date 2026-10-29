// The landing page review form (api/review.js, 022)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => sb.supabase) }))

function req(body, ip = '1.2.3.4') {
  const raw = JSON.stringify(body)
  return { method: 'POST', headers: { 'x-forwarded-for': ip }, async *[Symbol.asyncIterator]() { yield Buffer.from(raw) } }
}
function res() {
  const r = { statusCode: 200, body: undefined, headers: {} }
  r.status = vi.fn(c => { r.statusCode = c; return r })
  r.json = vi.fn(b => { r.body = b; return r })
  r.end = vi.fn(b => { r.body = b; return r })
  r.setHeader = vi.fn((k, v) => { r.headers[k] = v })
  return r
}

let mod
beforeEach(async () => {
  sb.reset()
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  mod = await import('../../api/review.js')
})

describe('readReview', () => {
  it('accepts a real review and trims it', () => {
    expect(mod.readReview({ name: '  Maya ', rating: 5, body: 'Great plan, love the meal plan.' }))
      .toEqual({ name: 'Maya', rating: 5, body: 'Great plan, love the meal plan.' })
  })
  it('refuses empty, out-of-range, too short and link-filled reviews, and flags bots', () => {
    expect(mod.readReview({ name: '', rating: 5, body: 'long enough text' }).error).toMatch(/name/)
    expect(mod.readReview({ name: 'A', rating: 6, body: 'long enough text' }).error).toMatch(/stars/)
    expect(mod.readReview({ name: 'A', rating: 3, body: 'short' }).error).toMatch(/10/)
    expect(mod.readReview({ name: 'A', rating: 3, body: 'visit https://spam.example now' }).error).toMatch(/links/)
    expect(mod.readReview({ name: 'A', rating: 3, body: 'long enough text', website: 'x' }).error).toBe('spam')
  })
})

describe('POST /api/review', () => {
  it('saves a review hidden, without an account, with a hashed address', async () => {
    const r = res()
    await mod.default(req({ name: 'Maya', rating: 5, body: 'Great plan, love the meal plan.' }), r)
    expect(r.statusCode).toBe(200)
    const insert = sb.op(sb.queriesFor('app_reviews').find(q => sb.op(q, 'insert')), 'insert')[0]
    expect(insert).toMatchObject({ name: 'Maya', rating: 5, user_id: null, hidden: true })
    expect(insert.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(insert)).not.toContain('1.2.3.4')
  })
  it('answers bots with a quiet yes and saves nothing', async () => {
    const r = res()
    await mod.default(req({ name: 'Bot', rating: 5, body: 'buy cheap things here', website: 'x' }), r)
    expect(r.statusCode).toBe(200)
    expect(sb.queriesFor('app_reviews').some(q => sb.op(q, 'insert'))).toBe(false)
  })
  it('turns away a bad review with the reason', async () => {
    const r = res()
    await mod.default(req({ name: 'A', rating: 0, body: 'long enough text' }), r)
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/stars/)
  })
})
