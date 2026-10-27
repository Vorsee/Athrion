// Smoke and key-flow tests for every other page, plus the App shell.
// "Today" is Friday 23 Oct 2026, 10am New York.
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'
import { planRow, withWorkoutOn, profile, fitnessProfile } from '../helpers/fixtures.js'
import { LEGAL_VERSION } from '../../src/lib/legal.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))
vi.mock('../../src/lib/exerciseDb.js', () => ({ findDemo: vi.fn(async () => null), findAlternatives: vi.fn(async () => []), imageUrl: p => p, youtubeSearchUrl: () => '#' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))

let P = {}
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00-04:00') })
  for (const name of ['Plan', 'Calories', 'Auth', 'Library', 'Group', 'Progress', 'Onboarding', 'FitnessOnboarding']) {
    P[name] = (await import(`../../src/pages/${name}.jsx`)).default
  }
  P.App = (await import('../../src/App.jsx')).default
  P.ProfileModal = (await import('../../src/components/ProfileModal.jsx')).default
})
beforeEach(() => {
  sb.reset()
  global.ResizeObserver = class { observe() {} disconnect() {} }
  window.scrollTo = vi.fn()
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  for (const t of ['workout_logs', 'custom_workouts', 'user_badges', 'calorie_logs', 'body_measurements', 'progress_checkins', 'daily_health', 'progress_photos', 'reminder_settings', 'push_subscriptions'])
    sb.set(t, { data: [], error: null })
})

describe('Plan — Pro lock', () => {
  it('shows free users the real page with a sample plan behind a dark overlay and an upgrade button', async () => {
    const onUpgrade = vi.fn()
    render(<P.Plan isPro={false} onUpgrade={onUpgrade} profile={profile} onGoToWorkout={() => {}} onProfileChange={() => {}} />)
    expect(screen.getByText('Get a plan built for your goal')).toBeInTheDocument()
    expect(screen.getByText('Sample: Muscle Builder')).toBeInTheDocument() // sample plan rendered underneath, labelled
    expect(screen.getByText('Example plan')).toBeInTheDocument()
    expect(screen.getByText('Weekly schedule')).toBeInTheDocument()
    expect(screen.queryByText(/2750/)).toBeNull() // its calories would contradict the person's own targets
    expect(screen.getByText(/\$4\.99 a month or \$49\.99 a year/)).toBeInTheDocument()
    expect(screen.getByText('Sample: Muscle Builder').closest('[inert]')).toHaveAttribute('aria-hidden', 'true')
    expect(sb.queriesFor('fitness_plans')).toHaveLength(0) // no data loaded for free users
    await userEvent.click(screen.getByText('Get Pro'))
    expect(onUpgrade).toHaveBeenCalled()
  })
})

describe('Plan', () => {
  it('asks to create a plan when there is none', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('nutrition_targets', { data: null, error: null })
    render(<P.Plan isPro profile={profile} onGoToWorkout={() => {}} onProfileChange={() => {}} />)
    expect(await screen.findByText('No active plan')).toBeInTheDocument()
  })
  it('shows today as a rest day with Train Anyway, and the weekly schedule', async () => {
    sb.set('fitness_plans', { data: planRow, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('nutrition_targets', { data: { calorie_target: 2500, protein_grams: 180, carb_grams: 280, fat_grams: 70 }, error: null })
    const go = vi.fn()
    render(<P.Plan isPro profile={profile} onGoToWorkout={go} onProfileChange={() => {}} />)
    expect(await screen.findByText('Weekly schedule')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Train anyway'))
    expect(go).toHaveBeenCalled()
    expect(screen.getByText('Daily targets')).toBeInTheDocument()
  })
  it('starts today\'s workout directly from the plan', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('nutrition_targets', { data: null, error: null })
    const start = vi.fn()
    render(<P.Plan isPro profile={profile} onGoToWorkout={() => {}} onStartWorkout={start} onProfileChange={() => {}} />)
    await userEvent.click(await screen.findByText('Start this workout'))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ day: 'Friday', type: 'workout' }))
  })
})

