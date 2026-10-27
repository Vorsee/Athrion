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
    await userEvent.click(screen.getByLabelText('Recovery')) // recovery notes open from ⓘ
    expect(await screen.findByText('Light walk and stretching.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Close'))
    expect(screen.getByText('rest')).toBeInTheDocument()
    expect(screen.queryByText('Start workout')).toBeNull()
  })

  describe('regression: fixed in the October 2026 review', () => {
    // App learns Pro status after Workout mounts; the plan must still show once it does
    it('shows the plan when Pro status arrives after the tab loaded', async () => {
      sb.set('fitness_plans', { data: planRow, error: null })
      const { rerender } = render(<Workout isPro={false} onUpgrade={() => {}} onClearPending={() => {}} />)
      await waitFor(() => expect(sb.queriesFor('fitness_plans').length).toBeGreaterThan(0))
      expect(screen.queryByText('Rest & Recovery')).toBeNull()
      rerender(<Workout isPro onUpgrade={() => {}} onClearPending={() => {}} />)
      expect(await screen.findByText('Rest & Recovery')).toBeInTheDocument()
    })
  })

  it('offers the plan workouts, next one first, and starts the picked one', async () => {
    sb.set('fitness_plans', { data: planRow, error: null })
    show()
    await screen.findByText('Rest & Recovery')
    const chips = screen.getAllByRole('button').filter(b => /^(Mon|Wed) · /.test(b.textContent))
    expect(chips.map(c => c.textContent)).toEqual(['Mon · Upper Body', 'Wed · Lower Body'])
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument() // Monday preselected
    await userEvent.click(chips[1])
    expect(screen.getByText('Romanian Deadlift')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Train anyway'))
    expect(await screen.findByText(/^Log set \d/)).toBeInTheDocument()
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

  it('without a plan or saved workouts, shows the labelled starter session instead of a random one', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    expect(await screen.findByText('Full body A')).toBeInTheDocument()
    expect(screen.getByText('Starter plan')).toBeInTheDocument()
    expect(screen.getByText('Session A of 3')).toBeInTheDocument()
    expect(screen.queryByText('Fri Workout')).toBeNull()
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
    await userEvent.click(screen.getByText(/^Log set \d/))
    await waitFor(() => expect(localStorage.getItem('athrion_rest_end')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem('athrion_workout'))
    expect(saved.loggedSets[0]).toMatchObject({ ex: 'Goblet Squat', weight: 50, reps: 10 })
  })

  it('fills the next set with the one just logged, so repeating it is one tap', async () => {
    localStorage.clear()
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    const [weight, reps] = screen.getAllByPlaceholderText('0')
    await userEvent.type(weight, '50')
    await userEvent.type(reps, '10')
    await userEvent.click(screen.getByText('Log set 1'))
    await userEvent.click(await screen.findByText('Skip rest'))
    expect(await screen.findByText('Log set 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Weight in lb')).toHaveValue(50)
    expect(screen.getByLabelText('Reps')).toHaveValue(10)
  })

  it('fills the first set from last time and shows what that was', async () => {
    localStorage.clear()
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    sb.set('workout_logs', { data: [{ id: 'old', date: '2026-10-20', name: 'Legs', created_at: '2026-10-20T18:00:00Z',
      sets: [{ ex: 'Goblet Squat', set: 1, weight: 40, reps: 10 }, { ex: 'Goblet Squat', set: 2, weight: 40, reps: 9 }] }], error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    expect(await screen.findByText('Try today')).toBeInTheDocument()
    expect(screen.getByText('Last time: 40×10, 40×9')).toBeInTheDocument()
    expect(Number(screen.getByLabelText('Weight in lb').value)).toBe(40)
    expect(Number(screen.getByLabelText('Reps').value)).toBeGreaterThan(0)
  })

  it('explains the setup choices for a saved workout', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    await userEvent.click(await screen.findByText('Free workout'))
    expect(await screen.findByText('How many rounds of each exercise. 3 suits most people.')).toBeInTheDocument()
    expect(screen.getByText('Rest between sets')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Choosing your sets and rest'))
    expect(await screen.findByText(/New to lifting\? Start with 2 or 3/)).toBeInTheDocument()
  })

  it('starts a free workout', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    await userEvent.click(await screen.findByText('Free workout'))
    expect(await screen.findByText('Pick first exercise')).toBeInTheDocument()
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
    await userEvent.click(screen.getByText(/^Log set \d/))
    await userEvent.click(await screen.findByRole('button', { name: 'End' }))
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
    await userEvent.click(screen.getByText(/^Log set \d/))
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


describe('Workout tab — session shell', () => {
  beforeEach(() => localStorage.clear())

  it('minimises the active workout and keeps it saved for the session bar', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    expect(await screen.findByText(/^Log set \d/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('Minimise'))
    expect(await screen.findByText('Start workout')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('athrion_workout'))).toMatchObject({ minimised: true, screen: 'training' })
  })

  it('starts a plan day handed over from the Plan tab straight into training', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    const day = withWorkoutOn('Friday').plan_data.weeklySchedule.find(d => d.day === 'Friday')
    show({ pendingWorkout: { name: day.title, planExercises: day.workout.exercises } })
    expect(await screen.findByText(/^Log set \d/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('athrion_workout')).name).toBe(day.title)
  })
})

describe('Workout tab — resuming a minimised workout', () => {
  beforeEach(() => localStorage.clear())
  describe('regression: fixed in the October 2026 review', () => {
    // Resume rebuilt the list from the library by name, so plan-only exercises vanished
    it('brings back plan exercises the library does not know', async () => {
      localStorage.setItem('athrion_workout', JSON.stringify({
        screen: 'training', name: 'Push', startTime: Date.now() - 60000, exIdx: 1, setIdx: 0, loggedSets: [],
        totalSets: 3, restDuration: 60, freeWorkout: false,
        exerciseNames: ['Landmine press', 'Cable fly'],
        exercises: [{ name: 'Landmine press', muscle: '', icon: 'mdi:dumbbell', reps: '8-10' }, { name: 'Cable fly', muscle: '', icon: 'mdi:dumbbell', reps: '12' }],
      }))
      sb.set('fitness_plans', { data: null, error: null })
      show()
      expect(await screen.findAllByText('Cable fly')).not.toHaveLength(0)
      expect(screen.getAllByText('Landmine press').length).toBeGreaterThan(0)
    })
    it('still restores older saves that only kept names', async () => {
      localStorage.setItem('athrion_workout', JSON.stringify({
        screen: 'training', name: 'Push', startTime: Date.now() - 60000, exIdx: 0, setIdx: 0, loggedSets: [],
        totalSets: 3, restDuration: 60, freeWorkout: false, exerciseNames: ['Landmine press'],
      }))
      sb.set('fitness_plans', { data: null, error: null })
      show()
      expect(await screen.findAllByText('Landmine press')).not.toHaveLength(0)
    })
  })

  it('goes back home without a "Workout complete" screen when nothing was logged', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('Start workout'))
    await userEvent.click(screen.getByRole('button', { name: /^End/ }))
    await userEvent.click(await screen.findByText('End workout'))
    expect(screen.queryByText('Workout complete')).toBeNull()
    expect(await screen.findByText('Start workout')).toBeInTheDocument()
  })
})

