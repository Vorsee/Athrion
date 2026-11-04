import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@iconify/react', () => ({ Icon: () => null }))
const { pastEntry, default: LogPastWorkout } = await import('../../src/components/LogPastWorkout.jsx')

describe('logging a workout on an earlier day', () => {
  const toLb = v => v
  it('keeps filled rows only, numbers sets per exercise and adds up the volume', () => {
    const entry = pastEntry({
      date: '2026-11-02', name: '  Legs  ', minutes: '50', toLb,
      exercises: [
        { name: 'Back Squat', sets: [{ weight: '200', reps: '5' }, { weight: '', reps: '' }, { weight: '210', reps: '3' }] },
        { name: 'Plank', sets: [{ weight: '', reps: '45.5' }] },
      ],
    })
    expect(entry).toMatchObject({ date: '2026-11-02', name: 'Legs', duration: '50min', volume: 200 * 5 + 210 * 3 })
    expect(entry.sets.filter(s => s.ex === 'Back Squat').map(s => [s.set, s.weight, s.reps])).toEqual([[1, 200, 5], [2, 210, 3]])
  })
  it('caps the time at 4 hours and names an unnamed workout', () => {
    const entry = pastEntry({ date: '2026-11-01', name: '', minutes: '600', toLb, exercises: [] })
    expect(entry).toMatchObject({ name: 'Workout', duration: '240min', sets: [] })
  })
})

describe('Log a workout sheet', () => {
  it('adds exercises from the whole list, then takes weights and reps', async () => {
    const onSave = vi.fn(async () => {})
    render(<LogPastWorkout date="2026-11-02" onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tap exercises to add them' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add Front Squat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Front Squat' })) // a second tap takes it out
    await userEvent.click(screen.getByRole('button', { name: 'Add Front Squat' }))
    await userEvent.click(screen.getByRole('button', { name: /Next: weights and reps · 1 exercise/ }))
    await userEvent.type(screen.getByLabelText('Front Squat, set 1 weight in lb'), '135')
    await userEvent.type(screen.getByLabelText('Front Squat, set 1 reps'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Save workout · 1 set' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-02', volume: 1080, sets: [{ ex: 'Front Squat', set: 1, weight: 135, reps: 8 }] }))
  })
})