describe('Calories', () => {
  async function addFood(name, kcal) {
    if (!screen.queryByPlaceholderText('Food name')) await userEvent.click((await screen.findAllByText('Add'))[0])
    await userEvent.type(screen.getByPlaceholderText('Food name'), name)
    await userEvent.type(screen.getByPlaceholderText('Calories'), String(kcal))
    const form = screen.getByPlaceholderText('Fat (g)').parentElement
    await userEvent.click([...form.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add'))
  }
  const upserts = () => sb.queriesFor('calorie_logs').filter(q => sb.op(q, 'upsert')).map(q => sb.op(q, 'upsert'))

  it('adds foods and saves today\'s log as one row per day, in order', async () => {
    sb.set('nutrition_targets', { data: null, error: null })
    sb.set('calorie_logs', q => sb.op(q, 'upsert') ? { data: { id: 'c1' }, error: null } : { data: sb.op(q, 'eq') ? null : [], error: null })
    render(<P.Calories profile={profile} isPro onUpgrade={() => {}} onGoToPlan={() => {}} />)
    await addFood('Oats', 300)
    await addFood('Banana', 100)
    await waitFor(() => expect(upserts()).toHaveLength(2))
    const [[first, opts], [second]] = upserts()
    expect(opts).toEqual({ onConflict: 'user_id,date' })
    expect(first).toMatchObject({ date: '2026-10-23', total_calories: 300 })
    expect(second).toMatchObject({ date: '2026-10-23', total_calories: 400 })
    expect(screen.getByText('Oats')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('tells the user when saving fails', async () => {
    sb.set('nutrition_targets', { data: null, error: null })
    sb.set('calorie_logs', q => sb.op(q, 'upsert') ? { data: null, error: { message: 'offline' } } : { data: sb.op(q, 'eq') ? null : [], error: null })
    render(<P.Calories profile={profile} isPro onUpgrade={() => {}} onGoToPlan={() => {}} />)
    await addFood('Oats', 300)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your food log")
  })
  it('lets free users type their own calorie target, even after answering the plan questions', async () => {
    sb.set('nutrition_targets', { data: { calorie_target: 2750, protein_grams: 180, carb_grams: 300, fat_grams: 80 }, error: null })
    sb.set('calorie_logs', { data: [], error: null })
    sb.set('user_profiles', { data: null, error: null })
    render(<P.Calories profile={profile} isPro={false} onUpgrade={() => {}} onGoToPlan={() => {}} />)
    await userEvent.click(await screen.findByText('Edit targets'))
    expect(screen.queryByText('From plan')).toBeNull()
    const kcal = screen.getByLabelText('Calories')
    await userEvent.clear(kcal)
    await userEvent.type(kcal, '2100')
    await userEvent.click(screen.getByText('Save targets'))
    const saved = sb.queriesFor('user_profiles').map(q => sb.op(q, 'update')?.[0] ?? sb.op(q, 'upsert')?.[0]).filter(Boolean).at(-1)
    expect(saved).toMatchObject({ calorie_goal: 2100 })
    expect((await screen.findAllByText('2100')).length).toBeGreaterThan(0)
    expect(screen.queryByText('2750')).toBeNull()
  })
  it("won't save a calorie target below the safe minimum", async () => {
    sb.set('nutrition_targets', { data: null, error: null })
    sb.set('calorie_logs', { data: [], error: null })
    sb.set('user_profiles', { data: null, error: null })
    render(<P.Calories profile={{ ...profile, sex: 'female' }} isPro={false} onUpgrade={() => {}} onGoToPlan={() => {}} />)
    await userEvent.click(await screen.findByText('Edit targets'))
    const kcal = screen.getByLabelText('Calories')
    await userEvent.clear(kcal)
    await userEvent.type(kcal, '900')
    expect(screen.getByText(/1200 kcal is the lowest target/)).toBeInTheDocument()
    expect(screen.getByText('Save targets')).toBeDisabled()
    await userEvent.clear(kcal)
    await userEvent.type(kcal, '1800')
    expect(screen.getByText('Save targets')).toBeEnabled()
    expect(screen.getByText(/Fat fills the rest/)).toBeInTheDocument()
  })
  it('lets free users log food; the AI photo scanner asks for Pro', async () => {
    sb.set('nutrition_targets', { data: null, error: null })
    sb.set('calorie_logs', q => sb.op(q, 'upsert') ? { data: { id: 'c1' }, error: null } : { data: sb.op(q, 'eq') ? null : [], error: null })
    const onUpgrade = vi.fn()
    render(<P.Calories profile={profile} isPro={false} onUpgrade={onUpgrade} onGoToPlan={() => {}} />)
    expect(screen.queryByText('Get Pro')).toBeNull() // no lock over the page
    await addFood('Oats', 300)
    await waitFor(() => expect(upserts()).toHaveLength(1))
    expect(screen.getByText('Scan barcode')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Snap a meal'))
    expect(onUpgrade).toHaveBeenCalled()
  })
})

describe('Auth', () => {
  it('signs in with email and password', async () => {
    render(<P.Auth />)
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12')
    await userEvent.click(screen.getAllByText('Sign in').at(-1))
    expect(sb.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'secret12' })
  })
  it('validates registration before calling Supabase', async () => {
    render(<P.Auth initialMode="register" />)
    await userEvent.type(screen.getByPlaceholderText('Full name'), 'Sam')
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12')
    await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'different')
    await userEvent.click(screen.getByText('Create free account'))
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(sb.supabase.auth.signUp).not.toHaveBeenCalled()
  })
  it('needs both consent boxes, and saves the consent with the account', async () => {
    render(<P.Auth initialMode="register" />)
    await userEvent.type(screen.getByPlaceholderText('Full name'), 'Sam')
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12')
    await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'secret12')
    const [terms, health] = screen.getAllByRole('checkbox')
    await userEvent.click(terms)
    await userEvent.click(screen.getByText('Create free account'))
    expect(screen.getByText('Tick both boxes to create your account.')).toBeInTheDocument()
    expect(sb.supabase.auth.signUp).not.toHaveBeenCalled()
    await userEvent.click(health)
    await userEvent.click(screen.getByText('Create free account'))
    const meta = sb.supabase.auth.signUp.mock.calls[0][0].options.data
    expect(meta).toMatchObject({ full_name: 'Sam', legal_version: LEGAL_VERSION })
    expect(meta.terms_accepted_at).toBeTruthy()
    expect(meta.health_consent_at).toBeTruthy()
  })
  it('submits with Enter from any field and fills from password managers', async () => {
    render(<P.Auth />)
    expect(screen.getByPlaceholderText('Email address')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'current-password')
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12{Enter}')
    expect(sb.supabase.auth.signInWithPassword).toHaveBeenCalled()
  })
  it('names who sent an invite link', async () => {
    localStorage.setItem('athrion_friend_invite', 'alex_fit')
    render(<P.Auth initialMode="register" />)
    expect(screen.getByText('@alex_fit')).toBeInTheDocument()
    expect(screen.getByText(/invited you to train together/)).toBeInTheDocument()
    localStorage.removeItem('athrion_friend_invite')
  })
  it('sends a password reset link', async () => {
    render(<P.Auth />)
    await userEvent.click(screen.getByText('Forgot password?'))
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.click(screen.getByText('Send reset link'))
    expect(sb.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('sam@example.com', expect.objectContaining({ redirectTo: expect.any(String) }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })
})

describe('Upgrade sheet before Stripe', () => {
  function signInFree(sub = { status: 'free', stripe_customer_id: null }) {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: 't' } } })
    sb.set('user_profiles', { data: profile, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('subscriptions', { data: sub, error: null })
    sb.set('fitness_plans', { data: null, error: null })
  }
  it('Get Pro opens the plans, then the chosen plan goes to Stripe checkout', async () => {
    signInFree()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: '#checkout' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<P.App />)
    await userEvent.click(await screen.findByText('Plan'))
    await userEvent.click(await screen.findByText('Get Pro'))
    expect(await screen.findByRole('radio', { name: /Yearly · \$49\.99/ })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('radio', { name: /Monthly/ }))
    await userEvent.click(await screen.findByText('Start 7-day free trial'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/create-checkout', expect.anything()))
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: 'monthly' })
    vi.unstubAllGlobals()
  })
  it('offers no trial to someone who has subscribed before', async () => {
    signInFree({ status: 'free', stripe_customer_id: 'cus_1' })
    render(<P.App />)
    await userEvent.click(await screen.findByText('Plan'))
    await userEvent.click(await screen.findByText('Get Pro'))
    expect(await screen.findByText('Continue to payment')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'ATHRION Pro' })).not.toHaveTextContent(/free trial/i)
  })
  it('shows an error if checkout cannot open', async () => {
    signInFree()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Stripe is down' }) })))
    render(<P.App />)
    await userEvent.click(await screen.findByText('Plan'))
    await userEvent.click(await screen.findByText('Get Pro'))
    await userEvent.click(await screen.findByText('Start 7-day free trial'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Stripe is down')
    vi.unstubAllGlobals()
  })
})

describe('Library and Group live inside Workout', () => {
  it('opens from cards on the Workout tab and has a way back', async () => {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: 't' } } })
    sb.set('user_profiles', { data: profile, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('subscriptions', { data: { status: 'pro' }, error: null })
    sb.set('fitness_plans', { data: planRow, error: null })
    render(<P.App />)
    await userEvent.click(await screen.findByText('Train together'))
    expect(await screen.findByText('Host a room')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Back to Train'))
    expect(await screen.findByText('Exercise library')).toBeInTheDocument()
  })
  it('steps back with the phone back gesture instead of leaving the app', async () => {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: 't' } } })
    sb.set('user_profiles', { data: profile, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('subscriptions', { data: { status: 'pro' }, error: null })
    sb.set('fitness_plans', { data: planRow, error: null })
    render(<P.App />)
    await userEvent.click(await screen.findByText('Train together'))
    expect(await screen.findByText('Host a room')).toBeInTheDocument()
    await waitFor(() => expect(window.history.state?.page).toBe('group'))
    act(() => window.history.back())
    expect(await screen.findByText('Exercise library')).toBeInTheDocument()
  })
})

