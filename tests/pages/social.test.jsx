// Train together's social side: nicknames, friends, the monthly leaderboard, levels and trophies.
// "Today" is Friday 23 Oct 2026, 10am New York.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'
import { levelFor, trophiesFrom, cleanNickname, daysLeftInMonth } from '../../src/lib/points.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let Group
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00-04:00') })
  Group = (await import('../../src/pages/Group.jsx')).default
})

// rpc name → result data
function rpcs(map) {
  sb.supabase.rpc.mockImplementation(async (name, args) => {
    const r = map[name]
    return typeof r === 'function' ? r(args) : { data: r ?? null, error: null }
  })
}
const rpcCalls = name => sb.supabase.rpc.mock.calls.filter(c => c[0] === name).map(c => c[1])
const me = { nickname: 'sam', on_leaderboard: true }

beforeEach(() => {
  sb.reset()
  localStorage.clear()
  sb.set('social_profiles', { data: me, error: null })
  sb.set('monthly_scores', { data: [], error: null })
  rpcs({})
})

describe('levels and trophies', () => {
  it('levels go up with lifetime points, three stars each', () => {
    expect(levelFor(0)).toMatchObject({ name: 'Rookie', stars: 1, next: 'Regular', toNext: 300 })
    expect(levelFor(250)).toMatchObject({ name: 'Rookie', stars: 3 })
    expect(levelFor(1000)).toMatchObject({ name: 'Athlete', stars: 1 })
    expect(levelFor(9000)).toMatchObject({ name: 'Legend', stars: 3, next: null })
  })

  it('a top-3 month gives a medal, 12 workout days gives the month badge', () => {
    const t = trophiesFrom([
      { month: '2026-09-01', rank: 1, workout_days: 14 },
      { month: '2026-08-01', rank: 7, workout_days: 9 },
      { month: '2026-07-01', rank: null, workout_days: 12 },
    ])
    expect(t.map(x => x.title)).toEqual(['Gold medal', '12-day month', '12-day month'])
  })

  it('nicknames are trimmed, lowercased and lose a leading @', () => {
    expect(cleanNickname('  @Sam_Lifts ')).toBe('sam_lifts')
  })

  it('counts today in the days left', () => {
    expect(daysLeftInMonth(new Date(2026, 9, 31))).toBe(1)
    expect(daysLeftInMonth(new Date(2026, 9, 23))).toBe(9)
  })
})

describe('Train together tabs', () => {
  it('asks for a nickname first and saves it', async () => {
    sb.set('social_profiles', q => sb.op(q, 'upsert')
      ? { data: { nickname: 'new_name', on_leaderboard: true }, error: null }
      : { data: null, error: null })
    render(<Group session={{ name: 'Sam' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    expect(await screen.findByText('Pick a nickname')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nickname'), '@New_Name')
    await userEvent.click(screen.getByRole('button', { name: 'Save nickname' }))
    const upsert = sb.queriesFor('social_profiles').map(q => sb.op(q, 'upsert')).find(Boolean)
    expect(upsert[0]).toMatchObject({ nickname: 'new_name' })
    expect(await screen.findByText('Add friends to compete')).toBeInTheDocument() // the leaderboard opens
  })

  it('says when a nickname is taken', async () => {
    sb.set('social_profiles', q => sb.op(q, 'upsert')
      ? { data: null, error: { code: '23505', message: 'duplicate key' } }
      : { data: null, error: null })
    render(<Group session={{ name: 'Sam' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Friends' }))
    await userEvent.type(await screen.findByLabelText('Nickname'), 'taken')
    await userEvent.click(screen.getByRole('button', { name: 'Save nickname' }))
    expect(await screen.findByText('That nickname is taken')).toBeInTheDocument()
  })

  it('shows this month on the leaderboard: points, place, target and the friends ranking', async () => {
    rpcs({
      my_points: [{ points: 140, workout_days: 8, full_weeks: 2, prs: 0, together: 0, lifetime: 450 }],
      leaderboard: ({ p_scope }) => ({ data: p_scope === 'friends' ? [
        { place: 1, nickname: 'alex', points: 210, workout_days: 12, lifetime: 1200, medals: 1, is_me: false },
        { place: 2, nickname: 'sam', points: 140, workout_days: 8, lifetime: 450, medals: 0, is_me: true },
      ] : [], error: null }),
    })
    render(<Group session={{ name: 'Sam' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    const board = await screen.findByRole('list', { name: 'Friends leaderboard' })
    expect(within(board).getByText('@alex')).toBeInTheDocument()
    expect(screen.getAllByText('140')).toHaveLength(2)        // my points: the big number and my row
    expect(screen.getByText('#2')).toBeInTheDocument()        // my place among friends
    expect(screen.getByText('8/12')).toBeInTheDocument()
    expect(screen.getByText('4 more workout days for the October badge')).toBeInTheDocument()
    expect(screen.getByText('October 2026 · 9 days left')).toBeInTheDocument()
    expect(rpcCalls('leaderboard')[0]).toEqual({ p_scope: 'friends' })
  })

  it('lets you hide yourself from the Everyone board', async () => {
    rpcs({ my_points: [{ points: 0, workout_days: 0, lifetime: 0 }], leaderboard: [] })
    render(<Group session={{ name: 'Sam' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Everyone' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Show me on Everyone' }))
    const update = sb.queriesFor('social_profiles').map(q => sb.op(q, 'update')).find(Boolean)
    expect(update).toEqual([{ on_leaderboard: false }])
  })

  it('adds a friend by nickname and accepts a request', async () => {
    rpcs({
      my_friends: [{ id: 'f1', nickname: 'jo', status: 'pending', incoming: true }],
      send_friend_request: 'pending',
    })
    render(<Group session={{ name: 'Sam' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Friends' }))
    expect(await screen.findByText('@sam')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Friend's nickname"), '@Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Request sent to @alex')).toBeInTheDocument()
    expect(rpcCalls('send_friend_request')).toEqual([{ p_nickname: 'alex' }])
    await userEvent.click(screen.getByRole('button', { name: 'Accept @jo' }))
    expect(rpcCalls('respond_friend_request')).toEqual([{ p_id: 'f1', p_accept: true }])
  })

  it('shows an invite from a link and adds the person', async () => {
    rpcs({ my_friends: [], send_friend_request: 'friends' })
    const onIntentDone = vi.fn()
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'friends', invite: 'alex' }} onIntentDone={onIntentDone} />)
    expect(await screen.findByText(/invited you to be friends/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add @alex' }))
    expect(rpcCalls('send_friend_request')).toEqual([{ p_nickname: 'alex' }])
    expect(onIntentDone).toHaveBeenCalled()
  })

  it('rooms use the nickname as the name in the room', async () => {
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC123', exercises: [], status: 'lobby' }, error: null })
    sb.set('group_participants', { data: [], error: null })
    sb.set('group_sets', { data: [], error: null })
    render(<Group session={{ name: 'Sam Real' }} />)
    await screen.findByText('Host a room')
    await vi.waitFor(() => expect(sb.queriesFor('social_profiles').length).toBeGreaterThan(0))
    await new Promise(r => setTimeout(r, 0))
    await userEvent.click(screen.getByRole('button', { name: 'Create a room' }))
    const join = sb.queriesFor('group_participants').map(q => sb.op(q, 'insert')).find(Boolean)
    expect(join[0]).toMatchObject({ display_name: 'sam' })
  })
})
