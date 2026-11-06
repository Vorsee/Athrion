// The public landing page: what it says, what it costs, and the questions it answers
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'
import { PLANS, money, annualPerMonth, annualSavingPct } from '../../src/lib/pricing.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let Landing, FAQ
beforeAll(async () => { ({ default: Landing, FAQ } = await import('../../src/pages/Landing.jsx')) })

describe('Landing', () => {
  it('says what ATHRION is, that no card is needed, and the real prices', async () => {
    sb.set('app_reviews', { data: [], error: null })
    const start = vi.fn()
    render(<Landing onCreateAccount={start} onSignIn={() => {}} />)
    expect(screen.getByText(/A personal trainer that plans your week/)).toBeInTheDocument()
    expect(screen.getByText(/No card needed/)).toBeInTheDocument()
    expect(screen.getByText(money(PLANS.monthly.price))).toBeInTheDocument()
    expect(screen.getByText(`Yearly works out at ${money(annualPerMonth)} a month, ${annualSavingPct}% less.`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A plan that moves with you.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Snap your plate.' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start free, try Pro later' }))
    expect(start).toHaveBeenCalled()
  })

  it('answers the common questions, opening each on tap', async () => {
    sb.set('app_reviews', { data: [], error: null })
    render(<Landing onCreateAccount={() => {}} onSignIn={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument()
    for (const [q] of FAQ) expect(screen.getByText(q)).toBeInTheDocument()
    const first = screen.getByText(FAQ[0][0]).closest('details')
    expect(first.open).toBe(false)
    await userEvent.click(screen.getByText(FAQ[0][0]))
    expect(first.open).toBe(true)
  })

  it('keeps the prices in the page\'s structured data equal to pricing.js', () => {
    const html = readFileSync('index.html', 'utf8')
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
    const prices = ld.offers.map(o => Number(o.price))
    expect(prices).toEqual([0, PLANS.monthly.price, PLANS.annual.price])
  })
})