describe('Library', () => {
  it('searches exercises', async () => {
    render(<P.Library onStartWorkout={() => {}} />)
    const tabs = screen.queryAllByText('Exercises')
    if (tabs.length) await userEvent.click(tabs[0])
    const search = screen.queryByPlaceholderText('Search exercises')
    if (search) {
      await userEvent.type(search, 'zzzz-not-real')
      expect(screen.getByText('No exercises found')).toBeInTheDocument()
    } else {
      expect(screen.getByText('Library')).toBeInTheDocument()
    }
  })
})

describe('Group', () => {
  it('shows host and join options and rejects an unknown room code', async () => {
    sb.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'Room not found' } })
    render(<P.Group session={{ name: 'Sam', email: USER.email }} />)
    expect(screen.getByText('Host a room')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('ABC123'), 'ZZZZZZ')
    const join = screen.getAllByRole('button').find(b => /join/i.test(b.textContent) && b.textContent !== 'Join a room')
    await userEvent.click(join)
    expect(await screen.findByText(/Room not found/)).toBeInTheDocument()
  })
})

describe('Progress', () => {
  it('renders the overview with streak and badges', async () => {
    sb.set('workout_logs', { data: [{ created_at: '2026-10-20T10:00:00-04:00', date: '2026-10-20', sets: [], volume: 0 }], error: null })
    render(<P.Progress />)
    expect(await screen.findByText('Progress')).toBeInTheDocument()
    await waitFor(() => expect(sb.queriesFor('user_badges').length).toBeGreaterThan(0))
  })
})

