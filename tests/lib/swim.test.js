import { describe, it, expect } from 'vitest'
import { strokeStats, strokeBoard, daysAgo, SWIM_INVITE_PATH, STROKES } from '../../src/lib/swim.js'

const swim = (id, stroke, date, distance_m, seconds) => ({ id, kind: 'swim', stroke, date, distance_m, seconds })

describe('strokeStats', () => {
  const logs = [
    swim('a', 'free', '2026-10-20', 1500, 1620),
    swim('b', 'free', '2026-10-25', 100, 82),
    swim('c', 'free', '2026-10-27', 20, 10),   // under a pool length: never a PR
    swim('d', 'fly', '2026-10-26', 200, 260),
    swim('e', null, '2026-10-28', 800, 900),   // before strokes existed
  ]
  const s = strokeStats(logs)
  it('finds the PR pace, longest and last swim per stroke', () => {
    expect(s.free.count).toBe(3)
    expect(s.free.pr.id).toBe('b')
    expect(s.free.longest.id).toBe('a')
    expect(s.free.last.id).toBe('c')
    expect(s.fly.pr.id).toBe('d')
    expect(s.back.count).toBe(0)
    expect(s.back.last).toBeNull()
  })
  it('counts swims without a stroke only in the total', () => {
    expect(s.all.count).toBe(5)
    expect(s.all.last.id).toBe('e')
    expect(STROKES.reduce((n, st) => n + s[st.id].count, 0)).toBe(4)
  })
})

describe('swim helpers', () => {
  it('says how long ago a swim was', () => {
    const now = new Date('2026-10-29T09:00:00')
    expect(daysAgo('2026-10-29', now)).toBe('today')
    expect(daysAgo('2026-10-28', now)).toBe('yesterday')
    expect(daysAgo('2026-10-24', now)).toBe('5 days ago')
    expect(daysAgo(null, now)).toBeNull()
  })
  it('reads team invite links', () => {
    expect('/swim/abc123defg'.match(SWIM_INVITE_PATH)?.[1]).toBe('abc123defg')
    expect(SWIM_INVITE_PATH.test('/swim/')).toBe(false)
    expect(SWIM_INVITE_PATH.test('/swim/../x')).toBe(false)
  })
})

describe('strokeBoard', () => {
  const roster = [
    { user_id: 'a', nickname: 'ann', status: 'active' },
    { user_id: 'b', nickname: 'bo', status: 'active' },
    { user_id: 'c', nickname: 'cy', status: 'pending' },
  ]
  const prs = [
    { user_id: 'a', stroke: 'free', distance_m: 100, seconds: 90, date: '2026-10-20' },
    { user_id: 'b', stroke: 'free', distance_m: 200, seconds: 160, date: '2026-10-21' },
    { user_id: 'c', stroke: 'free', distance_m: 100, seconds: 60, date: '2026-10-22' },
    { user_id: 'a', stroke: 'fly', distance_m: 50, seconds: 40, date: '2026-10-23' },
  ]
  it('ranks active swimmers by PR pace for one stroke', () => {
    const board = strokeBoard(prs, roster, 'free')
    expect(board.map(p => [p.place, p.swimmer.nickname])).toEqual([[1, 'bo'], [2, 'ann']])
    expect(board[0].perM).toBe(0.8)
  })
  it('is empty for a stroke nobody has swum', () => {
    expect(strokeBoard(prs, roster, 'back')).toEqual([])
  })
})

describe('swim polish (panel run 6)', () => {
  it('needs 50 m for a PR, so one 25 m sprint never stands as one', async () => {
    const s = strokeStats([swim('a', 'free', '2026-10-20', 25, 12), swim('b', 'free', '2026-10-21', 100, 80)])
    expect(s.free.pr.id).toBe('b')
  })
  it('shows practice sets with their unit and dryland on its own line, adding no distance', async () => {
    const { practiceLine, practiceTotals, mainStroke, PRACTICE_PARTS } = await import('../../src/lib/swim.js')
    expect(PRACTICE_PARTS[0][0]).toBe('dryland') // before the warm-up
    expect(practiceLine({ part: 'warmup', reps: 1, distance: 400, unit: 'm', stroke: 'free' })).toBe('400 m freestyle')
    expect(practiceLine({ part: 'main', reps: 8, distance: 100, unit: 'yd', stroke: 'back', send_off: '1:45' })).toBe('8 × 100 yd backstroke on 1:45')
    const dry = { part: 'dryland', name: 'Band pull-aparts', reps: 2, amount: '15' }
    expect(practiceLine(dry)).toBe('2 × 15 band pull-aparts')
    const items = [dry, { part: 'main', reps: 4, distance: 1000, unit: 'm', stroke: 'fly', send_off: '' }]
    expect(practiceTotals(items).distance).toBe(4000)
    expect(mainStroke(items)).toBe('fly')
  })
  it('names a swimmer the way they asked their coach to see them', async () => {
    const { swimmerName } = await import('../../src/lib/swim.js')
    expect(swimmerName({ display_name: 'Ana Ruiz', nickname: 'ana_swims' })).toBe('Ana Ruiz')
    expect(swimmerName({ display_name: '  ', nickname: 'ana_swims' })).toBe('@ana_swims')
    expect(swimmerName({})).toBe('Swimmer')
  })
})
