import { describe, it, expect, afterEach, vi } from 'vitest'
import { e1rm, buildExerciseHistory, getRecords, suggestNext, parseRepRange, findNewPRs, weeklyStreak } from '../../src/lib/progress.js'

afterEach(() => vi.useRealTimers())

const session = (created_at, sets) => ({ created_at, date: created_at.slice(0, 10), sets })

describe('e1rm', () => {
  it('uses the Epley formula', () => expect(e1rm(100, 10)).toBeCloseTo(133.33, 1))
  it('returns the weight itself for a single rep', () => expect(e1rm(200, 1)).toBe(200))
  it('is 0 for missing weight or reps', () => {
    expect(e1rm(0, 5)).toBe(0)
    expect(e1rm(100, 0)).toBe(0)
  })
})

describe('buildExerciseHistory', () => {
  it('groups sets by exercise, oldest session first', () => {
    const h = buildExerciseHistory([
      session('2026-10-10T10:00:00Z', [{ ex: 'Squat', weight: 200, reps: 5 }]),
      session('2026-10-01T10:00:00Z', [{ ex: 'Squat', weight: 185, reps: 5 }, { ex: 'Bench', weight: '135', reps: '8' }]),
    ])
    expect(h.Squat.map(s => s.sets[0].weight)).toEqual([185, 200])
    expect(h.Bench[0].sets[0]).toEqual({ weight: 135, reps: 8 }) // strings coerced
  })
  it('skips malformed sets and tolerates empty input', () => {
    expect(buildExerciseHistory([session('2026-10-01T00:00:00Z', [null, { weight: 5 }])])).toEqual({})
    expect(buildExerciseHistory(null)).toEqual({})
  })
})

describe('getRecords', () => {
  it('tracks heaviest weight, best e1RM, most reps and best session volume', () => {
    const r = getRecords([
      { sets: [{ weight: 100, reps: 10 }, { weight: 120, reps: 3 }] },
      { sets: [{ weight: 120, reps: 5 }, { weight: 0, reps: 20 }] },
    ])
    expect(r.maxWeight).toBe(120)
    expect(r.maxWeightReps).toBe(5) // more reps at the same top weight wins
    expect(r.maxReps).toBe(20)
    expect(r.bestVolume).toBe(1360)
    expect(r.bestE1rm).toBeCloseTo(140, 0)
  })
})

describe('suggestNext (double progression)', () => {
  const last = sets => [{ sets }]
  it('returns null with no history', () => {
    expect(suggestNext([])).toBeNull()
    expect(suggestNext([{ sets: [] }])).toBeNull()
  })
  it('adds weight once every set reaches the top of the range', () => {
    const s = suggestNext(last([{ weight: 100, reps: 12 }, { weight: 100, reps: 12 }]), { minReps: 8, maxReps: 12 })
    expect(s).toMatchObject({ weight: 105, reps: 8 })
  })
  it('uses a smaller jump for light weights', () => {
    expect(suggestNext(last([{ weight: 20, reps: 12 }]))).toMatchObject({ weight: 22.5, reps: 8 })
  })
  it('holds the weight while any set is below the minimum', () => {
    expect(suggestNext(last([{ weight: 100, reps: 9 }, { weight: 100, reps: 6 }]))).toMatchObject({ weight: 100, reps: 8 })
  })
  it('otherwise adds a rep, capped at the top of the range', () => {
    expect(suggestNext(last([{ weight: 100, reps: 10 }]))).toMatchObject({ weight: 100, reps: 11 })
    expect(suggestNext(last([{ weight: 100, reps: 12 }, { weight: 90, reps: 10 }]))).toMatchObject({ reps: 12 })
  })
  it('progresses bodyweight moves by reps only', () => {
    expect(suggestNext(last([{ weight: 0, reps: 15 }]))).toMatchObject({ weight: 0, reps: 16 })
  })
})

describe('parseRepRange', () => {
  it('parses ranges and single numbers', () => {
    expect(parseRepRange('8-12')).toEqual({ minReps: 8, maxReps: 12 })
    expect(parseRepRange('5')).toEqual({ minReps: 5, maxReps: 5 })
    expect(parseRepRange(10)).toEqual({ minReps: 10, maxReps: 10 })
  })
  it('falls back to 8-12 for timed or empty targets', () => {
    expect(parseRepRange('30 sec')).toEqual({ minReps: 8, maxReps: 12 })
    expect(parseRepRange('2 min')).toEqual({ minReps: 8, maxReps: 12 })
    expect(parseRepRange(undefined)).toEqual({ minReps: 8, maxReps: 12 })
  })

  describe('known bugs', () => {
    // The timed-target check /s|min|sec/ matches any "s", so "6-8 reps" is treated as timed
    it.fails('BUG: "6-8 reps" should parse as 6-8', () => {
      expect(parseRepRange('6-8 reps')).toEqual({ minReps: 6, maxReps: 8 })
    })
    it.fails('BUG: "10 each side" should parse as 10', () => {
      expect(parseRepRange('10 each side')).toEqual({ minReps: 10, maxReps: 10 })
    })
  })
})

describe('findNewPRs', () => {
  const history = [session('2026-10-01T10:00:00Z', [{ ex: 'Bench', weight: 135, reps: 8 }, { ex: 'Pushup', weight: 0, reps: 20 }])]
  it('flags a heavier weight', () => {
    expect(findNewPRs([{ ex: 'Bench', weight: 145, reps: 5 }], history)).toEqual([{ name: 'Bench', type: 'Heaviest weight', value: '145 lb × 5' }])
  })
  it('flags a better estimated 1RM at the same weight', () => {
    expect(findNewPRs([{ ex: 'Bench', weight: 135, reps: 12 }], history)[0].type).toBe('Estimated 1RM')
  })
  it('flags more reps on bodyweight moves', () => {
    expect(findNewPRs([{ ex: 'Pushup', weight: 0, reps: 25 }], history)[0]).toMatchObject({ type: 'Most reps', value: '25 reps' })
  })
  it('does not count a first-ever attempt or a worse session', () => {
    expect(findNewPRs([{ ex: 'Squat', weight: 300, reps: 1 }], history)).toEqual([])
    expect(findNewPRs([{ ex: 'Bench', weight: 135, reps: 8 }], history)).toEqual([])
  })
})

describe('weeklyStreak', () => {
  const at = iso => ({ created_at: iso })
  it('counts consecutive weeks and does not break on an unfinished current week', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:00:00-04:00')) // Wednesday
    const h = [at('2026-10-13T10:00:00-04:00'), at('2026-10-06T10:00:00-04:00'), at('2026-09-29T10:00:00-04:00')]
    expect(weeklyStreak(h)).toBe(3)
    expect(weeklyStreak([...h, at('2026-10-20T10:00:00-04:00')])).toBe(4)
  })
  it('respects the per-week minimum and returns 0 for no history', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:00:00-04:00'))
    expect(weeklyStreak([at('2026-10-13T10:00:00-04:00')], 2)).toBe(0)
    expect(weeklyStreak([])).toBe(0)
  })

  describe('known bugs', () => {
    // Week keys are local midnights, but the loop steps back a fixed 7×24h, so it misses
    // the previous Monday whenever a daylight-saving change falls in between.
    it.fails('BUG: a streak survives the November daylight-saving change', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-04T12:00:00-05:00')) // week after DST ends (Nov 1)
      const h = [at('2026-11-02T10:00:00-05:00'), at('2026-10-27T10:00:00-04:00'), at('2026-10-20T10:00:00-04:00')]
      expect(weeklyStreak(h)).toBe(3)
    })
  })
})