describe('Onboarding', () => {
  it('renders the body-stats step', () => {
    render(<P.Onboarding initialValues={null} onComplete={() => {}} />)
    expect(screen.getAllByText('ATHRION').length).toBeGreaterThan(0)
  })
  it('renders fitness setup', () => {
    render(<P.FitnessOnboarding existingProfile={profile} onComplete={() => {}} />)
    expect(screen.getByText(/main goal/)).toBeInTheDocument()
  })
  it('lets a free user save their answers and targets, then offers the trial instead of generating', async () => {
    sb.set('fitness_profiles', { data: {}, error: null })
    sb.set('nutrition_targets', { data: {}, error: null })
    sb.set('user_profiles', { data: {}, error: null })
    const onUpgrade = vi.fn(); const onCancel = vi.fn()
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const saved = { primary_goal: 'build_muscle', activity_level: 'moderately_active', experience_level: 'beginner', workout_days_per_week: 3 }
    render(<P.FitnessOnboarding existingProfile={profile} saved={saved} isPro={false} onUpgrade={onUpgrade} onCancel={onCancel} />)
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByText('Continue'))
    await userEvent.click(await screen.findByText('None of these, continue'))
    expect(await screen.findByText(/not medical advice/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('Start 7-day free trial'))
    await waitFor(() => expect(onUpgrade).toHaveBeenCalled())
    const upsert = sb.op(sb.queriesFor('fitness_profiles').find(q => sb.op(q, 'upsert')), 'upsert')[0]
    expect(upsert).toMatchObject({ primary_goal: 'build_muscle', onboarding_completed: false })
    expect(fetchMock).not.toHaveBeenCalled() // no plan generation for free users
    expect(onCancel).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('starts a new Pro member with saved answers at step 1, answers filled in', async () => {
    render(<P.FitnessOnboarding existingProfile={profile} saved={{ primary_goal: 'lose_fat' }} onComplete={() => {}} />)
    expect(screen.getByText(/main goal/)).toBeInTheDocument()
    expect(screen.getByText('Continue')).toBeEnabled() // the saved goal is already picked
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByText('Continue'))
    await userEvent.click(await screen.findByText('None of these, continue'))
    expect(await screen.findByText('Build my plan')).toBeInTheDocument()
  })
  it('asks about health and diet, tells the plan, and keeps pregnancy out of a deficit', async () => {
    sb.set('fitness_profiles', { data: {}, error: null })
    sb.set('nutrition_targets', { data: {}, error: null })
    sb.set('user_profiles', { data: {}, error: null })
    const saved = { primary_goal: 'lose_weight', activity_level: 'moderately_active', experience_level: 'beginner', workout_days_per_week: 3 }
    render(<P.FitnessOnboarding existingProfile={profile} saved={saved} isPro={false} onUpgrade={() => {}} onCancel={() => {}} />)
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByText('Continue'))
    await userEvent.click(await screen.findByText('Pregnant'))
    await userEvent.click(screen.getByText('Knee pain'))
    await userEvent.click(screen.getByText('Vegan'))
    await userEvent.type(screen.getByPlaceholderText(/old ankle sprain/), 'Bad left wrist')
    expect(screen.getByRole('note')).toHaveTextContent('Check with your doctor')
    await userEvent.click(screen.getByText('Continue'))
    await userEvent.click(await screen.findByText('Not now, just save my targets'))
    await waitFor(() => expect(sb.queriesFor('fitness_profiles').some(q => sb.op(q, 'upsert'))).toBe(true))
    const upsert = sb.op(sb.queriesFor('fitness_profiles').find(q => sb.op(q, 'upsert')), 'upsert')[0]
    expect(upsert).toMatchObject({ injuries: 'Knee pain; Other: Bad left wrist', medical_notes: 'Pregnant', limitations: 'Diet: Vegan' })
    const q = sb.queriesFor('nutrition_targets').find(q => sb.op(q, 'insert') || sb.op(q, 'upsert'))
    const target = (sb.op(q, 'insert') ?? sb.op(q, 'upsert'))[0]
    expect(target.goal_adjustment).toBe(0) // lose weight, but pregnant: no deficit
  })
})

