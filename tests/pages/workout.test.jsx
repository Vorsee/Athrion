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
    expect(screen.queryByText('🚀 Start Training')).toBeNull()
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
    await userEvent.click(screen.getByText('🚀 Train Anyway'))
    expect(await screen.findByText('✓ Done — Start Rest Timer')).toBeInTheDocument()
    expect(screen.getAllByText('Squat').length).toBeGreaterThan(0)
  })

  it('shows today\'s plan workout on a training day', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    expect(await screen.findByText('Full Body')).toBeInTheDocument()
    expect(screen.getByText('Goblet Squat')).toBeInTheDocument()
    expect(screen.getByText('🚀 Start Training')).toBeInTheDocument()
    expect(screen.queryByText('Want to train anyway?')).toBeNull()
  })

  it('falls back to the built-in workout without a plan', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    expect(await screen.findByText('Fri Workout')).toBeInTheDocument()
    expect(screen.getByText('🚀 Start Training')).toBeInTheDocument()
  })
})

describe('Workout tab — logging', () => {
  it('logs a set, starts the rest timer and remembers the workout across reloads', async () => {
    sb.set('fitness_plans', { data: withWorkoutOn('Friday'), error: null })
    show()
    await userEvent.click(await screen.findByText('🚀 Start Training'))
    const [weight, reps] = screen.getAllByPlaceholderText('0')
    await userEvent.type(weight, '50')
    await userEvent.type(reps, '10')
    await userEvent.click(screen.getByText('✓ Done — Start Rest Timer'))
    await waitFor(() => expect(localStorage.getItem('athrion_rest_end')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem('athrion_workout'))
    expect(saved.loggedSets[0]).toMatchObject({ ex: 'Goblet Squat', weight: 50, reps: 10 })
  })

  it('starts a free workout', async () => {
    sb.set('fitness_plans', { data: null, error: null })
    show()
    await userEvent.click(await screen.findByText('+ Free Workout'))
    expect(await screen.findByText('Pick exercises as you go')).toBeInTheDocument()
  })
})
