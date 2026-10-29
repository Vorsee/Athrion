import { describe, it, expect } from 'vitest'
import { strokeStats, daysAgo, SWIM_INVITE_PATH, STROKES } from '../../src/lib/swim.js'

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
