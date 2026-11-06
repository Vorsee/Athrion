// Ages 13 to 15 (032): the teen's waiting screen and the parent's approval page
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let ParentGate, ParentConsent
beforeAll(async () => {
  ParentGate = (await import('../../src/components/ParentGate.jsx')).default
  ParentConsent = (await import('../../src/pages/ParentConsent.jsx')).default
})
beforeEach(() => {
  sb.reset()
  sb.supabase.functions = { invoke: vi.fn(async (_, { body }) => ({ data: { status: body.action === 'approve' ? 'approved' : body.action === 'view' ? 'pending' : 'pending', childName: 'Mia', childAge: 14 }, error: null })) }
})

describe('Teen waiting for a parent', () => {
  it('asks for the parent\'s email, then says it was sent', async () => {
    const changed = vi.fn()
    render(<ParentGate consent={null} age={14} onChanged={changed} />)
    expect(screen.getByText('Ask a parent')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Parent's email address"), 'mom@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Email my parent' }))
    expect(sb.supabase.functions.invoke).toHaveBeenCalledWith('parent-consent', { body: { action: 'request', age: 14, parentEmail: 'mom@example.com' } })
    expect(changed).toHaveBeenCalled()
  })
  it('waits while the request is pending', () => {
    render(<ParentGate consent={{ status: 'pending', parent_email: 'mom@example.com', child_age: 14 }} />)
    expect(screen.getByText('Waiting for your parent')).toBeInTheDocument()
    expect(screen.getByText('mom@example.com')).toBeInTheDocument()
  })
})

describe('Parent page', () => {
  it('approves only after the box is ticked', async () => {
    render(<ParentConsent token={"t".repeat(43)} />)
    expect(await screen.findByText('Mia (14) asked to use ATHRION')).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect(approve).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(approve)
    expect(sb.supabase.functions.invoke).toHaveBeenLastCalledWith('parent-consent', { body: { action: 'approve', token: 't'.repeat(43), agree: true } })
    expect(await screen.findByText('Mia can use ATHRION')).toBeInTheDocument()
  })
})
