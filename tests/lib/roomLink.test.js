// Room links (R2) and the room plans Train's Train together makes (R3)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))

import { parseRoomPath, rememberRoomLink, readRoomLink, clearRoomLink, roomLinkMetadata } from '../../src/lib/roomLink.js'
import { roomPlanFromExercises, roomPlanFromLog } from '../../src/lib/groupPlan.js'

beforeEach(() => { localStorage.clear(); sb.reset() })

describe('room links', () => {
  it('reads /r/<code> in any case', () => {
    expect(parseRoomPath('/r/k7m4qx')).toBe('K7M4QX')
    expect(parseRoomPath('/r/K7M4QX/')).toBe('K7M4QX')
    expect(parseRoomPath('/r/K7M')).toBeNull()
    expect(parseRoomPath('/add/sam')).toBeNull()
  })
  it('keeps the code through sign-up, on the phone and in the new account, for 12 hours', () => {
    rememberRoomLink('K7M4QX')
    expect(readRoomLink()).toBe('K7M4QX')
    expect(roomLinkMetadata()).toMatchObject({ room_code: 'K7M4QX' })
    localStorage.clear()
    expect(readRoomLink({ user_metadata: { room_code: 'K7M4QX', room_at: Date.now() } })).toBe('K7M4QX') // confirmed on another device
    expect(readRoomLink({ user_metadata: { room_code: 'K7M4QX', room_at: Date.now() - 13 * 3600e3 } })).toBeNull()
    expect(roomLinkMetadata()).toEqual({})
  })
  it('forgets it once used, in the account too', () => {
    rememberRoomLink('K7M4QX')
    clearRoomLink({ user_metadata: { room_code: 'K7M4QX' } })
    expect(readRoomLink()).toBeNull()
    expect(sb.supabase.auth.updateUser).toHaveBeenCalledWith({ data: { room_code: null, room_at: null } })
  })
})

describe('room plans from Train', () => {
  it("turns today's plan into sets with a reps target and the plan's rest", () => {
    expect(roomPlanFromExercises([
      { name: 'Bench Press', sets: 4, reps: '6-8', restSeconds: 120 },
      { name: 'Plank', sets: 3, reps: '30 s' },
    ])).toEqual([
      { name: 'Bench Press', sets: Array(4).fill({ reps: 6, rest: 120 }) },
      { name: 'Plank', sets: Array(3).fill({ reps: null, rest: 60 }) },
    ])
  })
  it('repeats a logged workout without its warm-ups', () => {
    expect(roomPlanFromLog({ sets: [
      { ex: 'Squat', set: 1, reps: 5, warmup: true }, { ex: 'Squat', set: 2, reps: 5 }, { ex: 'Squat', set: 3, reps: 4 }, { ex: 'Row', set: 1, reps: 10 },
    ] })).toEqual([
      { name: 'Squat', sets: [{ reps: 5, rest: 60 }, { reps: 4, rest: 60 }] },
      { name: 'Row', sets: [{ reps: 10, rest: 60 }] },
    ])
  })
})
