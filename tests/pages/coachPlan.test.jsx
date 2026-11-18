// The coach and club plan (039): templates and sending to several clients, clubs on the
// leaderboard, the upgrade sheet's two plans, and swimmers waiting on a parent's OK
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))
// The plan's own behaviour, as it will be once on sale (it's hidden until then: upgradeSheet.test.jsx)
vi.mock('../../src/lib/pricing.js', async orig => ({ ...(await orig()), COACH_PLAN_ON_SALE: true }))

let Clients, LeaderboardTab, UpgradeSheet, JoinClubSheet
beforeAll(async () => {
  Clients = (await import('../../src/pages/Clients.jsx')).default
  LeaderboardTab = (await import('../../src/components/Social.jsx')).LeaderboardTab
  UpgradeSheet = (await import('../../src/components/UpgradeSheet.jsx')).default
  JoinClubSheet = (await import('../../src/components/Clubs.jsx')).JoinClubSheet
})
beforeEach(() => { sb.reset(); localStorage.clear() })

const rpc = map => sb.supabase.rpc.mockImplementation(async (name, args) => ({ data: typeof map[name] === 'function' ? map[name](args) : map[name] ?? null, error: null }))
const coach = { user_id: USER.id, display_name: 'Coach Dana', status: 'approved', specialties: ['Strength'], bio: '', credentials: '', links: '', avatar_path: null, charges_enabled: false }
const client = (id, name) => ({ client_id: id, name, nickname: name.toLowerCase(), goal: 'build_muscle', workouts_7d: 1, workouts_30d: 4, last_workout: '2026-11-10', open_assignments: 0 })

