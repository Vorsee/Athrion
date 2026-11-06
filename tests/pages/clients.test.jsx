// Coaches and their clients (031): the invite, the coach's client page, and the client's Train
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let Clients, JoinTrainerSheet, TrainerCard
beforeAll(async () => {
  Clients = (await import('../../src/pages/Clients.jsx')).default
  JoinTrainerSheet = (await import('../../src/components/JoinTrainerSheet.jsx')).default
  TrainerCard = (await import('../../src/components/TrainerCard.jsx')).default
})
beforeEach(() => { sb.reset(); localStorage.clear() })

const rpc = map => sb.supabase.rpc.mockImplementation(async (name, args) => ({ data: typeof map[name] === 'function' ? map[name](args) : map[name] ?? null, error: null }))
const coach = { user_id: USER.id, display_name: 'Coach Dana', status: 'approved', specialties: ['Strength'], bio: '', credentials: '', links: '', avatar_path: null, charges_enabled: false }
const client = { client_id: 'c1', name: 'Mia Lopez', nickname: 'mia', goal: 'lose_weight', target_weight_lb: 145, weight_lb: 160, weighed_on: '2026-11-01', workouts_7d: 2, workouts_30d: 9, last_workout: '2026-11-04', open_assignments: 0 }

describe('Coach clients', () => {
  it('lists clients, opens one and sends them a workout', async () => {
    sb.set('coach_profiles', { data: coach, error: null })
    sb.set('coach_assignments', q => (sb.op(q, 'insert') ? { data: { id: 'a1' }, error: null } : { data: [], error: null }))
    rpc({ my_clients: [client], my_client_code: 'abc123def', client_workouts: [], client_weights: [] })
    render(<Clients />)
    await userEvent.click(await screen.findByText('Mia Lopez'))
    expect(await screen.findByText('Nothing assigned yet. It shows on their Train, ready to start.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }))
    await userEvent.type(screen.getByPlaceholderText('Lower body A'), 'Legs')
    await userEvent.type(screen.getByLabelText('Search exercises'), 'Squat')
    await userEvent.click(screen.getAllByRole('button', { name: /^Squat/ })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Send to client' }))
    await waitFor(() => {
      const insert = sb.queriesFor('coach_assignments').map(q => sb.op(q, 'insert')).find(Boolean)
      expect(insert[0]).toMatchObject({ client_id: 'c1', title: 'Legs', exercises: [expect.objectContaining({ name: 'Squat', sets: 3 })] })
    })
  })

  it('asks someone who has not applied to apply first', async () => {
    sb.set('coach_profiles', { data: null, error: null })
    render(<Clients />)
    expect(await screen.findByText(/Apply first; we check every coach/)).toBeInTheDocument()
  })
})

describe('Joining a trainer', () => {
  it('says what the trainer will see, then joins', async () => {
    rpc({ trainer_by_code: [{ coach_id: 'k1', display_name: 'Coach Dana', avatar_path: null, specialties: [] }], my_trainer: [], join_trainer: 'k1' })
    render(<JoinTrainerSheet code="abc123def" onClose={() => {}} />)
    expect(await screen.findByText('Your weigh-ins and your goal')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Train with Coach Dana' }))
    expect(sb.supabase.rpc).toHaveBeenCalledWith('join_trainer', { p_code: 'abc123def' })
    expect(await screen.findByText('Coach Dana is your trainer')).toBeInTheDocument()
  })

  it('says so when the link no longer works', async () => {
    rpc({ trainer_by_code: [] })
    render(<JoinTrainerSheet code="gone12345" onClose={() => {}} />)
    expect(await screen.findByText(/no longer works/)).toBeInTheDocument()
  })
})

describe('From your trainer on Train', () => {
  it('shows open workouts from the trainer, ready to start', async () => {
    rpc({ my_trainer: [{ coach_id: 'k1', display_name: 'Coach Dana' }] })
    sb.set('coach_assignments', { data: [{ id: 'a1', title: 'Legs', day: null, note: 'Easy week', exercises: [{ name: 'Squat', sets: 3, reps: '5' }] }], error: null })
    const start = vi.fn()
    render(<TrainerCard onStart={start} />)
    expect(await screen.findByText('Legs')).toBeInTheDocument()
    expect(screen.getByText('Easy week')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
  })

  it('shows nothing without a trainer', async () => {
    rpc({ my_trainer: [] })
    const { container } = render(<TrainerCard onStart={() => {}} />)
    await waitFor(() => expect(sb.supabase.rpc).toHaveBeenCalledWith('my_trainer', undefined))
    expect(container).toBeEmptyDOMElement()
  })
})
