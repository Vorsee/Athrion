import { useState, useEffect } from 'react'
import { Card, Button, IconButton } from './ui/index.js'
import { fetchMySocial, fetchFriends, inviteUrl } from '../lib/socialApi.js'

const KEY = 'athrion_invite_card_closed'
const closed = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

// Train's nudge to bring friends in, for someone who has none yet: share the /add/<nickname>
// link in one tap. Goes away once they have a friend, or for good when closed.
export default function InviteFriendsCard({ onOpenGroup }) {
  const [nick, setNick] = useState(null)
  const [hidden, setHidden] = useState(closed)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (hidden) return
    let alive = true
    Promise.all([fetchMySocial(), fetchFriends()])
      .then(([me, friends]) => {
        if (alive && me?.nickname && !(friends ?? []).some(f => f.status === 'accepted')) setNick(me.nickname)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [hidden])

  if (hidden || !nick) return null

  function close() {
    try { localStorage.setItem(KEY, '1') } catch { /* only a convenience */ }
    setHidden(true)
  }

  async function share() {
    const url = inviteUrl(nick)
    try {
      if (navigator.share) await navigator.share({ title: 'ATHRION', text: `Train with me on ATHRION: @${nick}`, url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    } catch { /* closing the share sheet is not an error */ }
  }

  return (
    <Card className="fade-in">
      <div className="flex items-start gap-3">
        <div className="grow min-w-0">
          <div className="font-bold text-lg text-ink">Train with friends</div>
          <p className="text-sm text-ink-2 mt-1">Send your link. Friends who open it are added to your list, and you can work out together in a room and race on the monthly leaderboard.</p>
        </div>
        <IconButton icon="mdi:close" label="Close" onClick={close} className="w-9 h-9 -mt-1 -mr-1" />
      </div>
      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
        <Button icon={copied ? 'mdi:check' : 'mdi:share-variant-outline'} onClick={share}>{copied ? 'Link copied' : 'Share invite link'}</Button>
        {onOpenGroup && <Button variant="secondary" icon="mdi:account-group-outline" onClick={onOpenGroup}>Open Together</Button>}
      </div>
    </Card>
  )
}
