// Coaches and the shop (014), and Train together rooms planned set by set (013)
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let Group, Shop, Coach
beforeAll(async () => {
  Group = (await import('../../src/pages/Group.jsx')).default
  Shop = (await import('../../src/components/Shop.jsx')).default
  Coach = (await import('../../src/pages/Coach.jsx')).default
})
beforeEach(() => {
  sb.reset()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const single = q => q.ops.some(o => o[0] === 'maybeSingle' || o[0] === 'single')
const updates = table => sb.queriesFor(table).map(q => sb.op(q, 'update')?.[0]).filter(Boolean)

describe('Train together: sets one by one', () => {
  beforeEach(() => {
    sb.set('social_profiles', { data: { nickname: 'sam' }, error: null })
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'lobby', exercises: [], total_sets: 3, rest_secs: 60 }, error: null })
    sb.set('group_participants', q => (sb.op(q, 'insert') ? { data: null, error: null } : { data: [{ user_id: USER.id, display_name: 'sam' }], error: null }))
    sb.set('group_sets', { data: [], error: null })
  })

  it('lets the host add and remove sets, and give each its own reps and rest', async () => {
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.click(screen.getByText('Create a room'))
    await screen.findByText('Room code')
    await userEvent.type(screen.getByPlaceholderText('Search exercises'), 'Front Squat')
    const row = (await screen.findAllByText('Front Squat')).at(-1).closest('div.flex')
    await userEvent.click(within(row.parentElement).getByRole('button', { name: /add/i }))
    expect(updates('group_sessions').at(-1).plan).toEqual([{ name: 'Front Squat', sets: [{ reps: null, rest: 60 }, { reps: null, rest: 60 }, { reps: null, rest: 60 }] }])

    await userEvent.click(screen.getByRole('button', { name: 'Edit sets' }))
    await userEvent.type(screen.getByLabelText('Front Squat, set 1 reps target'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Front Squat, rest after set 1'), '120')
    await userEvent.click(screen.getByRole('button', { name: 'Add set' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove set 2 of Front Squat' }))

    const saved = updates('group_sessions').at(-1)
    expect(saved.plan[0].sets).toEqual([{ reps: 5, rest: 120 }, { reps: null, rest: 60 }, { reps: null, rest: 60 }])
    expect(saved).toMatchObject({ exercises: ['Front Squat'], total_sets: 3, rest_secs: 120 })
    expect(screen.getByText('End of workout')).toBeInTheDocument() // no rest after the very last set
  })

  it('shows the set target and the rest that follows while training', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 150 }, { reps: 3, rest: 60 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'lobby', plan, exercises: ['Front Squat'], total_sets: 2, rest_secs: 150 }, error: null })
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.click(screen.getByText('Create a room'))
    await screen.findByText('Room code')
    // A new room starts empty; reload it as joined to pick up the saved plan
    await userEvent.type(screen.getByPlaceholderText('Search exercises'), 'Front Squat')
    const row = (await screen.findAllByText('Front Squat')).at(-1).closest('div.flex')
    await userEvent.click(within(row.parentElement).getByRole('button', { name: /add/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit sets' }))
    await userEvent.type(screen.getByLabelText('Front Squat, set 1 reps target'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Front Squat, rest after set 1'), '150')
    await userEvent.click(screen.getByText('Start workout'))
    expect(await screen.findByText('Target 5 reps')).toBeInTheDocument()
    expect(screen.getByText('Then rest 2m 30s')).toBeInTheDocument()
    expect(screen.getByText('Set 1 of 3')).toBeInTheDocument()
  })

  it('runs a free workout: the host sets sets and rest, then picks each exercise for the room', async () => {
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.click(screen.getByText('Create a room'))
    await screen.findByText('Room code')
    await userEvent.click(screen.getByRole('radio', { name: 'Free workout' }))
    expect(screen.queryByPlaceholderText('Search exercises')).toBeNull() // no list to plan
    await userEvent.click(screen.getByRole('radio', { name: '4' }))
    await userEvent.click(screen.getByRole('radio', { name: '90s' }))
    const saved = updates('group_sessions').at(-1)
    expect(saved.plan).toEqual([{ free: true, sets: Array(4).fill({ reps: null, rest: 90 }) }])
    expect(saved.exercises).toEqual([])

    await userEvent.click(screen.getByText('Start workout'))
    expect(await screen.findByText('First exercise')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Search exercises'), 'Front Squat')
    await userEvent.click(screen.getByRole('button', { name: 'Go: Front Squat' }))
    expect(await screen.findByText('Set 1 of 4')).toBeInTheDocument()
    expect(screen.getByText('Then rest 1m 30s')).toBeInTheDocument()
    // The pick is saved with the room, so everyone else does it too
    await vi.waitFor(() => expect(updates('group_sessions').at(-1).plan[0].picks).toEqual(['Front Squat']))

    // Before a set, the host can swap it: the pick is replaced, not added
    await userEvent.click(screen.getByRole('button', { name: 'Change exercise' }))
    expect(await screen.findByRole('button', { name: 'Keep Front Squat' })).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Search exercises'), 'Deadlift')
    await userEvent.click(screen.getByRole('button', { name: 'Go: Deadlift' }))
    await vi.waitFor(() => expect(updates('group_sessions').at(-1).plan[0].picks).toEqual(['Deadlift']))
  })

  it("free workout: a guest waits for the host's pick, then does that exercise", async () => {
    const room = picks => ({ id: 's1', code: 'ABC234', host_id: 'host-1', status: 'active', plan: [{ free: true, sets: Array(3).fill({ reps: null, rest: 60 }), ...(picks && { picks }) }], exercises: [], total_sets: 3, rest_secs: 60 })
    let current = room(null)
    sb.set('group_sessions', () => ({ data: current, error: null }))
    sb.set('group_participants', q => (sb.op(q, 'insert') ? { data: null, error: null } : { data: [{ user_id: USER.id, display_name: 'sam' }, { user_id: 'host-1', display_name: 'alex' }], error: null }))
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'picker', isHost: false, exIdx: 0, setIdx: 0, startTime: Date.now() }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    expect(await screen.findByText('Waiting for @alex')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search exercises')).toBeNull() // guests don't pick

    current = room(['Front Squat'])
    expect(await screen.findByText('Set 1 of 3', {}, { timeout: 5000 })).toBeInTheDocument() // the next poll brings the pick
    expect(screen.getAllByText('Front Squat').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Skip it, just for me' })).toBeInTheDocument()

    // A set logged, then the host swaps the exercise: mine stays as I did it
    await userEvent.type(screen.getByLabelText('Reps'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Log set 1' }))
    current = room(['Deadlift'])
    await new Promise(r => setTimeout(r, 3300)) // the next poll
    expect(screen.queryByText('Deadlift')).toBeNull()
    expect(screen.getAllByText(/Front Squat/).length).toBeGreaterThan(0)
  }, 15000)

  it('edits a set already logged in the room, and asks before finishing', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 0 }, { reps: 5, rest: 0 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'active', plan, exercises: ['Front Squat'], total_sets: 2, rest_secs: 0 }, error: null })
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'training', isHost: true, exIdx: 0, setIdx: 0, startTime: Date.now() }))
    sb.set('group_sets', q => {
      const row = sb.op(q, 'insert')?.[0]
      if (row) return { data: { ...row, id: 'r1', logged_at: new Date().toISOString() }, error: null }
      const patch = sb.op(q, 'update')?.[0]
      if (patch) return { data: { id: 'r1', session_id: 's1', user_id: USER.id, exercise: 'Front Squat', set_num: 1, ...patch }, error: null }
      return { data: [], error: null }
    })
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.type(await screen.findByLabelText('Reps'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Log set 1' }))
    await userEvent.click(await screen.findByRole('button', { name: /Your sets/ }))
    await vi.waitFor(() => expect(screen.queryByText('waiting')).toBeNull()) // sent
    await userEvent.click(screen.getByRole('button', { name: 'Edit Front Squat, set 1' }))
    const sheet = await screen.findByRole('dialog', { name: 'Front Squat, set 1' })
    const reps = within(sheet).getByLabelText('Reps')
    await userEvent.clear(reps); await userEvent.type(reps, '6')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save set' }))
    await vi.waitFor(() => {
      const patch = sb.queriesFor('group_sets').map(q => sb.op(q, 'update')?.[0]).find(Boolean)
      expect(patch).toEqual({ weight: 0, reps: 6 })
    })

    await userEvent.click(screen.getAllByRole('button', { name: /End workout early/ }).at(-1))
    expect(await screen.findByRole('dialog', { name: 'Finish the workout?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep going' }))
    expect(screen.queryByRole('dialog', { name: 'Finish the workout?' })).toBeNull()
  })

  it('free workout: the host moves the room on without logging a set', async () => {
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.click(screen.getByText('Create a room'))
    await screen.findByText('Room code')
    await userEvent.click(screen.getByRole('radio', { name: 'Free workout' }))
    await userEvent.click(screen.getByText('Start workout'))
    await userEvent.type(await screen.findByPlaceholderText('Search exercises'), 'Front Squat')
    await userEvent.click(screen.getByRole('button', { name: 'Go: Front Squat' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Next exercise' }))
    // On to the picker for the second pick; Front Squat stays in the room's list
    expect(await screen.findByRole('heading', { name: 'Next exercise' })).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Search exercises'), 'Deadlift')
    await userEvent.click(screen.getByRole('button', { name: 'Go: Deadlift' }))
    await vi.waitFor(() => expect(updates('group_sessions').at(-1).plan[0].picks).toEqual(['Front Squat', 'Deadlift']))
  })

  it('keeps a set logged without signal and sends it once back online', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 60 }, { reps: 5, rest: 60 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'active', plan, exercises: ['Front Squat'], total_sets: 2, rest_secs: 60 }, error: null })
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'training', isHost: true, exIdx: 0, setIdx: 0, startTime: Date.now() }))
    let signal = false
    sb.set('group_sets', q => {
      const row = sb.op(q, 'insert')?.[0]
      if (!row) return { data: [], error: null }
      return signal ? { data: { ...row, id: 'r1' }, error: null } : { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
    })
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    await userEvent.type(await screen.findByLabelText('Reps'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Log set 1' }))
    expect(await screen.findByText(/1 set waiting for signal/)).toBeInTheDocument()
    const queued = JSON.parse(localStorage.getItem('athrion_room_sets'))
    expect(queued).toMatchObject([{ sessionId: 's1', setNum: 1, reps: 5 }])

    signal = true
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(screen.queryByText(/waiting for signal/)).toBeNull())
    expect(localStorage.getItem('athrion_room_sets')).toBeNull()
    const sent = sb.queriesFor('group_sets').map(q => sb.op(q, 'insert')?.[0]).filter(Boolean)
    expect(new Set(sent.map(r => r.client_id))).toEqual(new Set([queued[0].clientId])) // one set, however often it was tried
  })

  it("opens a room from Train's Train together with the workout picked, and the share sheet", async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 120 }] }]
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms', host: { plan } }} onIntentDone={() => {}} />)
    expect(await screen.findByText('Room code')).toBeInTheDocument()
    await vi.waitFor(() => expect(updates('group_sessions').at(-1)?.plan).toEqual(plan))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/\/r\/ABC234$/) }))
  })

  it('joins the room from a room link', async () => {
    sb.supabase.rpc.mockImplementation(async fn => (fn === 'join_group_session'
      ? { data: { id: 's1', code: 'K7M4QX', host_id: 'other', status: 'lobby', plan: [] }, error: null }
      : { data: [], error: null }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms', join: 'K7M4QX' }} onIntentDone={() => {}} />)
    expect(await screen.findByText('Room code')).toBeInTheDocument()
    expect(sb.supabase.rpc).toHaveBeenCalledWith('join_group_session', expect.objectContaining({ p_code: 'K7M4QX' }))
  })

  it("shows partners' sets, sends a reaction, and pops a note when someone reacts to mine", async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 60 }, { reps: 5, rest: 60 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'active', plan, exercises: ['Front Squat'], total_sets: 2, rest_secs: 60 }, error: null })
    const now = new Date().toISOString()
    sb.set('group_sets', { data: [
      { id: 'g1', session_id: 's1', user_id: 'x2', display_name: 'alex', exercise: 'Front Squat', set_num: 1, weight: 200, reps: 5, logged_at: now },
      { id: 'g2', session_id: 's1', user_id: USER.id, display_name: 'sam', exercise: 'Front Squat', set_num: 1, weight: 150, reps: 5, logged_at: now },
    ], error: null })
    sb.set('group_reactions', q => (sb.op(q, 'insert') ? { data: { ...sb.op(q, 'insert')[0], id: 'r1' }, error: null } : { data: [], error: null }))
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'training', isHost: true, exIdx: 0, setIdx: 1, startTime: Date.now() }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    const feed = await screen.findByRole('list', { name: "Partners' latest sets" })
    expect(within(feed).getByText(/alex/)).toBeInTheDocument()
    expect(within(feed).queryByText(/sam/)).toBeNull() // only partners' sets
    await userEvent.click(within(feed).getByRole('button', { name: 'Like' }))
    const sent = sb.queriesFor('group_reactions').map(q => sb.op(q, 'insert')?.[0]).find(Boolean)
    expect(sent).toMatchObject({ session_id: 's1', set_id: 'g1', to_user: 'x2', from_user: USER.id, kind: 'like' })
    expect(await within(feed).findByRole('button', { name: 'Like, 1' })).toHaveAttribute('aria-pressed', 'true')

    const onReaction = sb.channel.on.mock.calls.find(c => c[1].table === 'group_reactions')[2]
    act(() => onReaction({ new: { id: 'r9', session_id: 's1', set_id: 'g2', from_user: 'x2', to_user: USER.id, from_name: 'alex', kind: 'laugh', created_at: now } }))
    expect(await screen.findByText(/laughed at your front squat set/)).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalled()
  })

  it('books the same time next week for everyone, and shows who to beat', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 60 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: 'other', status: 'active', plan, exercises: ['Front Squat'], total_sets: 1, rest_secs: 60 }, error: null })
    sb.set('group_participants', { data: [{ user_id: USER.id, display_name: 'sam' }, { user_id: 'x2', display_name: 'alex' }], error: null })
    sb.set('group_sets', { data: [
      { id: 'g1', session_id: 's1', user_id: 'x2', display_name: 'alex', exercise: 'Front Squat', set_num: 1, weight: 200, reps: 5, logged_at: new Date().toISOString() },
      { id: 'g2', session_id: 's1', user_id: USER.id, display_name: 'sam', exercise: 'Front Squat', set_num: 1, weight: 150, reps: 5, logged_at: new Date().toISOString() },
    ], error: null })
    sb.supabase.rpc.mockImplementation(async fn => ({ data: fn === 'schedule_next_session' ? 'n1' : [], error: null }))
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'training', isHost: false, exIdx: 0, setIdx: 0, startTime: Date.now() - 5 * 3600e3 }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    expect(await screen.findByText('Beat it next time')).toBeInTheDocument()
    expect(screen.getByText('alex is ahead. Your target for next time.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share to your story' })).toBeInTheDocument()
    expect(screen.getByText('Same time next week?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Book it' }))
    expect(await screen.findByText('Booked')).toBeInTheDocument()
    const [, args] = sb.supabase.rpc.mock.calls.find(c => c[0] === 'schedule_next_session')
    expect(args.p_session).toBe('s1')
    expect(new Date(args.p_starts_at).getTime()).toBeGreaterThan(Date.now() + 6 * 864e5)
  })

  it('shows a booked session on Rooms and opens its room an hour before', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 60 }] }]
    sb.supabase.rpc.mockImplementation(async fn => (
      fn === 'my_next_sessions' ? { data: [{ id: 'n1', starts_at: new Date(Date.now() + 20 * 60000).toISOString(), names: ['sam', 'alex'], plan, room_code: null }], error: null }
      : fn === 'set_next_session_room' ? { data: 'ABC234', error: null }
      : { data: [], error: null }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    expect(await screen.findByText(/Up next · In 20 min/)).toBeInTheDocument()
    expect(screen.getByText('With @alex')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open the room' }))
    expect(await screen.findByText('Room code')).toBeInTheDocument()
    expect(sb.supabase.rpc).toHaveBeenCalledWith('set_next_session_room', { p_id: 'n1', p_code: 'ABC234' })
    await vi.waitFor(() => expect(updates('group_sessions').at(-1)?.plan).toEqual(plan))
  })

  it('ends a room workout by itself 4 hours after it started', async () => {
    const plan = [{ name: 'Front Squat', sets: [{ reps: 5, rest: 60 }] }]
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'active', plan, exercises: ['Front Squat'], total_sets: 1, rest_secs: 60 }, error: null })
    localStorage.setItem('athrion_group_session_state', JSON.stringify({ sessionId: 's1', screen: 'training', isHost: true, exIdx: 0, setIdx: 0, startTime: Date.now() - 5 * 3600 * 1000 }))
    render(<Group session={{ name: 'Sam' }} intent={{ tab: 'rooms' }} />)
    expect(await screen.findByText('Ended automatically after 4 hours. Your sets are saved.')).toBeInTheDocument()
    expect(screen.getByText('Duration: 240 min')).toBeInTheDocument()
  })
})

