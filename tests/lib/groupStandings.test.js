import { describe, it, expect } from 'vitest'
import { standings, mergeSets } from '../../src/lib/groupStandings.js'
import { planFrom, makeSets, restAfter, totalSets, setsDone, setsSummary, restLabel } from '../../src/lib/groupPlan.js'

const exercises = planFrom({ exercises: ['Squat', 'Bench Press'], total_sets: 2, rest_secs: 60 })
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
  const rows = standings({ sets, participants, plan: exercises, now })

  it('ranks by volume and says where everyone is', () => {
    expect(rows.map(r => r.name)).toEqual(['bob', 'alice', 'cara'])
    expect(rows[0]).toMatchObject({ volume: 2750, done: 3, total: 4, resting: true, where: 'Bench Press · set 2/2' })
    expect(rows[1]).toMatchObject({ volume: 1000, done: 2, resting: false, where: 'Bench Press · set 1/2' })
    expect(rows[2]).toMatchObject({ volume: 0, done: 0, where: 'Starting Squat' })
  })

  it('marks someone finished after their last set', () => {
    const done = standings({ sets: [...sets, set(6, 'b', 'Bench Press', 2, 150, 5, 5)], participants, plan: exercises, now })
    expect(done[0]).toMatchObject({ name: 'bob', finished: true, where: 'Finished', done: 4 })
  })

  it('breaks volume ties with reps, so bodyweight rooms still rank', () => {
    const bw = [set(1, 'a', 'Squat', 1, 0, 12, 300), set(2, 'b', 'Squat', 1, 0, 20, 300)]
    expect(standings({ sets: bw, participants, plan: exercises, now }).map(r => r.name).slice(0, 2)).toEqual(['bob', 'alice'])
  })
})

describe('mergeSets', () => {
  it('keeps one copy of each set, oldest first', () => {
    const a = set(1, 'a', 'Squat', 1, 100, 5, 60), b = set(2, 'b', 'Squat', 1, 100, 5, 30)
    expect(mergeSets([b], [a, b]).map(s => s.id)).toEqual([1, 2])
  })
})

describe('rooms planned set by set', () => {
  // Squat: 3 sets, rest 120s then 90s, then 45s before Bench. Bench: 1 set.
  const plan = [
    { name: 'Squat', sets: [{ reps: 5, rest: 120 }, { reps: 5, rest: 90 }, { reps: 3, rest: 45 }] },
    { name: 'Bench Press', sets: [{ reps: null, rest: 60 }] },
  ]

  it('reads old rooms as the same sets for every exercise', () => {
    expect(planFrom({ exercises: ['Squat'], total_sets: 2, rest_secs: 90 })).toEqual([{ name: 'Squat', sets: makeSets(2, 90) }])
    expect(planFrom({ plan, exercises: ['ignored'] })).toEqual(plan)
    expect(planFrom(null)).toEqual([])
  })

  it('counts sets and gives each set its own rest, none after the last', () => {
    expect(totalSets(plan)).toBe(4)
    expect(setsDone(plan, 1, 0)).toBe(3)
    expect([restAfter(plan, 0, 0), restAfter(plan, 0, 1), restAfter(plan, 0, 2), restAfter(plan, 1, 0)]).toEqual([120, 90, 45, 0])
  })

  it('describes sets and rest for the lobby', () => {
    expect(setsSummary(plan[0].sets)).toBe('3 sets · 5, 5, 3 reps')
    expect(setsSummary(makeSets(3, 60, 10))).toBe('3 sets × 10')
    expect(setsSummary(plan[1].sets)).toBe('1 set')
    expect([restLabel(0), restLabel(45), restLabel(90), restLabel(120)]).toEqual(['No rest', '45s', '1m 30s', '2 min'])
  })

  it('uses each exercise\'s set count and the rest of the set just logged', () => {
    const rows = standings({
      plan, participants: participants.slice(0, 2), now,
      sets: [set(1, 'a', 'Squat', 1, 100, 5, 100), set(2, 'b', 'Squat', 1, 100, 5, 300), set(3, 'b', 'Squat', 2, 100, 5, 100)],
    })
    const alice = rows.find(r => r.id === 'a'), bob = rows.find(r => r.id === 'b')
    expect(alice).toMatchObject({ resting: true, where: 'Squat · set 2/3', total: 4 }) // 100s into a 120s rest
    expect(bob).toMatchObject({ resting: false, where: 'Squat · set 3/3' }) // 100s into a 90s rest
  })
})
