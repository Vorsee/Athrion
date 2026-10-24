import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: ({ icon }) => <i data-icon={icon} /> }))

const demo = {
  name: 'Barbell Bench Press', gif: 'https://gif/1.gif', images: [],
  primaryMuscles: ['pectorals'], secondaryMuscles: ['triceps', 'deltoids', 'lats'], equipment: 'barbell',
  instructions: ['Settle onto a bench.', 'Press the bar.'],
}
const exerciseDb = vi.hoisted(() => ({
  findDemo: vi.fn(), findAlternatives: vi.fn(),
  imageUrl: p => `https://img/${p}`, youtubeSearchUrl: n => `https://yt/${encodeURIComponent(n)}`,
}))
vi.mock('../../src/lib/exerciseDb.js', () => exerciseDb)

const push = vi.hoisted(() => ({
  pushSupported: vi.fn(() => true), needsHomeScreenInstall: vi.fn(() => false),
  currentSubscription: vi.fn(async () => null), enablePush: vi.fn(async () => ({})), disablePush: vi.fn(async () => {}),
  sendTestPush: vi.fn(async () => ({ sent: 1 })),
}))
vi.mock('../../src/lib/push.js', () => push)

import Sheet from '../../src/components/Sheet.jsx'
import LineChart from '../../src/components/LineChart.jsx'
import { DemoButton, ExerciseDemoSheet, SwapSheet } from '../../src/components/ExerciseDemo.jsx'
import ReminderSettings from '../../src/components/ReminderSettings.jsx'
import Nav from '../../src/components/Nav.jsx'
import AdaptiveNutritionCard from '../../src/components/AdaptiveNutritionCard.jsx'

beforeEach(() => {
  sb.reset()
  global.ResizeObserver = class { observe() {} disconnect() {} }
})