const PID = '11111111-2222-3333-4444-555555555555'
const coach = { user_id: 'coach-1', display_name: 'Maya Strong', bio: 'I coach lifters.', credentials: 'NASM CPT', specialties: ['Strength'], links: '', avatar_path: null, status: 'approved', charges_enabled: true }
const product = { id: PID, coach_id: 'coach-1', kind: 'workout', title: 'Leg day', summary: 'Squats and more', description: '', level: 'Intermediate', price_cents: 1000, minutes: 45, outline: ['Front Squat', 'Lunges'], published: true }
const content = { exercises: [{ name: 'Front Squat', sets: 4, reps: '5', restSeconds: 150, tip: 'Brace first.', video: 'coach-1/vid.mp4' }, { name: 'Lunges', sets: 3, reps: '10', restSeconds: 60, tip: '', video: null }] }

describe('Shop', () => {
  function shopData({ owned = false } = {}) {
    sb.set('coach_profiles', q => ({ data: single(q) ? coach : [coach], error: null }))
    sb.set('coach_products', q => ({ data: single(q) ? product : [product], error: null }))
    sb.set('coach_purchases', { data: owned ? [{ product_id: PID }] : [], error: null })
    sb.set('coach_product_content', { data: owned ? { content } : null, error: null })
  }

  it('lists coaches and what they sell, with a locked preview and the price', async () => {
    shopData()
    render(<Shop onStartPlanDay={() => {}} onOpenCoach={() => {}} />)
    await userEvent.click(await screen.findByText('Maya Strong'))
    expect(screen.getByText('I coach lifters.')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Leg day'))
    expect(await screen.findByRole('button', { name: 'Buy for $10.00' })).toBeInTheDocument()
    expect(screen.getByText("What's inside")).toBeInTheDocument()
    expect(screen.getByText('Lunges')).toBeInTheDocument()
    expect(screen.queryByText('Brace first.')).not.toBeInTheDocument()
  })

  it('sends the buyer to Stripe with only the product id', async () => {
    shopData()
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<Shop onStartPlanDay={() => {}} onOpenCoach={() => {}} intent={{ product: PID }} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy for $10.00' }))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/coach-checkout')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ productId: PID })
  })

  it('opens a bought workout with sets, the coach tips and videos, and starts it', async () => {
    shopData({ owned: true })
    const onStart = vi.fn()
    render(<Shop onStartPlanDay={onStart} onOpenCoach={() => {}} />)
    await userEvent.click((await screen.findAllByText('Leg day'))[0])
    await userEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
    expect(onStart.mock.calls[0][0]).toEqual({
      title: 'Leg day',
      workout: { exercises: [
        { name: 'Front Squat', sets: 4, reps: '5', restSeconds: 150, coachTip: 'Brace first.', coachVideo: 'coach-1/vid.mp4' },
        { name: 'Lunges', sets: 3, reps: '10', restSeconds: 60, coachTip: undefined, coachVideo: undefined },
      ] },
    })
    await userEvent.click(screen.getAllByText('Front Squat').at(-1))
    expect(screen.getByText('Brace first.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Watch how to do it' }))
    expect(sb.bucket.createSignedUrl).toHaveBeenCalledWith('coach-1/vid.mp4', 3600)
  })

  it('invites coaches when the shop is empty', async () => {
    sb.set('coach_profiles', { data: [], error: null })
    sb.set('coach_products', { data: [], error: null })
    sb.set('coach_purchases', { data: [], error: null })
    const onOpenCoach = vi.fn()
    render(<Shop onStartPlanDay={() => {}} onOpenCoach={onOpenCoach} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Become a coach' }))
    expect(onOpenCoach).toHaveBeenCalled()
  })
  it('searches coaches and products by name, title or specialty', async () => {
    shopData()
    render(<Shop onStartPlanDay={() => {}} onOpenCoach={() => {}} />)
    const search = await screen.findByRole('searchbox', { name: 'Search the shop' })
    await userEvent.type(search, 'leg')
    expect(screen.getByText('Leg day')).toBeInTheDocument()
    expect(screen.queryByText('Maya Strong')).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'strength')
    expect(screen.getByText('Maya Strong')).toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'yoga')
    expect(screen.getByText('Nothing matches "yoga".')).toBeInTheDocument()
  })

  it('opens a coach from a shared link and copies their link', async () => {
    shopData()
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    render(<Shop onStartPlanDay={() => {}} onOpenCoach={() => {}} intent={{ coach: 'coach-1' }} />)
    expect(await screen.findByText('I coach lifters.')).toBeInTheDocument()
    expect(screen.getByText('Reviewed coach')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shop/coach/coach-1`)
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  })
})

describe('Shared shop links', () => {
  it('reads product and coach links, and nothing else', async () => {
    const { parseShopPath } = await import('../../src/lib/shopLink.js')
    expect(parseShopPath(`/shop/${PID}`)).toEqual({ kind: 'product', id: PID })
    expect(parseShopPath(`/shop/coach/${PID.toUpperCase()}/`)).toEqual({ kind: 'coach', id: PID })
    expect(parseShopPath('/shop/abc')).toBeNull()
    expect(parseShopPath('/workout')).toBeNull()
  })

  it('shows a signed-out preview and remembers the link through sign-up', async () => {
    const ShopPreview = (await import('../../src/pages/ShopPreview.jsx')).default
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ coach, products: [product] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const onStart = vi.fn()
    render(<ShopPreview link={{ kind: 'product', id: PID }} onStart={onStart} onSignIn={() => {}} onHome={() => {}} />)
    expect(await screen.findByRole('heading', { name: 'Leg day' })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/shop-preview?product=${PID}`)
    expect(screen.getByText('$10.00')).toBeInTheDocument()
    expect(screen.getByText('Lunges')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create a free account to buy' }))
    expect(onStart).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('athrion_shop_link'))).toEqual({ kind: 'product', id: PID })
  })

  it('says so when a shared product is gone', async () => {
    const ShopPreview = (await import('../../src/pages/ShopPreview.jsx')).default
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    render(<ShopPreview link={{ kind: 'product', id: PID }} onStart={() => {}} onSignIn={() => {}} onHome={() => {}} />)
    expect(await screen.findByText('Not available')).toBeInTheDocument()
  })
})