describe('Workout templates (coach plan)', () => {
  it('starts from a template, sends it to two clients and saves a new one', async () => {
    sb.set('coach_profiles', { data: coach, error: null })
    sb.set('coach_assignments', q => (sb.op(q, 'insert') ? { data: { id: 'a1' }, error: null } : { data: [], error: null }))
    sb.set('coach_templates', q => (sb.op(q, 'insert') ? { data: { id: 't2' }, error: null }
      : { data: [{ id: 't1', title: 'Legs A', note: 'Slow lowering', exercises: [{ name: 'Squat', sets: 4, reps: '6-8', restSeconds: 120 }] }], error: null }))
    rpc({ my_clients: [client('c1', 'Mia'), client('c2', 'Leo')], my_client_code: 'abc123def', client_workouts: [], client_weights: [] })
    render(<Clients coachPlan onCoachPlan={() => {}} />)
    expect(await screen.findByText('Legs A')).toBeInTheDocument() // the template list on Clients
    await userEvent.click(await screen.findByText('Mia'))
    await userEvent.click(await screen.findByRole('button', { name: 'Assign' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Legs A' }))
    expect(screen.getByPlaceholderText('Lower body A')).toHaveValue('Legs A')
    await userEvent.click(screen.getByRole('button', { name: 'Leo' }))
    await userEvent.click(screen.getByLabelText('Save as a template too'))
    await userEvent.click(screen.getByRole('button', { name: 'Send to 2 clients' }))
    await waitFor(() => {
      const sent = sb.queriesFor('coach_assignments').map(q => sb.op(q, 'insert')?.[0]).filter(Boolean)
      expect(sent.map(r => r.client_id)).toEqual(['c1', 'c2'])
      expect(sent[0].exercises).toEqual([expect.objectContaining({ name: 'Squat', sets: 4, reps: '6-8', restSeconds: 120 })])
    })
    const saved = sb.queriesFor('coach_templates').map(q => sb.op(q, 'insert')?.[0]).filter(Boolean)
    expect(saved[0]).toMatchObject({ coach_id: USER.id, title: 'Legs A' })
  })

  it('points to the plan without it, and sends to one client only', async () => {
    sb.set('coach_profiles', { data: coach, error: null })
    rpc({ my_clients: [client('c1', 'Mia'), client('c2', 'Leo')], my_client_code: 'abc123def', client_workouts: [], client_weights: [] })
    const onCoachPlan = vi.fn()
    render(<Clients onCoachPlan={onCoachPlan} />)
    await userEvent.click(await screen.findByRole('button', { name: 'See the plan' }))
    expect(onCoachPlan).toHaveBeenCalled()
    await userEvent.click(await screen.findByText('Mia'))
    await userEvent.click(await screen.findByRole('button', { name: 'Assign' }))
    expect(screen.queryByText('Also send to')).toBeNull()
    expect(screen.queryByLabelText('Save as a template too')).toBeNull()
  })
})

describe('Clubs on the leaderboard', () => {
  const me = { nickname: 'sam', on_leaderboard: true }
  it("lists the clubs and shows a club's own board", async () => {
    rpc({
      my_points: [{ points: 40, workout_days: 4, full_weeks: 0, prs: 0, together: 0, lifetime: 40 }],
      leaderboard: [{ place: 1, nickname: 'sam', points: 40, workout_days: 4, lifetime: 40, medals: 0, is_me: true }],
      my_clubs: [{ id: 'k1', name: 'Run club', code: 'abcd1234', members: 3, is_owner: true, owner: 'sam' }],
      club_board: [
        { place: 1, nickname: 'ana', points: 60, workout_days: 6, is_me: false, is_owner: false },
        { place: 2, nickname: 'sam', points: 40, workout_days: 4, is_me: true, is_owner: true },
      ],
    })
    sb.set('monthly_scores', { data: [], error: null })
    render(<LeaderboardTab me={me} onMeChange={() => {}} coachPlan />)
    expect(await screen.findByText('Clubs')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Board' }))
    expect(await screen.findByRole('list', { name: 'Run club leaderboard' })).toBeInTheDocument()
    expect(sb.supabase.rpc).toHaveBeenCalledWith('club_board', { p_club: 'k1' })
    expect(screen.getByText('@ana')).toBeInTheDocument()
  })

  it('offers the coach plan to make a club, and stays quiet before 039 runs', async () => {
    rpc({ my_clubs: [] })
    const onCoachPlan = vi.fn()
    const { unmount } = render(<LeaderboardTab me={me} onMeChange={() => {}} onCoachPlan={onCoachPlan} />)
    await userEvent.click(await screen.findByRole('button', { name: 'See the coach and club plan' }))
    expect(onCoachPlan).toHaveBeenCalled()
    unmount()

    sb.supabase.rpc.mockImplementation(async name => (name === 'my_clubs' ? { data: null, error: { code: 'PGRST202', message: 'not found' } } : { data: [], error: null }))
    render(<LeaderboardTab me={me} onMeChange={() => {}} />)
    await waitFor(() => expect(sb.supabase.rpc).toHaveBeenCalledWith('my_clubs', undefined))
    expect(screen.queryByText('Clubs')).toBeNull()
  })

  it('joins from an invite link after showing who it is', async () => {
    rpc({ club_preview: [{ name: 'Run club', owner: 'ana', members: 12, joined: false }], join_club: [{ id: 'k1', name: 'Run club' }] })
    const onJoined = vi.fn()
    render(<JoinClubSheet code="abcd1234" onClose={() => {}} onJoined={onJoined} />)
    expect(await screen.findByText('Run club')).toBeInTheDocument()
    expect(screen.getByText(/@ana's club · 12 of 50/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }))
    expect(sb.supabase.rpc).toHaveBeenCalledWith('join_club', { p_code: 'abcd1234' })
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith({ id: 'k1', name: 'Run club' }))
  })
})

describe('Upgrade sheet', () => {
  it('sells the coach plan on its own tab, and switches a paying member in place', async () => {
    const onCheckout = vi.fn()
    sb.set('subscriptions', { data: { stripe_customer_id: 'cus_1' }, error: null })
    render(<UpgradeSheet onClose={() => {}} onCheckout={onCheckout} initialKind="coach" isPro />)
    expect(screen.getByText('Clubs up to 50 people')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to the coach plan' }))
    expect(onCheckout).toHaveBeenCalledWith('coach_annual')
  })

  it('shows nothing to buy under 16', () => {
    render(<UpgradeSheet onClose={() => {}} onCheckout={() => {}} minor />)
    expect(screen.getByRole('status')).toHaveTextContent("can't be bought on an account under 16")
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText(/free trial/)).toBeNull()
  })
})

describe('Swimmers waiting on a parent', () => {
  it("tells the team's coach a teen from their link is waiting, and says so to the teen", async () => {
    const { rememberSwimInvite } = await import('../../src/lib/swim.js')
    const ParentGate = (await import('../../src/components/ParentGate.jsx')).default
    rememberSwimInvite('team123abc')
    render(<ParentGate consent={{ status: 'pending', parent_email: 'mum@example.com', child_age: 14 }} />)
    await waitFor(() => expect(sb.supabase.rpc).toHaveBeenCalledWith('note_swim_waiting', { p_code: 'team123abc' }))
    expect(screen.getByText(/Your swim coach can see your nickname/)).toBeInTheDocument()
  })
})