describe('Sheet', () => {
  it('renders into the body above the page and closes on backdrop or the close button, not on content clicks', async () => {
    const onClose = vi.fn()
    const { container } = render(<div><Sheet title="Pick" onClose={onClose} footer={<span>Foot</span>}><p>Body</p></Sheet></div>)
    expect(container).not.toHaveTextContent('Body') // portalled
    expect(document.body).toHaveTextContent('Body')
    await userEvent.click(screen.getByText('Body'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.z-\\[60\\]')).toBeTruthy()
  })
  it('is a labelled dialog that closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Sheet title="Pick" onClose={onClose}><p>Body</p></Sheet>)
    expect(screen.getByRole('dialog', { name: 'Pick' })).toHaveAttribute('aria-modal', 'true')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('LineChart', () => {
  const data = [{ date: '2026-10-01T12:00:00Z', value: 182 }, { date: '2026-10-15T12:00:00Z', value: 180.5 }, { date: '2026-10-08T12:00:00Z', value: null }]
  it('asks for more data with fewer than two points', () => {
    render(<LineChart data={[{ date: '2026-10-01', value: 180 }]} />)
    expect(screen.getByText(/at least two entries/)).toBeInTheDocument()
  })
  it('labels the chart for screen readers and offers a table view', async () => {
    render(<LineChart data={data} unit="lb" label="Weight" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Weight over time, latest 180\.5/)
    await userEvent.click(screen.getByText('Show as table'))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2 valid points; null skipped
  })

  describe('regression: fixed in the October 2026 review', () => {
    // Date-only strings parse as UTC midnight, so in the Americas every label shows the day before
    it('a weigh-in dated 2026-10-23 is labelled Oct 23', async () => {
      render(<LineChart data={[{ date: '2026-10-22', value: 181 }, { date: '2026-10-23', value: 180 }]} />)
      await userEvent.click(screen.getByText('Show as table'))
      expect(screen.getByRole('table')).toHaveTextContent('Oct 23')
    })
  })
})

describe('ExerciseDemo', () => {
  it('opens the How To sheet with instructions and muscles but no animation (hidden for now)', async () => {
    exerciseDb.findDemo.mockResolvedValue(demo)
    render(<DemoButton name="Bench Press" />)
    await userEvent.click(screen.getByLabelText('How to do Bench Press'))
    expect(await screen.findByText('Settle onto a bench.')).toBeInTheDocument()
    expect(screen.getByText('pectorals')).toBeInTheDocument()
    expect(screen.getByText('Steps for: Barbell Bench Press')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('Watch a video').closest('a')).toHaveAttribute('href', 'https://yt/Bench%20Press')
  })
  it('explains when there is no demo or the library is down', async () => {
    exerciseDb.findDemo.mockResolvedValueOnce(null)
    const { unmount } = render(<ExerciseDemoSheet name="Mystery" onClose={() => {}} />)
    expect(await screen.findByText(/don't have a demo/)).toBeInTheDocument()
    unmount()
    exerciseDb.findDemo.mockRejectedValueOnce(new Error('down'))
    render(<ExerciseDemoSheet name="Mystery" onClose={() => {}} />)
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
  })
  it('offers easier, harder and similar swaps', async () => {
    exerciseDb.findAlternatives.mockResolvedValue([{ name: 'Dumbbell Bench Press', equipment: 'dumbbell' }])
    const onSwap = vi.fn()
    render(<SwapSheet exercise={{ name: 'Bench Press', easierVersion: 'Push-Up', harderVersion: 'Weighted Dip' }} onSwap={onSwap} onClose={() => {}} />)
    await userEvent.click(await screen.findByText('Dumbbell Bench Press'))
    expect(onSwap).toHaveBeenCalledWith('Dumbbell Bench Press')
    expect(screen.getByText('Easier')).toBeInTheDocument()
    expect(screen.getByText('Harder')).toBeInTheDocument()
  })
})

describe('ReminderSettings', () => {
  it('turns reminders on: subscribes to push and saves settings with the timezone', async () => {
    sb.set('reminder_settings', { data: null, error: null })
    render(<ReminderSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Workout reminders' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(push.enablePush).toHaveBeenCalled()
    const upsert = sb.op(sb.queriesFor('reminder_settings').at(-1), 'upsert')[0]
    expect(upsert).toMatchObject({ enabled: true, reminder_hour: 18, timezone: 'America/New_York' })
    expect(screen.getByText(/reminder around 6\s?PM/i)).toBeInTheDocument()
  })
  it('sends a test notification once reminders are on', async () => {
    sb.set('reminder_settings', { data: { enabled: true, reminder_hour: 7, streak_warnings: true }, error: null })
    push.currentSubscription.mockResolvedValueOnce({ endpoint: 'x' })
    render(<ReminderSettings />)
    await userEvent.click(await screen.findByText('Send test notification'))
    expect(push.sendTestPush).toHaveBeenCalled()
    expect(await screen.findByText(/Test sent/)).toBeInTheDocument()
  })
  it('hides the test button while reminders are off', async () => {
    render(<ReminderSettings />)
    await screen.findByRole('switch')
    expect(screen.queryByText('Send test notification')).toBeNull()
  })
  it('shows the push error when permission is refused', async () => {
    push.enablePush.mockRejectedValueOnce(new Error('Notifications are blocked.'))
    render(<ReminderSettings />)
    await userEvent.click(await screen.findByRole('switch'))
    expect(await screen.findByText('Notifications are blocked.')).toBeInTheDocument()
  })
  it('tells iPhone users to install to the home screen', async () => {
    push.needsHomeScreenInstall.mockReturnValueOnce(true).mockReturnValue(true)
    render(<ReminderSettings />)
    expect(await screen.findByText(/add ATHRION to your Home Screen/)).toBeInTheDocument()
    push.needsHomeScreenInstall.mockReturnValue(false)
  })
})

describe('Nav', () => {
  it('has four tabs and switches pages', async () => {
    const setPage = vi.fn()
    render(<Nav page="workout" setPage={setPage} session={{ name: 'Sam', email: 's@x' }} isPro={false} onProfileClick={() => {}} />)
    expect(screen.getByRole('navigation').querySelectorAll('button')).toHaveLength(4)
    for (const label of ['Plan', 'Calories', 'Progress']) await userEvent.click(screen.getByText(label))
    expect(setPage.mock.calls.map(c => c[0])).toEqual(['plan', 'calories', 'progress'])
  })
  it('keeps Workout highlighted on pages opened from it', () => {
    render(<Nav page="library" setPage={() => {}} session={{ name: 'Sam', email: 's@x' }} isPro onProfileClick={() => {}} />)
    expect(screen.getByText('Workout').closest('button')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })
})

describe('AdaptiveNutritionCard', () => {
  it('shows what data is still needed before it can adapt', async () => {
    sb.set('body_measurements', { data: [], error: null })
    sb.set('progress_checkins', { data: [], error: null })
    sb.set('fitness_profiles', { data: { primary_goal: 'lose_weight' }, error: null })
    render(<AdaptiveNutritionCard calorieLogs={[]} current={{ calorie_target: 2000 }} profile={{ sex: 'male' }} />)
    expect(await screen.findByText('Days logged')).toBeInTheDocument()
    expect(screen.queryByText('Apply New Targets')).toBeNull()
  })
})
