import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'
import { parseCsv, parseWhen, matchExercise, detectFormat, toWorkouts, importWorkouts } from '../../src/lib/importWorkouts.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
beforeEach(() => sb.reset())

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-03-05 18:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),1,100,5,0,0,"",,
2024-03-05 18:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),2,100,5,0,0,"",,
2024-03-05 18:30:00,"Push, heavy",1h 5m,Treadmill,1,0,0,2,600,"",,
2024-03-07 18:00:00,Legs,45m,Squat (Barbell),1,140,3,0,0,"said ""heavy""",,`

const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Upper","13 Oct 2024, 17:05","13 Oct 2024, 18:10","","Pull Up","","","0","warmup","","5","","",""
"Upper","13 Oct 2024, 17:05","13 Oct 2024, 18:10","","Pull Up","","","1","normal","","8","","",""
"Upper","13 Oct 2024, 17:05","13 Oct 2024, 18:10","","Lat Pulldown (Cable)","","","0","normal","50","10","","",""`

describe('CSV import', () => {
  it('parses quoted fields, commas inside quotes and doubled quotes', () => {
    const rows = parseCsv(STRONG)
    expect(rows).toHaveLength(4)
    expect(rows[0]['Workout Name']).toBe('Push, heavy')
    expect(rows[3].Notes).toBe('said "heavy"')
    expect(detectFormat(rows)).toBe('strong')
    expect(detectFormat(parseCsv(HEVY))).toBe('hevy')
    expect(detectFormat(parseCsv('a,b\n1,2'))).toBeNull()
  })

  it('reads both apps\' dates as local time', () => {
    expect(parseWhen('2024-03-05 18:30:00')).toEqual(new Date(2024, 2, 5, 18, 30))
    expect(parseWhen('13 Oct 2024, 17:05')).toEqual(new Date(2024, 9, 13, 17, 5))
  })

  it('matches names to ATHRION exercises, keeping unknown ones', () => {
    expect(matchExercise('Bench Press (Barbell)')).toBe('Bench Press')
    expect(matchExercise('Pull Up')).toBe('Pull-Up')
    expect(matchExercise('Zercher Carry (Sandbag)')).toBe('Zercher Carry (Sandbag)')
  })

  it('turns a Strong export into workouts, skipping cardio and converting kg', () => {
    const [push, legs] = toWorkouts(parseCsv(STRONG), { strongUnit: 'kg' })
    expect(push).toMatchObject({ date: '2024-03-05', name: 'Push, heavy', duration: '65min' })
    expect(push.sets).toEqual([
      { ex: 'Bench Press', set: 1, weight: 220.5, reps: 5 },
      { ex: 'Bench Press', set: 2, weight: 220.5, reps: 5 },
    ])
    expect(legs).toMatchObject({ date: '2024-03-07', duration: '45min', sets: [{ ex: 'Squat', weight: 308.7, reps: 3 }] })
  })

  it('turns a Hevy export into workouts, without warm-ups', () => {
    const [w] = toWorkouts(parseCsv(HEVY))
    expect(w).toMatchObject({ date: '2024-10-13', name: 'Upper', duration: '65min' })
    expect(w.sets).toEqual([
      { ex: 'Pull-Up', set: 1, weight: 0, reps: 8 },
      { ex: 'Lat Pulldown', set: 1, weight: 110.2, reps: 10 },
    ])
  })

  it('saves only workouts not already in ATHRION', async () => {
    sb.set('workout_logs', { data: null, error: null })
    const workouts = toWorkouts(parseCsv(STRONG))
    const added = await importWorkouts(workouts, [{ date: '2024-03-05', name: 'Push, heavy' }])
    expect(added).toBe(1)
    const rows = sb.op(sb.queriesFor('workout_logs')[0], 'insert')[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: 'user-1', name: 'Legs', date: '2024-03-07' })
  })
})
