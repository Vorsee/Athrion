import { describe, it, expect } from 'vitest'
import { cardioUnits, parseDuration, fmtDuration, fmtDistance, paceSecs, cardioSummary } from '../../src/lib/cardio.js'

describe('cardio', () => {
  it('reads times as minutes, m:ss or h:mm:ss', () => {
    expect([parseDuration('45'), parseDuration('28:30'), parseDuration('1:05:00'), parseDuration(''), parseDuration('a:1')]).toEqual([2700, 1710, 3900, null, null])
    expect([fmtDuration(1710), fmtDuration(3900), fmtDuration(65)]).toEqual(['28:30', '1:05:00', '1:05'])
  })
  it('gives runs per km or mile and swims per 100 m or 100 yd', () => {
    const run = { distance_m: 5000, seconds: 1500 }
    expect(fmtDuration(paceSecs(run, cardioUnits('run', 'kg')))).toBe('5:00')
    expect(fmtDuration(paceSecs(run, cardioUnits('run', 'lb')))).toBe('8:03')
    expect(fmtDistance(5000, cardioUnits('run', 'lb'))).toBe('3.11 mi')
    const swim = { distance_m: 1500, seconds: 1800 }
    expect(fmtDuration(paceSecs(swim, cardioUnits('swim', 'kg')))).toBe('2:00')
    expect(fmtDistance(1500, cardioUnits('swim', 'lb'))).toBe('1640 yd')
    expect(cardioUnits('run', 'kg').toM(5)).toBe(5000)
  })
  it('totals this week from Monday and finds the bests', () => {
    const now = new Date('2026-10-28T12:00:00') // Wednesday
    const logs = [
      { kind: 'run', date: '2026-10-27', distance_m: 5000, seconds: 1500 },
      { kind: 'run', date: '2026-10-26', distance_m: 10000, seconds: 3300 },
      { kind: 'run', date: '2026-10-25', distance_m: 800, seconds: 150 }, // Sunday: last week, and too short for fastest
      { kind: 'swim', date: '2026-10-27', distance_m: 1000, seconds: 1200 },
    ]
    const s = cardioSummary(logs, 'run', now)
    expect(s.week).toEqual({ sessions: 2, distance_m: 15000, seconds: 4800 })
    expect(s.longest.distance_m).toBe(10000)
    expect(s.fastest.distance_m).toBe(5000)
    expect(s.count).toBe(3)
  })
})
