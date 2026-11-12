// Room sets logged without signal: queued on the phone, sent in order, stored once (035)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))

import { queueSet, loadQueued, flushQueued, pendingRow, isNetworkError, newClientId } from '../../src/lib/roomQueue.js'
import { mergeSets } from '../../src/lib/groupStandings.js'
import * as group from '../../src/lib/groupApi.js'

const set = (n, sessionId = 's1') => ({ sessionId, displayName: 'Sam', exercise: 'Squat', setNum: n, weight: 100, reps: 5, clientId: `c${n}`, loggedAt: `2026-11-12T10:0${n}:00.000Z` })
const offline = Object.assign(new Error('TypeError: Failed to fetch'), { code: '' })

beforeEach(() => { localStorage.clear(); sb.reset() })

describe('roomQueue', () => {
  it('keeps queued sets per room and gives each set its own id', () => {
    queueSet(set(1)); queueSet(set(2, 's2')); queueSet(set(1)) // the same set twice is kept once
    expect(loadQueued('s1').map(s => s.clientId)).toEqual(['c1'])
    expect(loadQueued()).toHaveLength(2)
    expect(newClientId()).not.toEqual(newClientId())
  })

  it('sends oldest first and stops at the first set without signal, so order holds', async () => {
    queueSet(set(1)); queueSet(set(2)); queueSet(set(3))
    const sent = []
    const send = vi.fn(async s => { if (s.setNum === 2) throw offline; sent.push(s.setNum); return { id: s.clientId } })
    expect(await flushQueued('s1', send)).toEqual([{ id: 'c1' }])
    expect(sent).toEqual([1])
    expect(loadQueued('s1').map(s => s.setNum)).toEqual([2, 3])
  })

  it('drops a set the server refuses and keeps going', async () => {
    queueSet(set(1)); queueSet(set(2))
    const send = vi.fn(async s => { if (s.setNum === 1) throw Object.assign(new Error('denied'), { code: '42501' }); return { id: s.clientId } })
    expect(await flushQueued('s1', send)).toEqual([{ id: 'c2' }])
    expect(loadQueued()).toEqual([])
  })

  it('tells no signal apart from a refusal', () => {
    expect(isNetworkError(offline)).toBe(true)
    expect(isNetworkError({ code: '42501', message: 'denied' })).toBe(false)
  })

  it('shows a queued set as pending until the server row with its client_id arrives', () => {
    const local = pendingRow(set(1), 'u1')
    expect(local).toMatchObject({ pending: true, user_id: 'u1', set_num: 1, client_id: 'c1' })
    const rows = mergeSets([local], [])
    expect(rows).toHaveLength(1)
    const server = { id: 'r1', client_id: 'c1', user_id: 'u1', logged_at: local.logged_at }
    expect(mergeSets(rows, [server])).toEqual([server])
  })
})

describe('logGroupSet with a client id', () => {
  it('sends the id and the time it was logged', async () => {
    sb.set('group_sets', { data: { id: 'r1' }, error: null })
    await group.logGroupSet(set(1))
    expect(sb.op(sb.queriesFor('group_sets').at(-1), 'insert')[0]).toMatchObject({ client_id: 'c1', logged_at: set(1).loggedAt, set_num: 1 })
  })

  it('treats a set already stored as sent', async () => {
    sb.set('group_sets', { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "group_sets_client_id"' } })
    await expect(group.logGroupSet(set(1))).resolves.toBeNull()
  })

  it('sends without the id before 035', async () => {
    let calls = 0
    sb.set('group_sets', () => (++calls === 1
      ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'client_id' column of 'group_sets' in the schema cache" } }
      : { data: { id: 'r1' }, error: null }))
    expect(await group.logGroupSet(set(1))).toEqual({ id: 'r1' })
    const row = sb.op(sb.queriesFor('group_sets').at(-1), 'insert')[0]
    expect(row).not.toHaveProperty('client_id')
    expect(row).not.toHaveProperty('logged_at')
  })
})