describe('ProfileModal', () => {
  // The subscription screen asks the server (and so Stripe) on open
  const stripeReply = (...bodies) => {
    const fetchMock = vi.fn()
    for (const b of bodies) fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => b })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const openSubscription = async () => {
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    await userEvent.click(screen.getByText('ATHRION Pro is active'))
  }
  afterEach(() => vi.unstubAllGlobals())

  it('shows a cancelled subscription as cancelled, with Renew and no Cancel', async () => {
    const fetchMock = stripeReply(
      { cancelled: true, cancel_at: '2026-11-01T12:00:00.000Z', period_end: '2026-11-01T12:00:00.000Z' },
      { cancelled: false, cancel_at: null, period_end: '2026-11-01T12:00:00.000Z' },
    )
    await openSubscription()
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('November 1, 2026')).toBeInTheDocument()
    expect(screen.queryByText('Cancel subscription')).toBeNull()
    await userEvent.click(screen.getByText('Renew subscription'))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'resume' })
    expect(await screen.findByText('Cancel subscription')).toBeInTheDocument()
    expect(screen.queryByText('Renew subscription')).toBeNull()
  })
  it('shows a month of Pro won on the leaderboard as a prize, with nothing to cancel', async () => {
    sb.set('subscriptions', { data: { status: 'free', comp_pro_until: '2026-11-30T12:00:00.000Z' }, error: null })
    const fetchMock = stripeReply()
    await openSubscription()
    expect(await screen.findByText('Prize')).toBeInTheDocument()
    expect(screen.getByText('November 30, 2026')).toBeInTheDocument()
    expect(screen.queryByText('Cancel subscription')).toBeNull()
    expect(screen.queryByText('Renew subscription')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled() // no Stripe subscription to ask about
  })
  it('cancels an active subscription and then offers only Renew', async () => {
    const fetchMock = stripeReply(
      { cancelled: false, cancel_at: null, period_end: '2026-11-01T12:00:00.000Z' },
      { cancelled: true, cancel_at: '2026-11-01T12:00:00.000Z', period_end: '2026-11-01T12:00:00.000Z' },
    )
    await openSubscription()
    await userEvent.click(await screen.findByText('Cancel subscription'))
    await userEvent.click(screen.getByText('Yes, cancel'))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'cancel' })
    expect(await screen.findByText('Renew subscription')).toBeInTheDocument()
    expect(screen.queryByText('Cancel subscription')).toBeNull()
  })

  it('deletes the account only after DELETE is typed, then signs out on this device', async () => {
    const fetchMock = stripeReply({ deleted: true })
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    await userEvent.click(screen.getByText('Delete account'))
    expect(screen.getByText(/Your Pro subscription ends now/)).toBeInTheDocument()
    const button = screen.getByText('Delete my account').closest('button')
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'delete')
    await userEvent.click(button)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/delete-account')
    await waitFor(() => expect(sb.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })
  it('downloads a copy of the person\'s data', async () => {
    sb.set('workout_logs', { data: [{ id: 'w1', name: 'Leg day' }], error: null })
    const urls = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }
    const saved = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
    Object.assign(URL, urls)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    await userEvent.click(screen.getByText('Download my data'))
    await waitFor(() => expect(click).toHaveBeenCalled())
    const blob = urls.createObjectURL.mock.calls[0][0]
    const data = JSON.parse(await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsText(blob) }))
    expect(data.account.email).toBe(USER.email)
    expect(data.workout_logs).toEqual([{ id: 'w1', name: 'Leg day' }])
    expect(sb.queriesFor('workout_logs').every(q => sb.op(q, 'eq')[1] === USER.id)).toBe(true)
    click.mockRestore()
    Object.assign(URL, saved)
  })

  it('shows height in cm for people who use kg', () => {
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={{ ...profile, height_cm: 180, weight_unit: 'kg' }} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    expect(screen.getByText('180 cm')).toBeInTheDocument()
    expect(screen.getByText(/Get ATHRION Pro · \$4\.99 a month/)).toBeInTheDocument()
  })
  it('signs out', async () => {
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    await userEvent.click(screen.getByText('Sign out'))
    expect(sb.supabase.auth.signOut).toHaveBeenCalled()
  })

  describe('regression: fixed in the October 2026 review', () => {
    // Signing out leaves the in-progress workout and the push subscription on the device,
    // so the next person to sign in sees it and the first user's reminders keep arriving.
    it('signing out clears the saved in-progress workout', async () => {
      localStorage.setItem('athrion_workout', JSON.stringify({ name: 'Secret', startTime: 1 }))
      render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
      await userEvent.click(screen.getByText('Sign out'))
      expect(localStorage.getItem('athrion_workout')).toBeNull()
    })
  })
})

