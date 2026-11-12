import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, Fact, EmptyState, Skeleton, InlineError, AvatarStack } from '../components/ui/index.js'
import { fetchRoomPreview, rememberRoomLink } from '../lib/roomLink.js'
import Brand from '../components/Brand.jsx'

// Public page behind a shared room link (athrion.app/r/<code>), for someone without an account
// yet: who invited them, the workout, how many are in. Joining needs an account, so it leads
// to sign-up, and the room opens straight after (the code is remembered).
export default function RoomPreview({ code, onStart, onSignIn, onHome }) {
  const [room, setRoom] = useState(undefined) // undefined loading, null error, { ended } or the room

  function load() {
    setRoom(undefined)
    fetchRoomPreview(code).then(setRoom)
  }
  useEffect(load, [code])

  const go = fn => () => { rememberRoomLink(code); fn() }
  const ended = room?.ended

  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm pt-safe">
      <header className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
        <button type="button" onClick={onHome} className="press min-h-[44px]" aria-label="ATHRION home"><Brand /></button>
        {!ended && <button type="button" onClick={go(onSignIn)} className="press min-h-[44px] px-3 text-sm font-semibold text-ink-2 hover:text-ink">Sign in</button>}
      </header>

      <main className="max-w-md mx-auto px-4 pb-16 space-y-4">
        {room === null && <InlineError onRetry={load}>Couldn't load this room. Check your signal and try again.</InlineError>}

        {ended ? (
          <EmptyState icon="mdi:door-closed" title="This room has ended" action="Start your own" actionIcon="mdi:arrow-right" onAction={onHome}>
            Rooms close 12 hours after the last set. Make a free account and open your own.
          </EmptyState>
        ) : room !== null && (
          <Card hero className="rise">
            <div className="flex items-center gap-2 text-xs font-semibold text-neon-ink">
              <span className="relative flex w-2 h-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-neon live-pulse" />
                <span className="relative w-2 h-2 rounded-full bg-neon" />
              </span>
              {room?.live ? 'Training now' : 'Waiting to start'}
            </div>
            {room ? (
              <h1 className="font-bold text-[1.75rem] xs:text-3xl leading-tight text-ink mt-1.5 break-words">
                {room.host ? `@${room.host} invited you` : "You're invited"}
              </h1>
            ) : <Skeleton className="h-9 w-56 mt-2" />}
            <p className="text-sm text-ink-2 mt-1.5">Train together live on ATHRION: everyone sees each set the moment it's logged.</p>

            <div className="flex flex-wrap gap-1.5 mt-4">
              <Fact icon="mdi:dumbbell">{room ? room.title || 'Workout' : '…'}</Fact>
              <Fact icon="mdi:account-multiple">{room ? `${room.people} ${room.people === 1 ? 'person' : 'people'} in` : '…'}</Fact>
            </div>

            <div className="flex items-center gap-3 mt-4 bg-raised rounded-xl px-3 py-3">
              <Icon icon="mdi:door-open" width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">Room code</div>
                <div className="font-bold text-2xl tracking-[0.15em] text-ink tabular-nums">{code}</div>
              </div>
              {room?.host && <AvatarStack names={[room.host]} seats={Math.max(0, Math.min(3, (room.people || 1)) - 1)} />}
            </div>

            <Button full icon="mdi:account-plus-outline" className="mt-5 h-14 text-base" onClick={go(onStart)}>Join free</Button>
            <p className="text-xs text-muted text-center mt-2">Make a free account and the room opens straight after. No card needed.</p>
          </Card>
        )}
      </main>
    </div>
  )
}
