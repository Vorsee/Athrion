import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { Button, IconButton, SectionTitle, ExerciseRow, Fact, InlineError } from './ui/index.js'
import { createClub, previewClub, joinClub, leaveClub, deleteClub, removeClubMember, fetchClubBoard, clubUrl, clubShareText } from '../lib/clubApi.js'
import { CLUB_SIZE } from '../lib/pricing.js'

// Clubs on the Friends tab's leaderboard (039): each club is a board beside Friends and Everyone.
// This card lists them; a coach and club plan makes them, anyone 16+ joins with the link.

const INPUT = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors'

async function shareClub(club) {
  const url = clubUrl(club.code)
  try {
    if (navigator.share) return await navigator.share({ title: club.name, text: clubShareText(club.name), url })
  } catch (e) { if (e?.name === 'AbortError') return }
  try { await navigator.clipboard?.writeText(url) } catch { /* nothing to copy to */ }
}

export function ClubsCard({ clubs, coachPlan, onCoachPlan, onChanged, onOpenBoard }) {
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(null) // a club being managed

  return (
    <section>
      <SectionTitle action={coachPlan && <Button size="sm" variant="secondary" icon="mdi:plus" onClick={() => setCreating(true)}>New club</Button>}>Clubs</SectionTitle>
      {clubs.length > 0 ? (
        <div className="space-y-1.5">
          {clubs.map(c => (
            <ExerciseRow key={c.id} icon="mdi:account-group-outline" name={c.name}
              meta={`${c.members} of ${CLUB_SIZE}${c.is_owner ? ' · yours' : c.owner ? ` · @${c.owner}'s` : ''}`}>
              <Button size="sm" variant="secondary" onClick={() => onOpenBoard(c)}>Board</Button>
              <IconButton icon="mdi:dots-horizontal" label={`Manage ${c.name}`} onClick={() => setOpen(c)} />
            </ExerciseRow>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl p-4">
          <p className="text-sm text-ink-2">
            A club is a group of up to {CLUB_SIZE} with its own monthly board: a bootcamp, a run club, a team.
            {coachPlan ? ' Make one and share the link; members join free.' : ' Got an invite link? Open it to join.'}{!coachPlan && onCoachPlan ? ' Making a club comes with the coach and club plan.' : ''}
          </p>
          <div className="mt-3">
            {coachPlan
              ? <Button full icon="mdi:plus" onClick={() => setCreating(true)}>Make a club</Button>
              : onCoachPlan && <Button full variant="secondary" icon="mdi:account-group-outline" onClick={onCoachPlan}>See the coach and club plan</Button>}
          </div>
        </div>
      )}
      {creating && <CreateClubSheet onClose={() => setCreating(false)} onCreated={c => { setCreating(false); onChanged(); shareClub(c) }} />}
      {open && <ManageClubSheet club={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); onChanged() }} />}
    </section>
  )
}

function CreateClubSheet({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { onCreated(await createClub(name)) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet title="New club" onClose={onClose}>
      <label className="block">
        <span className="text-xs text-muted block mb-1">Club name</span>
        <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Tuesday bootcamp" className={INPUT} />
      </label>
      <p className="text-xs text-muted">Up to {CLUB_SIZE} people. You'll get a link to share; anyone 16 or older joins free.</p>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <Button full icon="mdi:check" onClick={save} disabled={busy || name.trim().length < 2}>{busy ? 'Making it…' : 'Make the club'}</Button>
    </Sheet>
  )
}

function ManageClubSheet({ club, onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { fetchClubBoard(club.id).then(setRows).catch(e => setErr(e.message)) }, [club.id])

  async function act(fn) {
    setErr('')
    try { await fn(); onChanged() } catch (e) { setErr(e.message) }
  }
  async function remove(nick) {
    setErr('')
    try { await removeClubMember(club.id, nick); setRows(r => r.filter(x => x.nickname !== nick)) } catch (e) { setErr(e.message) }
  }

  return (
    <Sheet title={club.name} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <Fact icon="mdi:account-multiple">{club.members} of {CLUB_SIZE}</Fact>
        {club.is_owner && <Fact icon="mdi:crown-outline">Yours</Fact>}
      </div>
      <Button full icon="mdi:share-variant-outline" onClick={() => shareClub(club)}>Invite people</Button>

      <section>
        <SectionTitle>Members</SectionTitle>
        {!rows ? <p className="text-sm text-muted">Loading…</p> : (
          <ul className="space-y-1.5">
            {rows.map(r => (
              <li key={r.nickname} className="flex items-center gap-3 bg-raised rounded-xl px-3 py-2">
                <span className="grow min-w-0 text-sm font-semibold text-ink truncate">@{r.nickname}{r.is_me ? <span className="text-muted font-normal"> (you)</span> : null}{r.is_owner ? <span className="text-muted font-normal"> · owner</span> : null}</span>
                {club.is_owner && !r.is_me && <IconButton icon="mdi:account-remove-outline" tone="danger" label={`Remove @${r.nickname}`} onClick={() => remove(r.nickname)} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {confirm ? (
        <div className="bg-raised rounded-xl p-3 space-y-2">
          <p className="text-sm text-ink-2">{club.is_owner && confirm === 'delete' ? 'Close the club for everyone? The board goes with it.' : club.is_owner ? 'Leave the club? It passes to the member who joined first.' : 'Leave the club?'}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Keep it</Button>
            <Button variant="danger" onClick={() => act(() => (confirm === 'delete' ? deleteClub(club.id) : leaveClub(club.id)))}>{confirm === 'delete' ? 'Close the club' : 'Leave'}</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
          <Button variant="secondary" icon="mdi:logout" onClick={() => setConfirm('leave')}>Leave</Button>
          {club.is_owner && <Button variant="secondary" icon="mdi:close-circle-outline" onClick={() => setConfirm('delete')}>Close club</Button>}
        </div>
      )}
    </Sheet>
  )
}

// An invite link, opened signed in (or remembered through sign-up): who it is, then join
export function JoinClubSheet({ code, minor = false, onClose, onJoined }) {
  const [club, setClub] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { previewClub(code).then(setClub).catch(() => setClub(null)) }, [code])

  async function join() {
    setBusy(true); setErr('')
    try { onJoined(await joinClub(code)) } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title="Join a club" onClose={onClose}>
      {club === undefined ? <p className="text-sm text-muted">Loading…</p>
        : club === null ? <InlineError>That club link doesn't work any more.</InlineError>
        : (
          <>
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-neon-tint border border-neon-stroke/25 flex items-center justify-center flex-shrink-0">
                <Icon icon="mdi:account-group-outline" width={24} className="text-neon-ink" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-xl text-ink break-words">{club.name}</div>
                <div className="text-sm text-muted">{club.owner ? `@${club.owner}'s club · ` : ''}{club.members} of {CLUB_SIZE}</div>
              </div>
            </div>
            <p className="text-sm text-ink-2">Members race on the club's own monthly board, by the same points as your other boards. They see your nickname and points, nothing else.</p>
            {err && <p role="alert" className="text-xs text-danger">{err}</p>}
            {minor ? <p role="status" className="text-sm text-ink-2 bg-raised rounded-xl p-3">Clubs open when you turn 16.</p>
              : club.joined ? <Button full onClick={() => onJoined(club)}>You're in: open the board</Button>
              : <Button full icon="mdi:account-plus-outline" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join the club'}</Button>}
          </>
        )}
    </Sheet>
  )
}
