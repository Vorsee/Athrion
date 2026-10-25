// The free 7-day plan at /guide: plan data, the signed-out hand-off to sign-up, and saving the workouts.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'
import { EXERCISES } from '../../src/lib/data.js'
import { GUIDE_GOALS, GUIDE_PLACES, guidePlan, readGuidePick, clearGuidePick } from '../../src/lib/guidePlans.js'
import Guide from '../../src/pages/Guide.jsx'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

// select returns the saved workouts given; insert echoes the new row
function savedWorkouts(existing) {
  sb.set('custom_workouts', q => q.ops[0][0] === 'insert'
    ? { data: { id: 'new', ...q.ops[0][1] }, error: null }
    : { data: existing, error: null })
}
const inserted = () => sb.queriesFor('custom_workouts').filter(q => q.ops[0][0] === 'insert').map(q => q.ops[0][1])

beforeEach(() => { sb.reset(); clearGuidePick() })

describe('guidePlan', () => {
  const names = new Set(EXERCISES.map(e => e.name))
  for (const [goal] of GUIDE_GOALS) for (const [place] of GUIDE_PLACES) {
    it(`${goal} at the ${place}: 7 days, 3 workouts, every exercise in the library`, () => {
      const plan = guidePlan(goal, place)
      expect(plan.days).toHaveLength(7)
      const workouts = plan.days.filter(d => d.type === 'workout')
      expect(workouts).toHaveLength(3)
      for (const w of workouts) for (const e of w.exercises) {
        expect(names.has(e.name), e.name).toBe(true)
        expect(e.sets).toBeGreaterThan(0)
      }
    })
  }

  it('falls back to muscle at the gym for unknown choices from the URL', () => {
    const plan = guidePlan('nope', 'moon')
    expect([plan.goal, plan.place]).toEqual(['muscle', 'gym'])
  })
})

describe('Guide page', () => {
  it('signed out: shows the week and hands the chosen plan to sign-up', async () => {
    const onStart = vi.fn()
    render(<Guide onStart={onStart} onSignIn={() => {}} />)
    expect(screen.getByText('Your 7-day workout plan')).toBeInTheDocument()
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Home' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Lose fat' }))
    expect(screen.getByText('Push-Up')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start this plan free' }))
    expect(onStart).toHaveBeenCalled()
    expect(readGuidePick()).toEqual({ goal: 'fat', place: 'home' })
  })

  it('signed in: saves the three sessions as workouts and clears the pick', async () => {
    savedWorkouts([])
    const onDone = vi.fn()
    render(<Guide signedIn initialPick={{ goal: 'fit', place: 'gym' }} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add to my workouts' }))
    expect(await screen.findByText(/Added 3 workouts to Train/)).toBeInTheDocument()
    expect(inserted().map(w => w.name)).toEqual(['Free week: Full body A', 'Free week: Full body B', 'Free week: Full body C'])
    expect(inserted()[0].exercises[0]).toBe('Squat')
    await userEvent.click(screen.getByRole('button', { name: 'Open Train' }))
    expect(onDone).toHaveBeenCalled()
    expect(readGuidePick()).toBe(null)
  })

  it('signed in on free: stops at the saved-workout limit and says why', async () => {
    savedWorkouts([{ id: 1, name: 'Push' }, { id: 2, name: 'Pull' }])
    render(<Guide signedIn />)
    await userEvent.click(screen.getByRole('button', { name: 'Add to my workouts' }))
    expect(await screen.findByText(/Added 1 workout to Train\. Free accounts keep 3/)).toBeInTheDocument()
    expect(inserted()).toHaveLength(1)
  })

  it('does not add the same session twice', async () => {
    savedWorkouts([{ id: 1, name: 'Free week: Full body A' }, { id: 2, name: 'Free week: Full body B' }, { id: 3, name: 'Free week: Full body C' }])
    render(<Guide signedIn isPro />)
    await userEvent.click(screen.getByRole('button', { name: 'Add to my workouts' }))
    expect(await screen.findByText('These workouts are already in Train.')).toBeInTheDocument()
    expect(inserted()).toHaveLength(0)
  })
})
