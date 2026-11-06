// Train's invite card: shown to someone with a nickname and no friends yet, gone once closed
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))
vi.mock('@iconify/react', () => ({ Icon: () => null }))

let InviteFriendsCard
beforeAll(async () => { InviteFriendsCard = (await import('../../src/components/InviteFriendsCard.jsx')).default })
beforeEach(() => { sb.reset(); localStorage.clear() })

const friends = list => sb.supabase.rpc.mockImplementation(async name => (name === 'my_friends' ? { data: list, error: null } : { data: null, error: null }))

describe('InviteFriendsCard', () => {
  it('offers the invite link to someone with no friends yet, and stays closed once closed', async () => {
    sb.set('social_profiles', { data: { nickname: 'mia', on_leaderboard: true }, error: null })
    friends([{ nickname: 'leo', status: 'pending', incoming: true }])
    const open = vi.fn()
    const { unmount } = render(<InviteFriendsCard onOpenGroup={open} />)
    expect(await screen.findByText('Train with friends')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open Together' }))
    expect(open).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Train with friends')).toBeNull()
    unmount()
    render(<InviteFriendsCard />)
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('Train with friends')).toBeNull()
  })

  it('stays hidden once they have a friend', async () => {
    sb.set('social_profiles', { data: { nickname: 'mia', on_leaderboard: true }, error: null })
    friends([{ nickname: 'leo', status: 'accepted' }])
    render(<InviteFriendsCard />)
    await waitFor(() => expect(sb.supabase.rpc).toHaveBeenCalledWith('my_friends'))
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('Train with friends')).toBeNull()
  })
})
