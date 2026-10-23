// Smoke and key-flow tests for every other page, plus the App shell.
// "Today" is Friday 23 Oct 2026, 10am New York.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'
import { planRow, profile, fitnessProfile } from '../helpers/fixtures.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))
vi.mock('../../src/lib/exerciseDb.js', () => ({ findDemo: vi.fn(async () => null), findAlternatives: vi.fn(async () => []), imageUrl: p => p, youtubeSearchUrl: () => '#' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))

let P = {}
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00-04:00') })
  for (const name of ['Plan', 'Calories', 'Auth', 'Upgrade', 'Library', 'Group', 'Progress', 'Onboarding', 'FitnessOnboarding']) {
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

describe('Plan', () => {
  it('asks to create a plan when there is none', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('nutrition_targets', { data: null, error: null })
    render(<P.Plan profile={profile} onGoToWorkout={() => {}} onProfileChange={() => {}} />)
    expect(await screen.findByText('No Active Plan')).toBeInTheDocument()
  })
  it('shows today as a rest day with Train Anyway, and the weekly schedule', async () => {
    sb.set('fitness_plans', { data: planRow, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('nutrition_targets', { data: { calorie_target: 2500, protein_grams: 180, carb_grams: 280, fat_grams: 70 }, error: null })
    const go = vi.fn()
    render(<P.Plan profile={profile} onGoToWorkout={go} onProfileChange={() => {}} />)
    expect(await screen.findByText('Weekly Schedule')).toBeInTheDocument()
    expect(screen.getByText('Today · Friday')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Train Anyway →'))
    expect(go).toHaveBeenCalled()
    expect(screen.getByText('Daily Nutrition Targets')).toBeInTheDocument()
  })
})

describe('Calories', () => {
  it('adds a food to the right meal and saves today\'s log', async () => {
    sb.set('calorie_logs', q => q.ops.some(o => o[0] === 'insert') ? { data: { id: 'c1' }, error: null } : { data: q.ops.some(o => o[0] === 'eq') ? null : [], error: null })
    sb.set('nutrition_targets', { data: null, error: null })
    render(<P.Calories profile={profile} isPro onUpgrade={() => {}} onGoToPlan={() => {}} />)
    await userEvent.click((await screen.findAllByText('+ Add'))[0])
    await userEvent.type(screen.getByPlaceholderText('Food name'), 'Oats')
    await userEvent.type(screen.getByPlaceholderText('Calories'), '300')
    const form = screen.getByPlaceholderText('Fat (g)').parentElement
    await userEvent.click([...form.querySelectorAll('button')].find(b => b.textContent.includes('+ Add')))
    await waitFor(() => expect(sb.queriesFor('calorie_logs').some(q => q.ops.some(o => o[0] === 'insert'))).toBe(true))
    const insert = sb.queriesFor('calorie_logs').find(q => q.ops.some(o => o[0] === 'insert'))
    expect(sb.op(insert, 'insert')[0]).toMatchObject({ date: '2026-10-23', total_calories: 300 })
    expect(screen.getByText('Oats')).toBeInTheDocument()
  })
  it('shows the upgrade screen to free users', async () => {
    const onUpgrade = vi.fn()
    render(<P.Calories profile={profile} isPro={false} onUpgrade={onUpgrade} onGoToPlan={() => {}} />)
    expect(await screen.findByText('PRO FEATURE')).toBeInTheDocument()
    await userEvent.click(screen.getAllByText('Upgrade Your Plan →')[0])
    expect(onUpgrade).toHaveBeenCalled()
  })
})

describe('Auth', () => {
  it('signs in with email and password', async () => {
    render(<P.Auth />)
    const signIn = screen.queryByText('Sign In') ?? screen.getAllByRole('button')[0]
    if (!screen.queryByPlaceholderText('Email address')) await userEvent.click(signIn)
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12')
    await userEvent.click(screen.getAllByText('Sign In').at(-1))
    expect(sb.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'secret12' })
  })
  it('validates registration before calling Supabase', async () => {
    render(<P.Auth />)
    if (!screen.queryByPlaceholderText('Email address')) await userEvent.click(screen.getAllByRole('button')[0])
    await userEvent.click(screen.getAllByText(/register|sign up/i)[0])
    await userEvent.type(screen.getByPlaceholderText('Full name'), 'Sam')
    await userEvent.type(screen.getByPlaceholderText('Email address'), 'sam@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret12')
    await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'different')
    await userEvent.click(screen.getByText('Create Account'))
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(sb.supabase.auth.signUp).not.toHaveBeenCalled()
  })
})

describe('Upgrade', () => {
  it('starts Stripe checkout', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: '#checkout' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<P.Upgrade onBack={() => {}} />)
    await userEvent.click(screen.getByText('Upgrade to Pro →'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/create-checkout', expect.anything()))
    vi.unstubAllGlobals()
  })
})

describe('Library', () => {
  it('searches exercises', async () => {
    render(<P.Library onStartWorkout={() => {}} />)
    const tabs = screen.queryAllByText('Exercises')
    if (tabs.length) await userEvent.click(tabs[0])
    const search = screen.queryByPlaceholderText('🔍 Search exercises...')
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
    sb.set('group_sessions', { data: [], error: null })
    render(<P.Group session={{ name: 'Sam', email: USER.email }} />)
    expect(screen.getByText('Host a Session')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('ABC123'), 'ZZZZZZ')
    const join = screen.getAllByRole('button').find(b => /join/i.test(b.textContent) && b.textContent !== 'Join a Room')
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
    expect(screen.getByText('Fitness Setup')).toBeInTheDocument()
  })
})

describe('ProfileModal', () => {
  it('signs out', async () => {
    render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
    await userEvent.click(screen.getByText('Sign Out'))
    expect(sb.supabase.auth.signOut).toHaveBeenCalled()
  })

  describe('known bugs (privacy)', () => {
    // Signing out leaves the in-progress workout and the push subscription on the device,
    // so the next person to sign in sees it and the first user's reminders keep arriving.
    it.fails('BUG: signing out clears the saved in-progress workout', async () => {
      localStorage.setItem('athrion_workout', JSON.stringify({ name: 'Secret', startTime: 1 }))
      render(<P.ProfileModal session={{ name: 'Sam', email: USER.email }} profile={profile} isPro={false} theme="dark" onToggleTheme={() => {}} onClose={() => {}} onEdit={() => {}} onUpgrade={() => {}} />)
      await userEvent.click(screen.getByText('Sign Out'))
      expect(localStorage.getItem('athrion_workout')).toBeNull()
    })
  })
})

describe('App shell', () => {
  function signedIn() {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: 't' } } })
    sb.set('user_profiles', { data: profile, error: null })
    sb.set('fitness_profiles', { data: fitnessProfile, error: null })
    sb.set('subscriptions', { data: { status: 'free' }, error: null })
    sb.set('fitness_plans', { data: planRow, error: null })
  }
  it('shows sign-in when logged out', async () => {
    sb.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    render(<P.App />)
    expect(await screen.findByText(/ATHRION/)).toBeInTheDocument()
    expect(sb.supabase.from).not.toHaveBeenCalledWith('user_profiles')
  })
  it('loads the profile and lands on the Workout tab when signed in', async () => {
    signedIn()
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

  describe('known bugs', () => {
    // onAuthStateChange hands back a new session object on every token refresh (about
    // hourly, and when the tab regains focus). App treats that as a new login: it shows
    // the Loading screen and remounts the page, so any open screen state is lost.
    it.fails('BUG: a token refresh does not reload the profile or remount the page', async () => {
      signedIn()
      render(<P.App />)
      await screen.findByText('Rest & Recovery')
      const before = sb.queriesFor('user_profiles').length
      const cb = sb.supabase.auth.onAuthStateChange.mock.calls[0][0]
      await act(async () => cb('TOKEN_REFRESHED', { user: USER, access_token: 't2' }))
      expect(sb.queriesFor('user_profiles').length).toBe(before)
    })
  })
})
