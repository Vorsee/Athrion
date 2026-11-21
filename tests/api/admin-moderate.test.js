// Bans from the moderation screen (api/admin-moderate.js, 047)
import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = []
let isAdmin = true
const client = {
  auth: {
    getUser: vi.fn(async t => t === 'good' ? { data: { user: { id: 'admin-1' } } } : { data: {}, error: { message: 'bad' } }),
    admin: { updateUserById: vi.fn(async (id, o) => { calls.push(['ban', id, o.ban_duration]); return {} }) },
  },
  from: vi.fn(table => {
    const q = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: table === 'app_admins' ? (isAdmin ? { user_id: 'admin-1' } : null) : { reported: 'bad-user' } }) }
    return q
  }),
  rpc: vi.fn(async (fn, args) => { calls.push([fn, args]); return {} }),
}
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => client) }))

const req = (body, token = 'good') => ({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body })
function res() {
  const r = { statusCode: 200 }
  r.status = vi.fn(c => { r.statusCode = c; return r })
  r.json = vi.fn(b => { r.body = b; return r })
  r.end = vi.fn(() => r)
  return r
}

let mod
beforeEach(async () => { calls.length = 0; isAdmin = true; mod = await import('../../api/admin-moderate.js') })

describe('POST /api/admin-moderate', () => {
  it('refuses a bad token and non-admins', async () => {
    let r = res(); await mod.default(req({ action: 'ban', report_id: 'r1' }, 'nope'), r); expect(r.statusCode).toBe(401)
    isAdmin = false
    r = res(); await mod.default(req({ action: 'ban', report_id: 'r1' }), r); expect(r.statusCode).toBe(403)
    expect(calls).toEqual([])
  })
  it('bans: resolves the report and locks the login', async () => {
    const r = res(); await mod.default(req({ action: 'ban', report_id: 'r1' }), r)
    expect(r.statusCode).toBe(200)
    expect(calls).toEqual([['admin_resolve_report', { p_id: 'r1', p_action: 'ban' }], ['ban', 'bad-user', '876000h']])
  })
  it('unbans', async () => {
    const r = res(); await mod.default(req({ action: 'unban', user_id: 'bad-user' }), r)
    expect(r.statusCode).toBe(200)
    expect(calls).toEqual([['admin_unban', { p_user: 'bad-user' }], ['ban', 'bad-user', 'none']])
  })
  it('turns away unknown actions', async () => {
    const r = res(); await mod.default(req({ action: 'nuke' }), r); expect(r.statusCode).toBe(400)
  })
})
