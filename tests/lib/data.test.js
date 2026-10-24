import { describe, it, expect, afterEach, vi } from 'vitest'
import { getSession, setSession, clearSession, getUsers, saveUsers, userKey, todayKey, getStored, setStored, fmtTime, getExerciseIcon, EXERCISES, getTodaysExercises } from '../../src/lib/data.js'

afterEach(() => vi.useRealTimers())

describe('local storage helpers', () => {
  it('round-trips session, users and stored values', () => {
    setSession({ email: 'a@b.c' })
    expect(getSession()).toEqual({ email: 'a@b.c' })
    expect(userKey('x')).toBe('athrion_a@b.c_x')
    clearSession()
    expect(getSession()).toBeNull()
    saveUsers([{ id: 1 }])
    expect(getUsers()).toEqual([{ id: 1 }])
    setStored('k', { a: 1 })
    expect(getStored('k')).toEqual({ a: 1 })
    expect(getStored('missing', 5)).toBe(5)
  })
  it('survives corrupted JSON', () => {
    localStorage.setItem('athrion_session', '{bad')
    localStorage.setItem('athrion_users', '{bad')
    localStorage.setItem('k', '{bad')
    expect(getSession()).toBeNull()
    expect(getUsers()).toEqual([])
    expect(getStored('k', 'fb')).toBe('fb')
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
