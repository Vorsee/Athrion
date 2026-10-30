import { describe, it, expect, afterEach, vi } from 'vitest'
import { BADGES, computeEarnedBadges } from '../../src/lib/badges.js'

afterEach(() => vi.useRealTimers())

const log = (iso, sets = [], volume = 0) => ({ created_at: iso, date: iso.slice(0, 10), sets, volume })

describe('computeEarnedBadges', () => {
  it('awards nothing for an empty history', () => expect(computeEarnedBadges({}).size).toBe(0))

  it('awards workout-count badges', () => {
    const h = Array.from({ length: 10 }, (_, i) => log(`2026-01-${String(i + 1).padStart(2, '0')}T12:00:00-05:00`))
    const b = computeEarnedBadges({ history: h })
    expect(b.has('first_workout')).toBe(true)
    expect(b.has('workouts_10')).toBe(true)
    expect(b.has('workouts_50')).toBe(false)
  })

  it('awards PR, volume, time-of-day, weigh-in and photo badges', () => {
    const h = [
      log('2026-01-01T06:00:00-05:00', [{ ex: 'Bench', weight: 100, reps: 5 }]),
      log('2026-01-08T23:00:00-05:00', [{ ex: 'Bench', weight: 110, reps: 5 }], 12000),
    ]
    const b = computeEarnedBadges({ history: h, weighIns: 10, photos: 1 })
    for (const id of ['first_pr', 'volume_10k', 'early_bird', 'night_owl', 'weigh_in_10', 'first_photo']) expect(b.has(id)).toBe(true)
  })

  it('awards the 4-week streak badge', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:00:00-04:00'))
    const h = ['2026-10-20', '2026-10-13', '2026-10-06', '2026-09-29'].map(d => log(`${d}T12:00:00-04:00`))
    expect(computeEarnedBadges({ history: h }).has('streak_4')).toBe(true)
  })

  it('only returns ids that exist in BADGES', () => {
    const ids = new Set(BADGES.map(b => b.id))
    const h = [log('2026-01-01T06:00:00-05:00', [{ ex: 'A', weight: 1, reps: 1 }], 20000), log('2026-01-02T23:00:00-05:00', [{ ex: 'A', weight: 2, reps: 1 }])]
    for (const id of computeEarnedBadges({ history: h, weighIns: 99, photos: 9 })) expect(ids.has(id)).toBe(true)
  })
})

describe('swim badges', () => {
  const swim = (date, stroke, distance_m, seconds) => ({ kind: 'swim', date, created_at: `${date}T10:00:00Z`, stroke, distance_m, seconds })
  it('awards the first lap, a mile, distance totals and a faster pace', () => {
    const b = computeEarnedBadges({ swims: [swim('2026-10-01', 'free', 1500, 1800), swim('2026-10-08', 'free', 200, 220)] })
    expect(b.has('swim_first')).toBe(true)
    expect(b.has('swim_mile')).toBe(true)
    expect(b.has('swim_pr')).toBe(true) // 1:50 /100 after 2:00 /100
    expect(b.has('swim_10k')).toBe(false)
  })
  it('needs all five strokes for Medley Master, and 50 m for a faster pace', () => {
    const five = ['free', 'back', 'breast', 'fly', 'im'].map((s, i) => swim(`2026-10-0${i + 1}`, s, 100, 120))
    expect(computeEarnedBadges({ swims: five }).has('swim_strokes')).toBe(true)
    const short = [swim('2026-10-01', 'free', 100, 120), swim('2026-10-02', 'free', 25, 15)]
    expect(computeEarnedBadges({ swims: short }).has('swim_pr')).toBe(false)
  })
  it('gives no swim badges without swims', () => {
    expect([...computeEarnedBadges({ history: [] })].some(id => id.startsWith('swim_'))).toBe(false)
  })
})
