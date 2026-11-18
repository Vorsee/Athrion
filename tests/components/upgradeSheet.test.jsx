// The coach and club plan stays out of sight until COACH_PLAN_ON_SALE (pricing.js)
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

describe('Coach plan not on sale', () => {
  it('offers Pro only, even when asked for the coach plan', async () => {
    const { COACH_PLAN_ON_SALE } = await import('../../src/lib/pricing.js')
    expect(COACH_PLAN_ON_SALE).toBe(false)
    const UpgradeSheet = (await import('../../src/components/UpgradeSheet.jsx')).default
    render(<UpgradeSheet onClose={() => {}} onCheckout={() => {}} initialKind="coach" />)
    expect(screen.getByRole('dialog', { name: 'ATHRION Pro' })).toBeInTheDocument()
    expect(screen.queryByText('Coach and club')).toBeNull()
    expect(screen.queryByText(/\$9\.99/)).toBeNull()
  })

  it('keeps it off the landing page', async () => {
    const Landing = (await import('../../src/pages/Landing.jsx')).default
    render(<Landing onCreateAccount={() => {}} onSignIn={() => {}} />)
    expect(screen.queryByText('Coach and club')).toBeNull()
    expect(screen.queryByText(/\$9\.99/)).toBeNull()
  })
})
