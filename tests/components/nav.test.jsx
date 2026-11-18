// The bottom bar's order, and the seasonal theme's touches on it
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@iconify/react', () => ({ Icon: ({ icon }) => <i data-icon={icon} /> }))

describe('Bottom bar', () => {
  afterEach(async () => { (await import('../../src/lib/theme.js')).applyTheme('dark') })

  it('runs Food, Plan, Train, Friends, Cardio, with Train in the middle', async () => {
    const Nav = (await import('../../src/components/Nav.jsx')).default
    render(<Nav page="workout" setPage={() => {}} session={{ name: 'Sam' }} onProfileClick={() => {}} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Food', 'Plan', 'Train', 'Friends', 'Cardio'])
    expect(tabs[2]).toHaveAttribute('aria-current', 'page')
  })

  it('gives Food a gingerbread man in the free Christmas theme', async () => {
    const { applyTheme, isProTheme } = await import('../../src/lib/theme.js')
    const Nav = (await import('../../src/components/Nav.jsx')).default
    expect(isProTheme('christmas')).toBe(false)
    applyTheme('christmas')
    render(<Nav page="workout" setPage={() => {}} session={{ name: 'Sam' }} onProfileClick={() => {}} />)
    const food = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Food' })
    expect(food.querySelector('[data-icon]')).toBeNull()
    expect(food.querySelector('svg')).not.toBeNull()
  })
})