describe('Coach page', () => {
  it('sends an application that only an admin can approve', async () => {
    sb.set('coach_profiles', { data: null, error: null })
    sb.set('app_admins', { data: null, error: null })
    render(<Coach />)
    expect(await screen.findByText('Coach on ATHRION')).toBeInTheDocument()
    const send = screen.getByRole('button', { name: 'Send application' })
    await userEvent.type(screen.getByPlaceholderText('How people will see you'), 'Maya Strong')
    await userEvent.type(screen.getByPlaceholderText('NASM CPT, 6 years coaching'), 'NASM CPT')
    await userEvent.type(screen.getByLabelText(/About you/), 'I have coached lifters for six years.')
    await userEvent.click(screen.getByRole('button', { name: 'Strength' }))
    expect(send).toBeDisabled() // the coach terms aren't ticked yet
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(send)
    const row = sb.op(sb.queriesFor('coach_profiles').find(q => sb.op(q, 'insert')), 'insert')[0]
    expect(row).toEqual({ user_id: USER.id, display_name: 'Maya Strong', bio: 'I have coached lifters for six years.', credentials: 'NASM CPT', specialties: ['Strength'], links: '', avatar_path: null })
    expect(row.status).toBeUndefined()
  })

  it('publishes a free workout with a tip once approved', async () => {
    sb.set('coach_profiles', { data: { ...coach, user_id: USER.id, charges_enabled: false }, error: null })
    sb.set('app_admins', { data: null, error: null })
    sb.set('coach_products', q => ({ data: sb.op(q, 'upsert') ? { id: 'p-new' } : [], error: null }))
    sb.set('coach_purchases', { data: [], error: null })
    sb.set('coach_product_content', { data: null, error: null })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ charges_enabled: false, connected: false }) })))
    render(<Coach />)
    expect(await screen.findByText('Set up payouts')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New workout' }))
    await userEvent.type(screen.getByPlaceholderText('Upper body power'), 'Leg day')
    await userEvent.type(screen.getByLabelText('Add an exercise'), 'Front Squat')
    await userEvent.click(screen.getAllByText('Front Squat').at(-1))
    await userEvent.type(screen.getByPlaceholderText(/What people get wrong/), 'Brace first.')
    await userEvent.click(screen.getByRole('button', { name: 'Publish to the shop' }))

    const saved = sb.op(sb.queriesFor('coach_products').find(q => sb.op(q, 'upsert')), 'upsert')[0]
    expect(saved).toMatchObject({ coach_id: USER.id, kind: 'workout', title: 'Leg day', price_cents: 0, published: true, outline: ['Front Squat'] })
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
    const body = sb.op(sb.queriesFor('coach_product_content')[0], 'upsert')[0]
    expect(body.content.exercises[0]).toMatchObject({ name: 'Front Squat', sets: 3, reps: '5-10', restSeconds: 90, tip: 'Brace first.' })
  })

  it("won't publish a paid workout before payouts are set up", async () => {
    sb.set('coach_profiles', { data: { ...coach, user_id: USER.id, charges_enabled: false }, error: null })
    sb.set('app_admins', { data: null, error: null })
    sb.set('coach_products', { data: [], error: null })
    sb.set('coach_purchases', { data: [], error: null })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ charges_enabled: false }) })))
    render(<Coach />)
    await userEvent.click(await screen.findByRole('button', { name: 'New workout' }))
    await userEvent.type(screen.getByPlaceholderText('Upper body power'), 'Leg day')
    await userEvent.type(screen.getByLabelText('Add an exercise'), 'Front Squat')
    await userEvent.click(screen.getAllByText('Front Squat').at(-1))
    await userEvent.click(screen.getByRole('radio', { name: 'Paid' }))
    expect(screen.getByText(/You get \$7\.99 of each sale/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish to the shop' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
  })

  it('lets an admin approve an application', async () => {
    sb.set('coach_profiles', q => ({ data: single(q) ? { ...coach, user_id: USER.id } : [{ ...coach, status: 'pending', applied_at: '2026-10-26T00:00:00Z' }], error: null }))
    sb.set('app_admins', { data: { user_id: USER.id }, error: null })
    sb.set('coach_products', { data: [], error: null })
    sb.set('coach_purchases', { data: [], error: null })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ charges_enabled: true }) })))
    render(<Coach />)
    await userEvent.click(await screen.findByText('Coach applications'))
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(sb.supabase.rpc).toHaveBeenCalledWith('review_coach', { p_user: 'coach-1', p_status: 'approved', p_note: null })
  })
})
