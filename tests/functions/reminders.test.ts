// Pure logic from the send-reminders Edge Function
import { describe, it, expect } from 'vitest'
import { localParts, streakBeforeThisWeek, chooseMessage } from '../../supabase/functions/send-reminders/reminders.ts'

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
    expect(chooseMessage(plan, [], {}, friday, now)).toEqual({ title: 'Time to train 💪', body: 'Today: Upper Body · 3 exercises · ~45 min', tag: 'workout-day' })
  })
  it('stays quiet after training today, on rest days and without a plan', () => {
    expect(chooseMessage(plan, ['2026-10-23T14:00:00Z'], {}, friday, now)).toBeNull()
    expect(chooseMessage(plan, [], {}, { ...friday, weekday: 'Saturday' }, now)).toBeNull()
    expect(chooseMessage(null, [], {}, friday, now)).toBeNull()
  })
  it('warns on Sunday when a streak is about to end', () => {
    const sunday = { date: '2026-10-25', hour: 18, weekday: 'Sunday' }
    const sun = new Date('2026-10-25T22:00:00Z')
    expect(chooseMessage(plan, ['2026-10-14T10:00:00Z'], { streak_warnings: true }, sunday, sun)?.tag).toBe('streak')
    expect(chooseMessage(plan, ['2026-10-14T10:00:00Z'], { streak_warnings: false }, sunday, sun)).toBeNull()
  })

  describe('known bugs', () => {
    // "Trained today" means "in the last 16 hours", so last night's late workout
    // silences this morning's reminder.
    it.fails('BUG: a workout late yesterday does not cancel today\'s reminder', () => {
      const morning = { date: '2026-10-23', hour: 8, weekday: 'Friday' }
      const at8am = new Date('2026-10-23T12:00:00Z') // 8am New York
      const lastNight = '2026-10-23T02:00:00Z'       // 10pm New York, Thursday
      expect(chooseMessage(plan, [lastNight], {}, morning, at8am)).not.toBeNull()
    })
  })
})
