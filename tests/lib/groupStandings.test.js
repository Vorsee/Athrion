import { describe, it, expect } from 'vitest'
import { standings, mergeSets } from '../../src/lib/groupStandings.js'

const exercises = [{ name: 'Squat' }, { name: 'Bench Press' }]
const participants = [{ user_id: 'a', display_name: 'alice' }, { user_id: 'b', display_name: 'bob' }, { user_id: 'c', display_name: 'cara' }]
const now = Date.parse('2026-10-25T12:00:00Z')
const at = secsAgo => new Date(now - secsAgo * 1000).toISOString()
const set = (id, user, exercise, set_num, weight, reps, secsAgo) => ({ id, user_id: user, display_name: user === 'a' ? 'alice' : 'bob', exercise, set_num, weight, reps, logged_at: at(secsAgo) })

describe('standings', () => {
  const sets = [
    set(1, 'a', 'Squat', 1, 100, 5, 600), set(2, 'a', 'Squat', 2, 100, 5, 400),
    set(3, 'b', 'Squat', 1, 200, 5, 500), set(4, 'b', 'Squat', 2, 200, 5, 300),
    set(5, 'b', 'Bench Press', 1, 150, 5, 20),
  ]
  const rows = standings({ sets, participants, exercises, totalSets: 2, restSecs: 60, now })

  it('ranks by volume and says where everyone is', () => {
    expect(rows.map(r => r.name)).toEqual(['bob', 'alice', 'cara'])
    expect(rows[0]).toMatchObject({ volume: 2750, done: 3, total: 4, resting: true, where: 'Bench Press · set 2/2' })
    expect(rows[1]).toMatchObject({ volume: 1000, done: 2, resting: false, where: 'Bench Press · set 1/2' })
    expect(rows[2]).toMatchObject({ volume: 0, done: 0, where: 'Starting Squat' })
  })

  it('marks someone finished after their last set', () => {
    const done = standings({ sets: [...sets, set(6, 'b', 'Bench Press', 2, 150, 5, 5)], participants, exercises, totalSets: 2, now })
    expect(done[0]).toMatchObject({ name: 'bob', finished: true, where: 'Finished', done: 4 })
  })

  it('breaks volume ties with reps, so bodyweight rooms still rank', () => {
    const bw = [set(1, 'a', 'Squat', 1, 0, 12, 300), set(2, 'b', 'Squat', 1, 0, 20, 300)]
    expect(standings({ sets: bw, participants, exercises, totalSets: 2, now }).map(r => r.name).slice(0, 2)).toEqual(['bob', 'alice'])
  })
})

describe('mergeSets', () => {
  it('keeps one copy of each set, oldest first', () => {
    const a = set(1, 'a', 'Squat', 1, 100, 5, 60), b = set(2, 'b', 'Squat', 1, 100, 5, 30)
    expect(mergeSets([b], [a, b]).map(s => s.id)).toEqual([1, 2])
  })
})
