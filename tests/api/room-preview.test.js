// The public preview behind a room link (api/room-preview.js, R2)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => sb.supabase) }))

function res() {
  const r = { statusCode: 200, body: undefined, headers: {} }
  r.status = vi.fn(c => { r.statusCode = c; return r })
  r.json = vi.fn(b => { r.body = b; return r })
  r.end = vi.fn(b => { r.body = b; return r })
  r.setHeader = vi.fn((k, v) => { r.headers[k] = v })
  return r
}
const get = async code => { const r = res(); await mod.default({ method: 'GET', query: { code } }, r); return r }

let mod
beforeEach(async () => {
  sb.reset()
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  mod = await import('../../api/room-preview.js')
})

describe('GET /api/room-preview', () => {
  it('shows who invited you, the workout and how many are in, nothing else', async () => {
    const now = new Date().toISOString()
    sb.set('group_sessions', { data: { id: 's1', host_id: 'u1', status: 'lobby', plan: [{ name: 'Squat' }, { name: 'Bench Press' }, { name: 'Row' }], created_at: now, last_activity_at: now }, error: null })
    sb.set('group_participants', { data: [{ user_id: 'u1', display_name: 'alex_fit' }, { user_id: 'u2', display_name: 'maya' }], error: null })
    const r = await get('k7m4qx')
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ host: 'alex_fit', title: 'Squat, Bench Press +1', people: 2, live: false })
    expect(sb.op(sb.queriesFor('group_sessions')[0], 'eq')).toEqual(['code', 'K7M4QX'])
  })
  it('says not found for a room quiet for 12 hours, a missing one or a bad code', async () => {
    const old = new Date(Date.now() - 13 * 3600e3).toISOString()
    sb.set('group_sessions', { data: { id: 's1', host_id: 'u1', status: 'active', plan: [], created_at: old, last_activity_at: old }, error: null })
    expect((await get('K7M4QX')).statusCode).toBe(404)
    sb.set('group_sessions', { data: null, error: null })
    expect((await get('K7M4QX')).statusCode).toBe(404)
    expect((await get('K7M')).statusCode).toBe(400)
  })
  it('names a free room', () => {
    expect(mod.roomTitle({ plan: [{ free: true, sets: [] }] })).toBe('Free workout')
    expect(mod.roomTitle({ plan: [], exercises: ['Squat'] })).toBe('Squat')
  })
})
