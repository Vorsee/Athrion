// Pure logic from the send-reminders Edge Function
import { describe, it, expect } from 'vitest'
import { localParts, streakBeforeThisWeek, chooseMessage, buildRecap, openWorkoutMessage, pushAllowed, mondayOf } from '../../supabase/functions/send-reminders/reminders.ts'

const plan = { weeklySchedule: [
  { day: 'Friday', type: 'workout', title: 'Upper Body', durationMinutes: 45, workout: { exercises: [{}, {}, {}] } },
  { day: 'Saturday', type: 'rest', title: 'Rest' },
  { day: 'Sunday', type: 'rest', title: 'Rest' },
] }

describe('localParts', () => {
  it('converts to the user timezone', () => {
    const now = new Date('2026-10-24T02:30:00Z')
    expect(localParts('America/Los_Angeles', now)).toEqual({ date: '2026-10-23', hour: 19, weekday: 'Friday' })
    expect(localParts('Asia/Tokyo', now)).toEqual({ date: '2026-10-24', hour: 11, weekday: 'Saturday' })
  })
  it('throws on an invalid timezone (the handler falls back to UTC)', () => {
    expect(() => localParts('Not/AZone')).toThrow()
  })
})

describe('streakBeforeThisWeek', () => {
  const now = new Date('2026-10-25T15:00:00Z') // Sunday
  it('counts full weeks before this one', () => {
    expect(streakBeforeThisWeek(['2026-10-14T10:00:00Z', '2026-10-07T10:00:00Z'], now)).toEqual({ streak: 2, trainedThisWeek: false })
    expect(streakBeforeThisWeek(['2026-10-21T10:00:00Z', '2026-10-14T10:00:00Z'], now)).toEqual({ streak: 1, trainedThisWeek: true })
    expect(streakBeforeThisWeek([], now).streak).toBe(0)
  })
})

describe('chooseMessage', () => {
  const friday = { date: '2026-10-23', hour: 18, weekday: 'Friday' }
  const now = new Date('2026-10-23T22:00:00Z')
  it('reminds on a planned workout day', () => {
    expect(chooseMessage(plan, [], {}, friday, now)).toEqual({ title: 'Time to train', body: 'Today: Upper Body · 3 exercises · ~45 min', tag: 'workout-day' })
  })
  it('stays quiet after training today, on rest days and without a plan', () => {
    expect(chooseMessage(plan, ['2026-10-23T14:00:00Z'], {}, friday, now)).toBeNull()
    expect(chooseMessage(plan, [], {}, { ...friday, weekday: 'Saturday' }, now)).toBeNull()
    expect(chooseMessage(null, [], {}, friday, now)).toBeNull()
  })
  it('adds the month\'s workout days to a planned-day reminder', () => {
    expect(chooseMessage(plan, [], {}, friday, now, { month: { workout_days: 8 } })?.body)
      .toBe('Today: Upper Body · 3 exercises · ~45 min · 8/12 days in October')
  })
  it('without a plan, nudges after two days off with the last workout', () => {
    const last = { name: 'Push day', created_at: '2026-10-20T14:00:00Z' }
    expect(chooseMessage(null, [last.created_at], {}, friday, now, { last, month: { workout_days: 5 } }))
      .toEqual({ title: 'Time to train', body: 'Last workout: Push day, 3 days ago. 5/12 days in October.', tag: 'nudge' })
    const yesterday = { name: 'Legs', created_at: '2026-10-22T14:00:00Z' }
    expect(chooseMessage(null, [yesterday.created_at], {}, friday, now, { last: yesterday })).toBeNull()
  })
  it('warns on Sunday when a streak is about to end', () => {
    const sunday = { date: '2026-10-25', hour: 18, weekday: 'Sunday' }
    const sun = new Date('2026-10-25T22:00:00Z')
    expect(chooseMessage(plan, ['2026-10-14T10:00:00Z'], { streak_warnings: true }, sunday, sun)?.tag).toBe('streak')
    expect(chooseMessage(plan, ['2026-10-14T10:00:00Z'], { streak_warnings: false }, sunday, sun)).toBeNull()
  })

  describe('regression: fixed in the October 2026 review', () => {
    // "Trained today" means "in the last 16 hours", so last night's late workout
    // silences this morning's reminder.
    it('a workout late yesterday does not cancel today\'s reminder', () => {
      const morning = { date: '2026-10-23', hour: 8, weekday: 'Friday' }
      const at8am = new Date('2026-10-23T12:00:00Z') // 8am New York
      const lastNight = '2026-10-23T02:00:00Z'       // 10pm New York, Thursday
      expect(chooseMessage(plan, [lastNight], { timezone: 'America/New_York' }, morning, at8am)).not.toBeNull()
    })
  })
})

describe('buildRecap', () => {
  const sunday = { date: '2026-10-25', hour: 18, weekday: 'Sunday' }
  const log = (day: string, weight: number, volume = 5000) => ({ created_at: `2026-10-${day}T14:00:00Z`, volume, sets: [{ ex: 'Squat', weight }] })
  it('counts the week\'s workouts, volume and PRs, with points and place among friends', () => {
    const logs = [log('15', 200), log('20', 210), log('22', 205), log('24', 215)]
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(buildRecap(logs, {}, sunday, 'lb', { points: 95, friends_place: 2, friends: 3 })).toEqual({
      title: 'Your week: 3 workouts',
      body: '15,000 lb lifted · 1 PR. 95 pts this month, #2 of 4 with friends.',
    })
  })
  it('shows kg for kg users and stays quiet after a week off', () => {
    expect(buildRecap([log('21', 100, 1000)], {}, sunday, 'kg')?.body).toBe('454 kg lifted.')
    expect(buildRecap([log('12', 100)], {}, sunday)).toBeNull()
  })
})

describe('openWorkoutMessage and pushAllowed', () => {
  it('describes the open workout and links back to it', () => {
    expect(openWorkoutMessage({ name: 'Leg day', exercises_done: 3, exercises_total: 5, sets_done: 9 })).toEqual({
      title: 'Leg day is still open',
      body: '3 of 5 exercises done. Pick up where you left off, or finish it to save it.',
      tag: 'open-workout', url: '/?open=workout',
    })
  })
  it('follows each type\'s switch; no settings means on', () => {
    expect(pushAllowed('friend_request', null)).toBe(true)
    expect(pushAllowed('friend_request', { notify_friends: false })).toBe(false)
    expect(pushAllowed('recap', { notify_recap: false, notify_friends: false })).toBe(false)
    expect(pushAllowed('month_result', { notify_recap: false })).toBe(true)
    expect(pushAllowed('team_request', { notify_team: false })).toBe(false)
    expect(pushAllowed('team_accepted', { notify_friends: false })).toBe(true)
    expect(pushAllowed('coach_application', { notify_team: false })).toBe(true)
  })
})
