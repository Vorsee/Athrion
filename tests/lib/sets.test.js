import { describe, it, expect } from 'vitest'
import { exerciseMode, setText, setShort, parseTimeTarget, fmtSecs } from '../../src/lib/sets.js'
import { suggestNext, findNewPRs, buildExerciseHistory, getRecords } from '../../src/lib/progress.js'
import { EXERCISES, MUSCLES } from '../../src/lib/data.js'

const fmt = lb => `${lb} lb`

describe('timed and bodyweight sets', () => {
  it('knows how each exercise is logged', () => {
    const ex = n => EXERCISES.find(e => e.name === n)
    expect(['Plank', 'Wall Sit', 'Jump Rope', 'Dead Hang', 'Rowing Machine'].map(n => exerciseMode(ex(n)))).toEqual(['time', 'time', 'time', 'time', 'time'])
    expect(['Pull-Up', 'Burpee', 'Dips'].map(n => exerciseMode(ex(n) ?? { equipment: 'Bodyweight' }))).toEqual(['bodyweight', 'bodyweight', 'bodyweight'])
    expect(exerciseMode(ex('Squat'))).toBe('weight')
    expect(exerciseMode({ name: 'Coach hold', reps: '45s' })).toBe('time') // a coach's own move
    expect(exerciseMode({ name: 'Lunges', reps: '10 each side', equipment: 'Dumbbells' })).toBe('weight')
  })
  it('reads time targets and formats sets', () => {
    expect([parseTimeTarget('30-60s'), parseTimeTarget('5-10 min'), parseTimeTarget('1:30'), parseTimeTarget('8-12')])
      .toEqual([{ min: 30, max: 60 }, { min: 300, max: 600 }, { min: 90, max: 90 }, null])
    expect([fmtSecs(45), fmtSecs(90), fmtSecs(605)]).toEqual(['45s', '1:30', '10:05'])
    expect(setText({ weight: 0, reps: 0, secs: 45 }, fmt)).toBe('45s')
    expect(setText({ weight: 20, reps: 0, secs: 30 }, fmt)).toBe('20 lb · 30s')
    expect(setText({ weight: 100, reps: 8 }, fmt)).toBe('100 lb × 8')
    expect(setShort({ weight: 0, reps: 12 }, x => x)).toBe('12')
  })
  it('suggests holding longer and spots a longest-hold PR', () => {
    const history = [{ created_at: '2026-10-20T10:00:00Z', sets: [{ ex: 'Plank', weight: 0, reps: 0, secs: 40 }, { ex: 'Plank', weight: 0, reps: 0, secs: 35 }] }]
    const past = buildExerciseHistory(history).Plank
    expect(getRecords(past).maxSecs).toBe(40)
    expect(suggestNext(past, { timed: { min: 30, max: 60 } })).toMatchObject({ secs: 45, weight: 0 })
    expect(suggestNext([{ sets: [{ weight: 0, reps: 0, secs: 60 }] }], { timed: { min: 30, max: 60 } }).secs).toBe(60)
    expect(findNewPRs([{ ex: 'Plank', weight: 0, reps: 0, secs: 50 }], history)).toEqual([{ name: 'Plank', type: 'Longest hold', value: '50s' }])
    expect(findNewPRs([{ ex: 'Plank', weight: 0, reps: 0, secs: 30 }], history)).toEqual([])
  })
  it('has conditioning and mobility moves to pick', () => {
    expect(MUSCLES).toEqual(expect.arrayContaining(['Conditioning', 'Mobility']))
    expect(EXERCISES.filter(e => e.muscle === 'Mobility').length).toBeGreaterThanOrEqual(8)
    expect(new Set(EXERCISES.map(e => e.name)).size).toBe(EXERCISES.length) // no duplicate names
  })
})
