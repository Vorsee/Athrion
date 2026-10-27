// Coaches and the shop (014), and Train together rooms planned set by set (013)
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    render(<Group session={{ name: 'Sam' }} />)
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
    render(<Group session={{ name: 'Sam' }} />)
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
    expect(body.content.exercises[0]).toMatchObject({ name: 'Front Squat', sets: 3, reps: '8-12', restSeconds: 90, tip: 'Brace first.' })
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
