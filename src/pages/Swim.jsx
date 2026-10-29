import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, SectionTitle, Segmented, EmptyState, SkeletonRows, InlineError, PageHeader, Fact, InfoButton } from '../components/ui/index.js'
import { fetchCardio, saveCardio, deleteCardio } from '../lib/progressApi.js'
import { cardioUnits, parseDuration, fmtDuration, fmtDistance, paceSecs } from '../lib/cardio.js'
import { STROKES, strokeLabel, strokeStats, daysAgo, swimInviteLink, clearSwimInvite } from '../lib/swim.js'
import {
  photoUrls, fetchMyPhoto, uploadMyPhoto, fetchCoachedTeam, saveTeam, newTeamCode, fetchRoster, fetchSwimmerSwims,
  respondToSwimmer, fetchMyTeam, teamByCode, leaveTeam, searchTeams, joinTeam,
} from '../lib/swimApi.js'
import { shareLink } from '../lib/shopLink.js'
import { useUnit } from '../lib/units.js'
import { todayKey } from '../lib/data.js'

const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const inputCls = 'w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40'

function useSwimUnits() {
  const { unit } = useUnit()
  return cardioUnits('swim', unit)
}

// ── Shared pieces ────────────────────────────────────────────────────────────

// A round photo, or the first letter of the nickname
export function Photo({ url, name, size = 48 }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} loading="lazy" className="rounded-full object-cover flex-shrink-0 bg-raised" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="rounded-full bg-neon/15 border border-neon-stroke/20 flex items-center justify-center flex-shrink-0 font-bold text-neon-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || '?')[0].toUpperCase()}
    </span>
  )
}

