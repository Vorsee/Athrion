// The Cardio tab: Swim and Run, runs logged as cardio_logs with kind 'run'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb, USER } from '../helpers/supabaseMock.js'
import { todayKey } from '../../src/lib/data.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let Cardio, Run
beforeAll(async () => {
  Cardio = (await import('../../src/pages/Cardio.jsx')).default
  Run = (await import('../../src/pages/Run.jsx')).default
})
beforeEach(() => { sb.reset(); localStorage.clear() })

const run = { id: 'r1', user_id: USER.id, date: todayKey(), kind: 'run', distance_m: 5000, seconds: 1500, notes: '', created_at: new Date().toISOString() }
const swim = { ...run, id: 's1', kind: 'swim', distance_m: 1000, seconds: 1200 }

describe('Run', () => {
  it('shows only runs, with this week and the best pace, in miles for lb users', async () => {
    sb.set('cardio_logs', { data: [run, swim], error: null })
    render(<Run />)
    expect(await screen.findByText('Recent runs')).toBeInTheDocument()
    expect(screen.getAllByText('3.11 mi').length).toBeGreaterThan(0)
    expect(screen.getByText('8:03 /mi')).toBeInTheDocument() // 25:00 over 3.11 mi
    expect(screen.queryByText(/1,094 yd/)).toBeNull() // the swim isn't listed
  })

  it('logs a run as cardio_logs kind run, stored in metres and seconds', async () => {
    sb.set('cardio_logs', q => (sb.op(q, 'insert') ? { data: run, error: null } : { data: [], error: null }))
    render(<Run />)
    expect(await screen.findByText('No runs yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Log a run' }))
    await userEvent.type(screen.getByPlaceholderText('3.1'), '2')
    await userEvent.type(screen.getByPlaceholderText('28:30'), '18:00')
    expect(screen.getByText('9:00 /mi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save run' }))
    const insert = sb.queriesFor('cardio_logs').map(q => sb.op(q, 'insert')).find(Boolean)
    expect(insert[0]).toMatchObject({ kind: 'run', distance_m: 3218.7, seconds: 1080, date: todayKey() })
    expect(await screen.findByText('Run saved.')).toBeInTheDocument()
  })
})

describe('Cardio', () => {
  it('switches between Swim and Run and remembers the last one', async () => {
    localStorage.setItem('athrion_cardio_sport', 'run')
    sb.set('cardio_logs', { data: [], error: null })
    render(<Cardio />)
    expect(screen.getByRole('heading', { name: 'Cardio' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No runs yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Swim' }))
    expect(localStorage.getItem('athrion_cardio_sport')).toBe('swim')
    expect(await screen.findByRole('tab', { name: 'My swims' })).toBeInTheDocument()
  })

  it('opens Swim for a team link even when Run was last', async () => {
    localStorage.setItem('athrion_cardio_sport', 'run')
    render(<Cardio intent={{ tab: 'team' }} onIntentDone={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Swim' })).toHaveAttribute('aria-selected', 'true')
  })
})
