// Deeper flows on Progress, Group and the barcode scanner
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))
vi.mock('../../src/lib/exerciseDb.js', () => ({ findDemo: vi.fn(async () => null), findAlternatives: vi.fn(async () => []), imageUrl: p => p, youtubeSearchUrl: () => '#' }))

let Progress, Group, BarcodeScanner
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00-04:00') })
  Progress = (await import('../../src/pages/Progress.jsx')).default
  Group = (await import('../../src/pages/Group.jsx')).default
  BarcodeScanner = (await import('../../src/components/BarcodeScanner.jsx')).default
})
beforeEach(() => {
  sb.reset()
  global.ResizeObserver = class { observe() {} disconnect() {} }
  for (const t of ['workout_logs', 'user_badges', 'body_measurements', 'progress_checkins', 'daily_health', 'progress_photos', 'reminder_settings'])
    sb.set(t, { data: [], error: null })
})

describe('Progress', () => {
  const history = [
    { created_at: '2026-10-13T10:00:00-04:00', date: '2026-10-13', volume: 4000, sets: [{ ex: 'Squat', weight: 200, reps: 5 }] },
    { created_at: '2026-10-20T10:00:00-04:00', date: '2026-10-20', volume: 4200, sets: [{ ex: 'Squat', weight: 210, reps: 5 }] },
  ]
  it('logs a body weight entry', async () => {
    sb.set('body_measurements', q => q.ops.some(o => o[0] === 'upsert') ? { data: { id: 'm1', date: '2026-10-23', weight_lb: 179 }, error: null } : { data: [], error: null })
    render(<Progress />)
    await userEvent.click(await screen.findByText('Body'))
    await userEvent.type(screen.getByLabelText('Weight (lb)'), '179')
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(sb.queriesFor('body_measurements').some(q => sb.op(q, 'upsert'))).toBe(true))
    const row = sb.op(sb.queriesFor('body_measurements').find(q => sb.op(q, 'upsert')), 'upsert')[0]
    expect(row).toMatchObject({ weight_lb: 179, user_id: USER.id })
  })
  it('shows lift history and records', async () => {
    sb.set('workout_logs', { data: history, error: null })
    render(<Progress />)
    await userEvent.click(await screen.findByText('Lifts'))
    expect((await screen.findAllByText('Squat')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/210/).length).toBeGreaterThan(0)
  })
  it('opens the photos and health tabs', async () => {
    render(<Progress />)
    await userEvent.click(await screen.findByText('Photos'))
    expect(await screen.findByText('Add a photo')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Health'))
    expect(await screen.findByText('Steps')).toBeInTheDocument()
  })
  it('awards badges earned from history', async () => {
    sb.set('workout_logs', { data: history, error: null })
    render(<Progress />)
    await waitFor(() => expect(sb.queriesFor('user_badges').some(q => sb.op(q, 'upsert'))).toBe(true))
    const ids = sb.op(sb.queriesFor('user_badges').find(q => sb.op(q, 'upsert')), 'upsert')[0].map(r => r.badge_id)
    expect(ids).toEqual(expect.arrayContaining(['first_workout', 'first_pr']))
  })
})

describe('Group', () => {
  it('hosts a session and shows the room code', async () => {
    sb.set('group_sessions', { data: { id: 's1', code: 'ABC234', host_id: USER.id, status: 'lobby', exercises: [], total_sets: 3, rest_secs: 60 }, error: null })
    sb.set('group_participants', q => q.ops.some(o => o[0] === 'insert') ? { data: null, error: null } : { data: [{ user_id: USER.id, display_name: 'Sam' }], error: null })
    render(<Group session={{ name: 'Sam', email: USER.email }} />)
    await userEvent.click(screen.getByText('Create a room'))
    expect(await screen.findByText('Room code')).toBeInTheDocument()
    expect(screen.getByText('ABC234')).toBeInTheDocument()
    expect(sb.op(sb.queriesFor('group_sessions')[0], 'insert')[0]).toMatchObject({ host_id: USER.id, status: 'lobby' })
  })
})

describe('BarcodeScanner', () => {
  const meals = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }]
  it('looks up a typed barcode on Open Food Facts and adds the scaled food', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: 1, product: { product_name: 'Greek Yogurt', brands: 'Fage, Other', serving_quantity: '170', serving_size: '170 g', nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 4, fat_100g: 5 } } }) }))
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<BarcodeScanner meals={meals} defaultMeal="breakfast" onAdd={onAdd} onClose={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText('Or type the barcode number'), '5201054017');
    await userEvent.click(screen.getByText('Look up'))
    expect(await screen.findByText('Fage Greek Yogurt')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain('/product/5201054017.json')
    const add = screen.getAllByRole('button').find(b => /add/i.test(b.textContent))
    await userEvent.click(add)
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: 'Fage Greek Yogurt (170 g)', kcal: 165, meal: 'breakfast' }) // one 170 g serving
    vi.unstubAllGlobals()
  })
  it('says when a product is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 0 }) })))
    render(<BarcodeScanner meals={meals} defaultMeal="lunch" onAdd={() => {}} onClose={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText('Or type the barcode number'), '00000000') // 8 digits minimum
    await userEvent.click(screen.getByText('Look up'))
    expect(await screen.findByText(/isn't in the Open Food Facts database/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
