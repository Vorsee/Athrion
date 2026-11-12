// The end of a room (R7): best sets, "beat it next time", the room's story card
import { describe, it, expect } from 'vitest'
import { bestSetEach, beatItRows } from '../../src/lib/roomSummary.js'
import { cardContent, roomNames } from '../../src/lib/shareCard.js'

const set = (user_id, display_name, exercise, weight, reps, extra = {}) => ({ user_id, display_name, exercise, weight, reps, ...extra })
const sets = [
  set('me', 'sam', 'Squat', 185, 5), set('me', 'sam', 'Squat', 185, 6), set('me', 'sam', 'Row', 135, 8),
  set('a', 'alex', 'Squat', 225, 5), set('a', 'alex', 'Squat', 315, 1, { warmup: true }),
  set('b', 'maya', 'Squat', 135, 10), set('b', 'maya', 'Row', 135, 8),
]

describe('room summary', () => {
  it("finds each person's heaviest set, warm-ups left out", () => {
    expect(bestSetEach(sets).map(b => [b.name, b.set.exercise, b.set.weight, b.set.reps])).toEqual([
      ['sam', 'Squat', 185, 6], ['alex', 'Squat', 225, 5], ['maya', 'Squat', 135, 10],
    ])
  })
  it('puts my best next to the best partner on each exercise we shared', () => {
    expect(beatItRows(sets, 'me').map(r => [r.exercise, r.mine.reps, r.theirs.name, r.ahead])).toEqual([
      ['Squat', 6, 'alex', 'them'],
      ['Row', 8, 'maya', 'tie'],
    ])
    expect(beatItRows([set('me', 'sam', 'Squat', 100, 5)], 'me')).toEqual([])
  })
  it('makes a story card with everyone and athrion.app on it', () => {
    const c = cardContent({ kind: 'room', names: ['sam', 'alex'], date: '2026-11-12', minutes: 52, volume: '9,450 lb', sets: 18, best: ['alex · Squat 225 lb × 5'] })
    expect(c.eyebrow).toMatch(/^Trained together · /)
    expect(c.title).toBe('@sam and @alex')
    expect(c.stats).toEqual([['Time', '52 min'], ['Volume', '9,450 lb'], ['Sets', '18']])
    expect(c.highlight).toBe('Train with us on athrion.app')
    expect(roomNames(['a', 'b', 'c'])).toBe('@a, @b and @c')
    expect(roomNames(['a', 'b', 'c', 'd', 'e'])).toBe('@a and 4 friends')
  })
})