// One tile per stroke: its PR pace, the longest swim and the last session
export function StrokeGrid({ swims, selected, onSelect }) {
  const u = useSwimUnits()
  const stats = strokeStats(swims)
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))' }}>
      {STROKES.map(s => {
        const st = stats[s.id]
        const on = selected === s.id
        return (
          <button key={s.id} type="button" onClick={() => onSelect(on ? null : s.id)} aria-pressed={on}
            className={`press text-left rounded-2xl border p-3 transition-colors ${on ? 'bg-neon/10 border-neon-stroke/60' : 'bg-surface border-line hover:border-line-strong'}`}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${st.count ? 'bg-neon text-on-neon' : 'bg-raised text-muted'}`}>{s.short}</span>
              <span className="text-sm font-semibold text-ink leading-tight break-words min-w-0">{s.label}</span>
            </span>
            {st.count ? (
              <>
                <span className="block mt-3 text-xs font-semibold text-muted">PR pace</span>
                <span className="block text-2xl font-bold text-neon-ink tabular-nums leading-tight">
                  {st.pr ? fmtDuration(paceSecs(st.pr, u)) : '–'}
                  <span className="text-xs font-semibold text-muted"> /{u.per}</span>
                </span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2 tabular-nums">
                  <span><span className="text-muted">Longest </span>{fmtDistance(st.longest.distance_m, u)}</span>
                  <span><span className="text-muted">Last </span>{daysAgo(st.last.date)}</span>
                </span>
                <span className="block text-xs text-muted tabular-nums">
                  {fmtDistance(st.last.distance_m, u)} in {fmtDuration(st.last.seconds)}
                </span>
              </>
            ) : (
              <span className="block mt-3 text-xs text-muted">No swims yet</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function SwimList({ swims, onDelete }) {
  const u = useSwimUnits()
  return (
    <div className="divide-y divide-line">
      {swims.slice(0, 40).map(l => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center text-xs font-bold text-neon-ink flex-shrink-0">
            {STROKES.find(s => s.id === l.stroke)?.short ?? <Icon icon="mdi:swim" width={20} />}
          </span>
          <div className="grow basis-0 min-w-[7rem]">
            <div className="text-sm font-semibold text-ink tabular-nums">{fmtDistance(l.distance_m, u)} · {fmtDuration(l.seconds)}</div>
            <div className="text-xs text-muted break-words">
              {fmtDate(l.date)}{l.stroke ? ` · ${strokeLabel(l.stroke)}` : ''} · {fmtDuration(paceSecs(l, u))} /{u.per}{l.notes ? ` · ${l.notes}` : ''}
            </div>
          </div>
          {onDelete && (
            <button onClick={() => onDelete(l)} aria-label={`Delete swim on ${fmtDate(l.date)}`}
              className="press w-9 h-9 inline-flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/12 ml-auto">
              <Icon icon="mdi:close" width={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── My swims ─────────────────────────────────────────────────────────────────

function LogSwim({ stroke, setStroke, onSaved }) {
  const u = useSwimUnits()
  const [form, setForm] = useState({ date: todayKey(), distance: '', time: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const distance = parseFloat(form.distance)
  const seconds = parseDuration(form.time)
  const pace = distance > 0 && seconds ? fmtDuration(paceSecs({ seconds, distance_m: u.toM(distance) }, u)) : null

  async function save() {
    setSaving(true); setErr('')
    try {
      if (!(distance > 0)) throw new Error(`Enter the distance in ${u.dist}`)
      if (!seconds) throw new Error('Enter the time, like 32:00 or 1:05:00')
      await saveCardio({ date: form.date, kind: 'swim', stroke, distance_m: Math.round(u.toM(distance) * 10) / 10, seconds, notes: form.notes.trim().slice(0, 300) })
      setForm({ date: todayKey(), distance: '', time: '', notes: '' })
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionTitle>Log a swim</SectionTitle>
      <Segmented options={STROKES.map(s => [s.id, s.label])} value={stroke} onChange={setStroke} label="Stroke" kind="choice" scroll />
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <label className="block">
          <span className="text-xs text-muted">Distance ({u.dist})</span>
          <input type="number" inputMode="decimal" step="25" value={form.distance} placeholder={u.dist === 'm' ? '1500' : '1650'}
            onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Time</span>
          <input inputMode="numeric" value={form.time} placeholder="32:00"
            onChange={e => setForm(f => ({ ...f, time: e.target.value.replace(/[^\d:]/g, '').slice(0, 8) }))} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Date</span>
          <input type="date" value={form.date} max={todayKey()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={`mt-1 ${inputCls}`} />
        </label>
        <div className="flex flex-col justify-end">
          <span className="text-xs text-muted">Pace</span>
          <span className="mt-1 min-h-[38px] flex items-center text-sm font-bold text-neon-ink tabular-nums">{pace ? `${pace} /${u.per}` : '–'}</span>
        </div>
      </div>
      <input value={form.notes} maxLength={300} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        placeholder="Notes: drills, kick sets, open water" aria-label="Notes" className={`mt-3 ${inputCls}`} />
      <Button full onClick={save} disabled={saving} className="mt-3">{saving ? 'Saving...' : `Save ${strokeLabel(stroke).toLowerCase()} swim`}</Button>
      {err && <p role="alert" className="text-xs text-danger mt-2">{err}</p>}
    </Card>
  )
}

function MySwims({ swims, onChanged }) {
  const u = useSwimUnits()
  const [stroke, setStroke] = useState('free')
  const [filter, setFilter] = useState(null)
  const shown = filter ? swims.filter(l => l.stroke === filter) : swims

  function pick(id) {
    setFilter(id)
    if (id) setStroke(id)
  }

  return (
    <div className="space-y-4">
      <section aria-label="Strokes">
        <SectionTitle action={<InfoButton title="Strokes">
          PR pace is your fastest time per {u.per} on any swim of at least one pool length. Tap a stroke to see only those swims and log that stroke.
        </InfoButton>}>Strokes</SectionTitle>
        <StrokeGrid swims={swims} selected={filter} onSelect={pick} />
      </section>

      <LogSwim stroke={stroke} setStroke={setStroke} onSaved={onChanged} />

      {shown.length > 0 ? (
        <Card>
          <SectionTitle action={filter && <button onClick={() => setFilter(null)} className="press text-xs font-semibold text-neon-ink min-h-[32px]">Show all</button>}>
            {filter ? `${strokeLabel(filter)} swims` : 'History'}
          </SectionTitle>
          <SwimList swims={shown} onDelete={l => deleteCardio(l.id).then(onChanged)} />
        </Card>
      ) : (
        <EmptyState icon="mdi:swim" title={filter ? `No ${strokeLabel(filter).toLowerCase()} swims yet` : 'No swims yet'}>
          Log one above to see your PR pace and last session for each stroke.
        </EmptyState>
      )}
    </div>
  )
}

// ── Team ─────────────────────────────────────────────────────────────────────

function PhotoCard({ path, url, onChanged, coach }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try { await uploadMyPhoto(file); onChanged() } catch (x) { setErr(x.message || 'Could not upload') } finally { setBusy(false) }
  }
  return (
    <Card className="flex flex-wrap items-center gap-3">
      <Photo url={url} name="You" size={56} />
      <div className="grow basis-0 min-w-[8rem]">
        <div className="text-sm font-semibold text-ink">Your photo</div>
        <div className="text-xs text-muted">{coach ? 'Your swimmers see it.' : 'Only your coach sees it.'}</div>
        {err && <p role="alert" className="text-xs text-danger mt-1">{err}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="hidden" aria-label="Choose a photo" />
      <Button size="sm" variant="secondary" icon="mdi:camera-outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Uploading...' : path ? 'Change' : 'Add photo'}
      </Button>
    </Card>
  )
}

function InviteCard({ code, onJoined, onDismiss }) {
  const [team, setTeam] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { teamByCode(code).then(setTeam).catch(() => setTeam(null)) }, [code])
  if (team === undefined) return <SkeletonRows rows={1} label="Loading the invite" />

  async function join() {
    setBusy(true); setErr('')
    try { await joinTeam({ code }); clearSwimInvite(); onJoined() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Card hero className="space-y-3">
      {team ? (
        <>
          <div>
            <div className="text-xs font-semibold text-neon-ink">Team invite</div>
            <div className="text-xl font-bold text-ink break-words">{team.name}</div>
            {team.coach_nickname && <div className="text-sm text-muted">Coach @{team.coach_nickname}</div>}
          </div>
          <p className="text-xs text-muted">Your coach will see your photo and your swims. Nothing else.</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
            <Button onClick={join} disabled={busy} icon="mdi:account-plus-outline">{busy ? 'Joining...' : 'Join the team'}</Button>
            <Button variant="secondary" onClick={() => { clearSwimInvite(); onDismiss() }}>Not now</Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-semibold text-ink">This invite link no longer works</div>
          <p className="text-xs text-muted">Ask your coach for a new one, or find the team below.</p>
          <Button size="sm" variant="secondary" onClick={() => { clearSwimInvite(); onDismiss() }}>OK</Button>
        </>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </Card>
  )
}

function FindTeam({ onJoined }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setState('idle'); return }
    setState('loading')
    const t = setTimeout(() => {
      searchTeams(q).then(r => { setResults(r); setState('done') }).catch(() => setState('error'))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function ask(team) {
    setBusy(team.id); setErr('')
    try { await joinTeam({ team: team.id }); onJoined() } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  return (
    <section aria-label="Find your team" className="space-y-2">
      <SectionTitle>Find your team</SectionTitle>
      <label className="relative block">
        <span className="sr-only">Search teams or coaches</span>
        <Icon icon="mdi:magnify" width={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Team name or coach's @nickname"
          className="w-full min-h-[44px] bg-surface border border-line rounded-2xl pl-11 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-neon-stroke/50" />
      </label>
      {state === 'loading' && <p className="text-xs text-muted px-1">Searching...</p>}
      {state === 'error' && <p className="text-xs text-danger px-1">Couldn't search. Try again.</p>}
      {state === 'done' && results.length === 0 && <p className="text-sm text-muted text-center py-3">No team matches "{q.trim()}".</p>}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(t => (
            <div key={t.id} className="bg-surface border border-line rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Icon icon="mdi:swim" width={24} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
              <span className="grow basis-0 min-w-[7rem]">
                <span className="block text-sm font-semibold text-ink break-words">{t.name}</span>
                <span className="block text-xs text-muted">
                  {t.coach_nickname ? `@${t.coach_nickname} · ` : ''}{t.swimmers} {t.swimmers === 1 ? 'swimmer' : 'swimmers'}
                </span>
              </span>
              <Button size="sm" onClick={() => ask(t)} disabled={busy === t.id} className="ml-auto">{busy === t.id ? 'Asking...' : 'Ask to join'}</Button>
            </div>
          ))}
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger px-1">{err}</p>}
    </section>
  )
}

function StartTeam({ onStarted }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function start(e) {
    e.preventDefault()
    if (name.trim().length < 2) { setErr('Give the team a name of at least 2 letters'); return }
    setBusy(true); setErr('')
    try { await saveTeam(name.trim()); onStarted() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Icon icon="mdi:whistle-outline" width={26} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
        <div className="grow basis-0 min-w-[8rem]">
          <div className="text-sm font-semibold text-ink">Coach a team</div>
          <div className="text-xs text-muted">Invite your swimmers and follow every stroke they log.</div>
        </div>
        {!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Become a coach</Button>}
      </div>
      {open && (
        <form onSubmit={start} className="space-y-2">
          <label className="block">
            <span className="text-xs text-muted">Team name</span>
            <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Riverside masters" autoFocus className={`mt-1 ${inputCls}`} />
          </label>
          <Button full type="submit" disabled={busy}>{busy ? 'Starting...' : 'Start my team'}</Button>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        </form>
      )}
    </Card>
  )
}

function MyTeamCard({ team, coachUrl, onLeft }) {
  const [busy, setBusy] = useState(false)
  const pending = team.status === 'pending'
  async function leave() {
    if (!pending && !window.confirm(`Leave ${team.name}? Your coach stops seeing your swims.`)) return
    setBusy(true)
    try { await leaveTeam(); onLeft() } finally { setBusy(false) }
  }
  return (
    <Card hero className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Photo url={coachUrl} name={team.coach_nickname} size={56} />
        <div className="grow basis-0 min-w-[8rem]">
          <div className="text-xs font-semibold text-neon-ink">{pending ? 'Request sent' : 'Your team'}</div>
          <div className="text-xl font-bold text-ink break-words leading-tight">{team.name}</div>
          {team.coach_nickname && <div className="text-sm text-muted">Coach @{team.coach_nickname}</div>}
        </div>
      </div>
      <p className="text-xs text-muted">
        {pending ? 'Waiting for the coach to accept. You can keep logging swims meanwhile.' : 'Your coach sees your photo and your swims, stroke by stroke.'}
      </p>
      <Button size="sm" variant="secondary" onClick={leave} disabled={busy}>{pending ? 'Cancel request' : 'Leave team'}</Button>
    </Card>
  )
}

function CoachView({ team, roster, urls, onChanged, onOpenSwimmer }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  const requests = roster.filter(r => r.status === 'pending')
  const swimmers = roster.filter(r => r.status === 'active')

  async function rename(e) {
    e.preventDefault()
    if (name.trim().length < 2) return
    try { await saveTeam(name.trim()); setEditing(false); onChanged() } catch (x) { setErr(x.message) }
  }
  async function share() {
    const was = await shareLink(swimInviteLink(team.code), `Join ${team.name} on ATHRION`)
    if (was) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  async function resetLink() {
    if (!window.confirm('Make a new invite link? The old one stops working.')) return
    try { await newTeamCode(); onChanged() } catch (x) { setErr(x.message) }
  }
  async function respond(r, accept) {
    setBusy(r.user_id)
    try { await respondToSwimmer(r.user_id, accept); onChanged() } catch (x) { setErr(x.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <Card hero className="space-y-3">
        {editing ? (
          <form onSubmit={rename} className="flex flex-wrap gap-2">
            <label className="grow basis-0 min-w-[8rem]">
              <span className="sr-only">Team name</span>
              <input value={name} maxLength={40} onChange={e => setName(e.target.value)} autoFocus className={inputCls} />
            </label>
            <Button size="sm" type="submit">Save</Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            <div className="grow basis-0 min-w-[8rem]">
              <div className="text-xs font-semibold text-neon-ink">You coach</div>
              <div className="text-2xl font-bold text-ink break-words leading-tight">{team.name}</div>
            </div>
            <button onClick={() => setEditing(true)} className="press text-xs font-semibold text-ink-2 hover:text-ink min-h-[36px] px-2">Rename</button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Fact icon="mdi:account-group-outline">{swimmers.length} {swimmers.length === 1 ? 'swimmer' : 'swimmers'}</Fact>
          {requests.length > 0 && <Fact icon="mdi:account-clock-outline">{requests.length} waiting</Fact>}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
          <Button icon="mdi:share-variant-outline" onClick={share}>{copied ? 'Link copied' : 'Invite swimmers'}</Button>
          <Button variant="secondary" icon="mdi:link-variant-off" onClick={resetLink}>New link</Button>
        </div>
        <p className="text-xs text-muted">The link adds swimmers straight to your team. Swimmers who find you in search ask first.</p>
      </Card>

      {requests.length > 0 && (
        <section aria-label="Asking to join">
          <SectionTitle>Asking to join</SectionTitle>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.user_id} className="bg-surface border border-line rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Photo url={urls[r.photo_path]} name={r.nickname} size={44} />
                <span className="grow basis-0 min-w-[6rem] text-sm font-semibold text-ink break-words">@{r.nickname ?? 'swimmer'}</span>
                <span className="flex gap-2 ml-auto">
                  <Button size="sm" onClick={() => respond(r, true)} disabled={busy === r.user_id}>Accept</Button>
                  <Button size="sm" variant="secondary" onClick={() => respond(r, false)} disabled={busy === r.user_id}>Decline</Button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Swimmers">
        <SectionTitle>Swimmers</SectionTitle>
        {swimmers.length ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 7.5rem), 1fr))' }}>
            {swimmers.map(r => (
              <button key={r.user_id} type="button" onClick={() => onOpenSwimmer(r)}
                className="press bg-surface border border-line hover:border-line-strong rounded-2xl p-3 flex flex-col items-center text-center gap-2">
                <Photo url={urls[r.photo_path]} name={r.nickname} size={64} />
                <span className="text-[0.8125rem] font-semibold text-ink [overflow-wrap:anywhere] leading-tight">@{r.nickname ?? 'swimmer'}</span>
                <span className="text-xs text-muted">{r.last_swim ? `Swam ${daysAgo(r.last_swim)}` : 'No swims yet'}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="mdi:account-group-outline" title="No swimmers yet">
            Send your invite link, or tell swimmers to search for {team.name}.
          </EmptyState>
        )}
      </section>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  )
}

function SwimmerPage({ swimmer, url, onRemoved }) {
  const u = useSwimUnits()
  const [swims, setSwims] = useState(null)
  const [filter, setFilter] = useState(null)
  const [error, setError] = useState(false)
  const load = () => { setError(false); fetchSwimmerSwims(swimmer.user_id).then(setSwims).catch(() => setError(true)) }
  useEffect(load, [swimmer.user_id])

  async function remove() {
    if (!window.confirm(`Remove @${swimmer.nickname} from your team?`)) return
    await respondToSwimmer(swimmer.user_id, false)
    onRemoved()
  }
  const shown = swims ? (filter ? swims.filter(l => l.stroke === filter) : swims) : []

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="flex flex-wrap items-center gap-4">
        <Photo url={url} name={swimmer.nickname} size={88} />
        <div className="grow basis-0 min-w-[8rem]">
          <h1 className="font-bold text-2xl text-ink leading-tight break-all">@{swimmer.nickname ?? 'swimmer'}</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Fact icon="mdi:calendar-month-outline">{swimmer.swims_30d} swims in 30 days</Fact>
            {Number(swimmer.metres_30d) > 0 && <Fact icon="mdi:swim">{fmtDistance(swimmer.metres_30d, u)}</Fact>}
          </div>
        </div>
      </div>

      {error && <InlineError onRetry={load}>Couldn't load their swims.</InlineError>}
      {!swims && !error && <SkeletonRows rows={4} label="Loading swims" />}
      {swims && (
        <>
          <section aria-label="Strokes">
            <SectionTitle>Strokes</SectionTitle>
            <StrokeGrid swims={swims} selected={filter} onSelect={setFilter} />
          </section>
          {shown.length > 0 ? (
            <Card>
              <SectionTitle action={filter && <button onClick={() => setFilter(null)} className="press text-xs font-semibold text-neon-ink min-h-[32px]">Show all</button>}>
                {filter ? `${strokeLabel(filter)} swims` : 'Recent swims'}
              </SectionTitle>
              <SwimList swims={shown} />
            </Card>
          ) : (
            <EmptyState icon="mdi:swim" title="No swims logged">
              {filter ? `No ${strokeLabel(filter).toLowerCase()} swims yet.` : 'Their swims show here as soon as they log one.'}
            </EmptyState>
          )}
        </>
      )}

      <button onClick={remove} className="press w-full min-h-[44px] text-sm font-semibold text-muted hover:text-danger">Remove from team</button>
    </div>
  )
}

function Team({ invite, onInviteDone, onOpenSwimmer, reload, data }) {
  const { coached, mine, roster, myPhoto, urls } = data
  return (
    <div className="space-y-4">
      {invite && !coached && <InviteCard code={invite} onJoined={() => { onInviteDone(); reload() }} onDismiss={onInviteDone} />}
      {coached ? (
        <CoachView team={coached} roster={roster} urls={urls} onChanged={reload} onOpenSwimmer={onOpenSwimmer} />
      ) : mine ? (
        <MyTeamCard team={mine} coachUrl={urls[mine.coach_photo]} onLeft={reload} />
      ) : (
        <FindTeam onJoined={reload} />
      )}
      <PhotoCard path={myPhoto} url={urls[myPhoto]} onChanged={reload} coach={!!coached} />
      {!coached && !mine && <StartTeam onStarted={reload} />}
    </div>
  )
}

const TABS = [['me', 'My swims'], ['team', 'Team']]

// The Swim tab: strokes with PR and last session, logging, and swim teams with a coach
export default function Swim({ intent, onIntentDone }) {
  const u = useSwimUnits()
  const [tab, setTab] = useState(intent?.invite ? 'team' : 'me')
  const [swims, setSwims] = useState(null)
  const [team, setTeam] = useState(null) // { coached, mine, roster, myPhoto, urls }
  const [teamState, setTeamState] = useState('loading') // loading | ready | error
  const [swimmer, setSwimmer] = useState(null)
  const [invite, setInvite] = useState(intent?.invite ?? null)

  const loadSwims = () => fetchCardio(500).then(l => setSwims(l.filter(x => x.kind === 'swim'))).catch(() => setSwims([]))
  async function loadTeam() {
    try {
      const [coached, mine, myPhoto] = await Promise.all([fetchCoachedTeam(), fetchMyTeam(), fetchMyPhoto()])
      const roster = coached ? await fetchRoster() : []
      const urls = await photoUrls([myPhoto, mine?.coach_photo, ...roster.map(r => r.photo_path)])
      setTeam({ coached, mine, roster, myPhoto, urls })
      setTeamState('ready')
    } catch {
      setTeamState('error')
    }
  }
  useEffect(() => { loadSwims(); loadTeam() }, [])
  useEffect(() => {
    if (intent?.invite) { setInvite(intent.invite); setTab('team'); onIntentDone?.() }
  }, [intent])

  useBackHandler(!!swimmer, () => setSwimmer(null), 'Swim', swimmer ? `@${swimmer.nickname ?? 'swimmer'}` : '')

  if (swimmer) return (
    <SwimmerPage swimmer={swimmer} url={team?.urls[swimmer.photo_path]}
      onRemoved={() => { setSwimmer(null); loadTeam() }} />
  )

  const all = swims ? strokeStats(swims).all : null
  const week = swims ? (() => {
    const monday = new Date(); monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return swims.filter(l => new Date(`${l.date}T12:00:00`) >= monday)
  })() : []
  const waiting = team?.roster.filter(r => r.status === 'pending').length ?? 0

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:swim" title="Swim" facts={swims && <>
        <Fact icon="mdi:calendar-week">{week.length ? `${fmtDistance(week.reduce((a, l) => a + Number(l.distance_m), 0), u)} this week` : 'No swims this week'}</Fact>
        {all.count > 0 && <Fact icon="mdi:clock-outline">Last {daysAgo(all.last.date)}</Fact>}
        {team?.coached && <Fact icon="mdi:whistle-outline">Coach</Fact>}
      </>} />

      <Segmented options={TABS.map(([id, label]) => [id, id === 'team' && waiting ? `${label} (${waiting})` : label])} value={tab} onChange={setTab} label="Swim" />

      {tab === 'me' && (swims ? <MySwims swims={swims} onChanged={loadSwims} /> : <SkeletonRows rows={5} label="Loading swims" />)}
      {tab === 'team' && (
        teamState === 'loading' ? <SkeletonRows rows={4} label="Loading your team" />
          : teamState === 'error' ? <InlineError onRetry={() => { setTeamState('loading'); loadTeam() }}>Couldn't load your team.</InlineError>
          : <Team data={team} invite={invite} onInviteDone={() => setInvite(null)} onOpenSwimmer={setSwimmer} reload={loadTeam} />
      )}
    </div>
  )
}
