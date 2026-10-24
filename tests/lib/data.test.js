import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayKey, localDateKey, fmtTime, getExerciseIcon, EXERCISES, getTodaysExercises } from '../../src/lib/data.js'

afterEach(() => vi.useRealTimers())

describe('localDateKey', () => {
  it('formats a date as the local calendar day', () => {
    expect(localDateKey(new Date('2026-10-23T23:30:00-04:00'))).toBe('2026-10-23')
    expect(localDateKey('2026-01-05T09:00:00-05:00')).toBe('2026-01-05')
  })
})

describe('fmtTime', () => {
  it('formats seconds as mm:ss', () => {
    expect(fmtTime(0)).toBe('00:00')
    expect(fmtTime(75)).toBe('01:15')
    expect(fmtTime(3600)).toBe('60:00')
  })
})

describe('getExerciseIcon', () => {
  it('picks icons by name, with a default', () => {
    expect(getExerciseIcon(null)).toBe('mdi:weight-lifter')
    expect(getExerciseIcon({ name: 'Pull-Up' })).toBe('mdi:human-handsup')
    expect(getExerciseIcon({ name: 'Barbell Row' })).toBe('mdi:rowing')
    expect(getExerciseIcon({ name: 'Bicep Curl' })).toBe('mdi:arm-flex')
    expect(typeof getExerciseIcon({ name: 'Something Unknown' })).toBe('string')
  })
  it('returns an icon for every built-in exercise', () => {
    for (const ex of EXERCISES) expect(getExerciseIcon(ex)).toMatch(/^[a-z-]+:[a-z0-9-]+$/)
  })
})

describe('getTodaysExercises', () => {
  it('returns 4 real exercises for every weekday', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let d = 18; d <= 24; d++) {
      vi.setSystemTime(new Date(`2026-10-${d}T12:00:00-04:00`))
      const list = getTodaysExercises()
      expect(list).toHaveLength(4)
      list.forEach(e => expect(e?.name).toBeTruthy())
    }
  })
})

describe('todayKey', () => {
  it('returns YYYY-MM-DD', () => expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/))

  describe('regression: fixed in the October 2026 review', () => {
    // Uses UTC, so in the US evening "today" is already tomorrow: calories logged after
    // ~8pm EDT go to the next day's log and the Today view empties.
    it('at 9pm in New York, today is still the local date', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-23T21:00:00-04:00'))
      expect(todayKey()).toBe('2026-10-23')
    })
  })
})
