// Block and report (037), by account id in a room or by nickname from Friends
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

import { blockUser, reportUser, fetchBlocks } from '../../src/lib/safetyApi.js'
import PersonSafetySheet from '../../src/components/PersonSafetySheet.jsx'

const calls = name => sb.supabase.rpc.mock.calls.filter(c => c[0] === name).map(c => c[1])
beforeEach(() => { sb.reset(); sb.supabase.rpc.mockResolvedValue({ data: null, error: null }) })

describe('safetyApi', () => {
  it('blocks and reports by id in a room, by nickname from Friends', async () => {
    await blockUser({ id: 'u2' })
    await blockUser({ nickname: 'alex' })
    await reportUser({ id: 'u2' }, 'spam', 'sells things', 's1')
    await reportUser({ nickname: 'alex' }, 'abuse')
    expect(calls('block_user')).toEqual([{ p_user: 'u2' }])
    expect(calls('block_nickname')).toEqual([{ p_nickname: 'alex' }])
    expect(calls('report_user')).toEqual([{ p_user: 'u2', p_reason: 'spam', p_details: 'sells things', p_session: 's1' }])
    expect(calls('report_nickname')).toEqual([{ p_nickname: 'alex', p_reason: 'abuse', p_details: '' }])
  })
  it('says plainly when 037 has not run yet, and lists no blocks', async () => {
    sb.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(blockUser({ id: 'u2' })).rejects.toThrow("Blocking isn't available yet")
    expect(await fetchBlocks()).toEqual([])
  })
})

describe('PersonSafetySheet', () => {
  it('reports with a reason, then offers to block too', async () => {
    const onBlocked = vi.fn()
    render(<PersonSafetySheet person={{ id: 'u2', name: 'alex' }} sessionId="s1" onClose={() => {}} onBlocked={onBlocked} />)
    await userEvent.click(screen.getByText('Report @alex'))
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Spam or scam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByText('Thanks. The ATHRION team will look at it.')).toBeInTheDocument()
    expect(calls('report_user')[0]).toMatchObject({ p_user: 'u2', p_reason: 'spam', p_session: 's1' })
    await userEvent.click(screen.getByRole('button', { name: 'Also block @alex' }))
    await userEvent.click(screen.getByRole('button', { name: 'Block' }))
    expect(calls('block_user')).toEqual([{ p_user: 'u2' }])
    expect(onBlocked).toHaveBeenCalled()
  })
})