describe('App shell', () => {
  function signedIn(status = 'free') {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: 't' } } })
    sb.set('user_profiles', { data: profile, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('subscriptions', { data: { status }, error: null })
    sb.set('fitness_plans', { data: planRow, error: null })
  }
  it('shows new visitors the landing page, then create account', async () => {
    localStorage.clear()
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    render(<P.App />)
    expect(await screen.findByText('A training plan and calorie targets that adjust every week')).toBeInTheDocument()
    expect(screen.getByText('$4.99')).toBeInTheDocument()
    await userEvent.click(screen.getAllByText('Create free account')[0])
    expect(await screen.findByPlaceholderText('Full name')).toBeInTheDocument()
    expect(sb.supabase.from).not.toHaveBeenCalledWith('user_profiles')
  })
  it('asks an account made before the terms existed to agree once', async () => {
    signedIn()
    const before = { ...USER, user_metadata: { full_name: 'Sam' } }
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: before, access_token: 't' } } })
    render(<P.App />)
    expect(await screen.findByText('Before you continue')).toBeInTheDocument()
    const agree = screen.getByText('Agree and continue')
    expect(agree.closest('button')).toBeDisabled()
    for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box)
    await userEvent.click(agree)
    expect(sb.supabase.auth.updateUser).toHaveBeenCalledWith({ data: expect.objectContaining({ legal_version: LEGAL_VERSION }) })
  })
  it('the test user has agreed to the current terms', () => {
    expect(USER.user_metadata.legal_version).toBe(LEGAL_VERSION)
  })
  it('takes someone who has signed in here before straight to sign in', async () => {
    localStorage.setItem('athrion_signed_in_before', '1')
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    render(<P.App />)
    expect(await screen.findByPlaceholderText('Email address')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Full name')).toBeNull()
    localStorage.clear()
  })
  it('loads the profile and lands on the Workout tab when signed in', async () => {
    signedIn('pro') // the plan's rest day shows on Train for Pro members
    render(<P.App />)
    expect(await screen.findByText('Rest & Recovery')).toBeInTheDocument()
  })
  it('sends incomplete profiles to onboarding', async () => {
    signedIn()
    sb.set('user_profiles', { data: { user_id: 'user-1' }, error: null })
    render(<P.App />)
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull())
    expect(screen.queryByText('Rest & Recovery')).toBeNull()
  })

  describe('regression: fixed in the October 2026 review', () => {
    // onAuthStateChange hands back a new session object on every token refresh (about
    // hourly, and when the tab regains focus). App treats that as a new login: it shows
    // the Loading screen and remounts the page, so any open screen state is lost.
    it('a token refresh does not reload the profile or remount the page', async () => {
      signedIn('pro')
      render(<P.App />)
      await screen.findByText('Rest & Recovery')
      const before = sb.queriesFor('user_profiles').length
      const cb = sb.supabase.auth.onAuthStateChange.mock.calls[0][0]
      await act(async () => cb('TOKEN_REFRESHED', { user: USER, access_token: 't2' }))
      expect(sb.queriesFor('user_profiles').length).toBe(before)
    })
  })
})
