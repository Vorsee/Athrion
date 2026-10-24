import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
const push = vi.hoisted(() => ({ disablePush: vi.fn(async () => {}) }))
vi.mock('../../src/lib/push.js', () => push)

import { signOut } from '../../src/lib/session.js'

beforeEach(() => { sb.reset(); push.disablePush.mockClear() })

describe('signOut', () => {
  it('removes this device\'s push subscription before signing out, and clears per-user state', async () => {
    const order = []
    push.disablePush.mockImplementation(async () => order.push('push'))
    sb.supabase.auth.signOut.mockImplementation(async () => order.push('signOut'))
    for (const k of ['athrion_workout', 'athrion_rest_end', 'athrion_group_session_state', 'athrion_group_rest_end']) localStorage.setItem(k, 'x')
    localStorage.setItem('athrion_theme', 'light')
    await signOut()
    expect(order).toEqual(['push', 'signOut'])
    expect(localStorage.getItem('athrion_workout')).toBeNull()
    expect(localStorage.getItem('athrion_group_session_state')).toBeNull()
    expect(localStorage.getItem('athrion_theme')).toBe('light') // device preference stays
  })
  it('still signs out when removing push fails', async () => {
    push.disablePush.mockRejectedValueOnce(new Error('offline'))
    await signOut()
    expect(sb.supabase.auth.signOut).toHaveBeenCalled()
  })
})
