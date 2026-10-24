// Workout tab. "Today" is frozen to Friday 23 Oct 2026, a rest day in the plan fixture.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'
import { planRow, withWorkoutOn } from '../helpers/fixtures.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))
vi.mock('../../src/lib/exerciseDb.js', () => ({ findDemo: vi.fn(async () => null), findAlternatives: vi.fn(async () => []), imageUrl: p => p, youtubeSearchUrl: () => '#' }))

let Workout
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00-04:00') })
  Workout = (await import('../../src/pages/Workout.jsx')).default
})
beforeEach(() => {
  sb.reset()
  sb.set('workout_logs', { data: [], error: null })
  sb.set('custom_workouts', { data: [], error: null })
  sb.set('user_badges', { data: [], error: null })
})
const show = (props = {}) => render(<Workout isPro onUpgrade={() => {}} onClearPending={() => {}} {...props} />)

describe('Workout tab — rest days match the plan', () => {
  it('shows the plan rest day instead of a generic workout', async () => {
    sb.set('fitness_plans', { data: planRow, error: null })
    show()
    expect(await screen.findByText('Rest & Recovery')).toBeInTheDocument()
    expect(screen.getByText('Light walk and stretching.')).toBeInTheDocument()
    expect(screen.getByText('rest')).toBeInTheDocument()
    expect(screen.queryByText('Start workout')).toBeNull()
  })

  it('offers the plan workouts, next one first, and starts the picked one', async () => {
    sb.set('fitness_plans', { data: planRow, error: null })
    show()
    await screen.findByText('Want to train anyway?')
    const chips = screen.getAllByRole('button').filter(b => /^(Mon|Wed) · /.test(b.textContent))
    expect(chips.map(c => c.textContent)).toEqual(['Mon · Upper Body', 'Wed · Lower Body'])
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument() // Monday preselected
    await userEvent.click(chips[1])
    expect(screen.getByText('Romanian Deadlift')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Train anyway'))
    expect(await screen.findByText('Log set')).toBeInTheDocument()
    expect(screen.getAllByText('Squat').length).toBeGreaterThan(0)
  })

  it('shows today\'s plan workout on a training day', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    expect(await screen.findByText('Full Body')).toBeInTheDocument()
    expect(screen.getByText('Goblet Squat')).toBeInTheDocument()
    expect(screen.getByText('Start workout')).toBeInTheDocument()
    expect(screen.queryByText('Want to train anyway?')).toBeNull()
  })

  it('falls back to the built-in workout without a plan', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    expect(await screen.findByText('Fri Workout')).toBeInTheDocument()
    expect(screen.getByText('Start workout')).toBeInTheDocument()
  })
})

describe('Workout tab — logging', () => {
  it('logs a set, starts the rest timer and remembers the workout across reloads', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    const [weight, reps] = screen.getAllByPlaceholderText('0')
    await userEvent.type(weight, '50')
    await userEvent.type(reps, '10')
    await userEvent.click(screen.getByText('Log set'))
    await waitFor(() => expect(localStorage.getItem('athrion_rest_end')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem('athrion_workout'))
    expect(saved.loggedSets[0]).toMatchObject({ ex: 'Goblet Squat', weight: 50, reps: 10 })
  })

  it('starts a free workout', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    await userEvent.click(await screen.findByText('Free workout'))
    expect(await screen.findByText('Pick exercises as you go')).toBeInTheDocument()
  })
})

describe('Workout tab — saving a finished workout', () => {
  beforeEach(() => localStorage.clear())
  // An insert fails (or succeeds) only when ok() says so; reads always return []
  const logs = ok => sb.set('workout_logs', q => (q.ops.some(o => o[0] === 'insert')
    ? (ok() ? { data: { id: 'w1', name: 'Saved', sets: [] }, error: null } : { data: null, error: { message: 'offline' } })
    : { data: [], error: null }))

  async function finishWorkout() {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    const [weight, reps] = screen.getAllByPlaceholderText('0')
    await userEvent.type(weight, '50')
    await userEvent.type(reps, '10')
    await userEvent.click(screen.getByText('Log set'))
    await userEvent.click(await screen.findByText('End workout early'))
    await userEvent.click(await screen.findByText('End workout'))
  }

  describe('regression: fixed in the October 2026 review', () => {
    // saveHistory swallowed the error, so "Workout complete" showed and the session was gone
    it('keeps a workout that fails to save, says so, and saves it on retry', async () => {
      let online = false
      logs(() => online)
      await finishWorkout()
      expect(await screen.findByText(/isn't saved to your account yet/)).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('athrion_pending_workouts'))).toHaveLength(1)

      online = true
      await userEvent.click(screen.getByText('Try again'))
      await waitFor(() => expect(localStorage.getItem('athrion_pending_workouts')).toBeNull())
      expect(screen.queryByText(/isn't saved to your account yet/)).not.toBeInTheDocument()
    })
  })

  it('shows no warning when the save works', async () => {
    logs(() => true)
    await finishWorkout()
    expect(await screen.findByText('Workout complete')).toBeInTheDocument()
    expect(screen.queryByText(/isn't saved/)).not.toBeInTheDocument()
    expect(localStorage.getItem('athrion_pending_workouts')).toBeNull()
  })
})

describe('Workout tab — flexible logging', () => {
  beforeEach(() => localStorage.clear())
  async function startAndLog(w = '50', r = '10') {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    const [weight, reps] = screen.getAllByPlaceholderText('0')
    await userEvent.type(weight, w)
    await userEvent.type(reps, r)
    await userEvent.click(screen.getByText('Log set'))
    await userEvent.click(await screen.findByText(/Skip rest/))
  }
  const saved = () => JSON.parse(localStorage.getItem('athrion_workout'))

  it('adds a set to just this exercise', async () => {
    await startAndLog()
    const before = screen.getByText(/^Set 2 of \d+$/).textContent
    await userEvent.click(screen.getByText('Add a set'))
    const n = Number(before.match(/of (\d+)/)[1])
    expect(screen.getByText(`Set 2 of ${n + 1}`)).toBeInTheDocument()
    expect(saved().setCounts[0]).toBe(n + 1)
  })
  it('corrects and deletes a logged set', async () => {
    await startAndLog()
    await userEvent.click(screen.getByLabelText('Edit set 1'))
    const weight = screen.getByLabelText(/Weight \(lb\)/, { selector: 'input' })
    await userEvent.clear(weight); await userEvent.type(weight, '55')
    await userEvent.click(screen.getByText('Save'))
    expect(saved().loggedSets[0]).toMatchObject({ weight: 55, reps: 10 })
    await userEvent.click(screen.getByLabelText('Delete set 1'))
    expect(saved().loggedSets).toHaveLength(0)
    expect(screen.getByText(/^Set 1 of/)).toBeInTheDocument()
  })
  it('skips an exercise without logging it', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    const first = saved().exerciseNames[0]
    await userEvent.click(screen.getByText('Skip exercise'))
    expect(saved().exIdx).toBe(1)
    expect(saved().setCounts[0]).toBe(0)
    expect(screen.queryByRole('heading', { name: first })).toBeNull()
  })
})

