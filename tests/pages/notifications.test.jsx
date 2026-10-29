// Notifications: the bell's list, the open-workout mirror, and the database's badge names.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sqlSection } from '../helpers/sql.js'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'
import { BADGES } from '../../src/lib/badges.js'
import NotificationsSheet, { timeAgo } from '../../src/components/NotificationsSheet.jsx'
import { syncOpenWorkout, clearOpenWorkout } from '../../src/lib/notifications.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

beforeEach(() => sb.reset())
const flush = () => new Promise(r => setTimeout(r, 0))

describe('NotificationsSheet', () => {
  const rows = [
    { id: 'a', kind: 'friend_request', title: 'New friend request', body: '@alex wants to be friends.', url: '/?open=friends', read_at: null, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 'b', kind: 'badge', title: 'Badge earned: On Fire', body: '', url: '/?open=progress', read_at: '2026-10-20T10:00:00Z', created_at: '2026-10-20T10:00:00Z' },
  ]

  it('lists notifications, marks the unread ones read, and opens a tapped one', async () => {
    sb.set('notifications', q => sb.op(q, 'update') ? { data: null, error: null } : { data: rows, error: null })
    const onGo = vi.fn(), onRead = vi.fn()
    render(<NotificationsSheet onClose={() => {}} onGo={onGo} onRead={onRead} />)
    expect(await screen.findByText('New friend request')).toBeInTheDocument()
    expect(screen.getByText('5 min ago')).toBeInTheDocument()
    expect(screen.getAllByLabelText('New')).toHaveLength(1)
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    const update = sb.queriesFor('notifications').find(q => sb.op(q, 'update'))
    expect(sb.op(update, 'update')[0].read_at).toBeTruthy()
    expect(sb.op(update, 'is')).toEqual(['read_at', null])
    await userEvent.click(screen.getByText('Badge earned: On Fire'))
    expect(onGo).toHaveBeenCalledWith('/?open=progress')
  })

  it('has an empty state', async () => {
    sb.set('notifications', { data: [], error: null })
    render(<NotificationsSheet onClose={() => {}} onGo={() => {}} />)
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument()
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-10-25T12:00:00Z')
    expect(timeAgo('2026-10-25T11:59:40Z', now)).toBe('Just now')
    expect(timeAgo('2026-10-25T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-10-24T09:00:00Z', now)).toBe('Yesterday')
  })
})

describe('open workout mirror', () => {
  it('saves progress when a set is logged and clears it when the workout ends', async () => {
    sb.set('open_workouts', { data: null, error: null })
    syncOpenWorkout({ startTime: 1, name: 'Leg day', exerciseNames: ['Squat', 'Leg Press', 'Lunge'],
      loggedSets: [{ ex: 'Squat' }, { ex: 'Squat' }, { ex: 'Leg Press' }] })
    await flush(); await flush()
    const up = sb.op(sb.queriesFor('open_workouts')[0], 'upsert')[0]
    expect(up).toMatchObject({ name: 'Leg day', sets_done: 3, exercises_done: 2, exercises_total: 3, notified_at: null })

    // Same number of sets within a minute: no extra write
    syncOpenWorkout({ startTime: 1, name: 'Leg day', exerciseNames: ['Squat'], loggedSets: [{}, {}, {}] })
    await flush(); await flush()
    expect(sb.queriesFor('open_workouts')).toHaveLength(1)

    clearOpenWorkout()
    await flush(); await flush()
    expect(sb.op(sb.queriesFor('open_workouts')[1], 'delete')).toBeTruthy()
  })
})

describe('database badge names', () => {
  it('011 names every badge the same way the app does', () => {
    const sql = sqlSection('011_notifications')
    for (const b of BADGES) expect(sql).toMatch(new RegExp(`WHEN '${b.id}'\\s+THEN '${b.name}'`))
  })
})
