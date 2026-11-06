import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, Fact, PageHeader, IconButton, InlineError, SkeletonRows, EmptyState, Sheet, StatTiles, ListRow } from '../components/ui/index.js'
import LineChart from '../components/LineChart.jsx'
import { ProfileForm, Review } from './Coach.jsx'
import { fetchMyCoach } from '../lib/coachApi.js'
import {
  fetchClientCode, newClientCode, fetchClients, fetchClientWorkouts, fetchClientWeights, removeClient,
  fetchAssignmentsFor, assignWorkout, deleteAssignment, trainerLink,
} from '../lib/clientsApi.js'
import { EXERCISES, MUSCLES, getExerciseIcon, todayKey } from '../lib/data.js'
import { GOAL_LABELS } from '../lib/nutrition.js'
import { useUnit } from '../lib/units.js'
import { setText } from '../lib/sets.js'
import { useBackHandler } from '../lib/shell.js'

const INPUT = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors'
const fmtDay = d => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')
const ago = d => {
  if (!d) return 'No workouts yet'
  const days = Math.round((new Date(`${todayKey()}T12:00:00`) - new Date(`${String(d).slice(0, 10)}T12:00:00`)) / 864e5)
  return days <= 0 ? 'Trained today' : days === 1 ? 'Trained yesterday' : `Last trained ${days} days ago`
}

async function share(url, text) {
  try {
    if (navigator.share) { await navigator.share({ title: 'ATHRION', text, url }); return false }
    await navigator.clipboard.writeText(url); return true
  } catch { return false }
}

// The coach's clients (031): invite people with a link, see each one's training, weigh-ins and
// goal, and send them workouts. Needs an approved coach application, the same one as the shop.
export default function Clients() {
  const [coach, setCoach] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const load = () => { setError(''); fetchMyCoach().then(c => setCoach(c ?? null)).catch(() => setError("Couldn't load your coach page.")) }
  useEffect(load, [])
  useBackHandler(editing && !!coach, () => setEditing(false), 'Clients', 'Coach profile')

  if (error) return <div className="py-4"><InlineError onRetry={load}>{error}</InlineError></div>
  if (coach === undefined) return <div className="py-4"><SkeletonRows rows={4} label="Loading" /></div>
  if (!coach || editing) return (
    <div className="py-4 space-y-4">
      {!coach && <p className="text-sm text-ink-2">Coach clients on ATHRION: see their workouts and weigh-ins, and send them workouts. Apply first; we check every coach.</p>}
      <ProfileForm coach={coach} onSaved={c => { setCoach(c); setEditing(false) }} />
    </div>
  )
  if (coach.status !== 'approved') return <div className="py-4 space-y-4 slide-up"><Review coach={coach} onEdit={() => setEditing(true)} /></div>
  return <ClientList />
}

function ClientList() {
  const [clients, setClients] = useState(null)
  const [code, setCode] = useState(null)
  const [open, setOpen] = useState(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const load = () => {
    fetchClients().then(setClients).catch(e => { setErr(e.message); setClients([]) })
    fetchClientCode().then(setCode).catch(e => setErr(e.message))
  }
  useEffect(load, [])
  useBackHandler(!!open, () => { setOpen(null); load() }, 'Clients', open?.name ?? '')

  if (open) return <ClientDetail client={open} onRemoved={() => { setOpen(null); load() }} />

  async function invite() {
    if (!code) return
    if (await share(trainerLink(code), 'Train with me on ATHRION')) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  async function reset() {
    if (!window.confirm('Make a new invite link? The old one stops working. Your clients stay.')) return
    try { setCode(await newClientCode()) } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:account-supervisor-outline" title="Clients"
        facts={clients && <Fact icon="mdi:account-group-outline">{clients.length} {clients.length === 1 ? 'client' : 'clients'}</Fact>} />
      <Card hero className="space-y-3">
        <p className="text-sm text-ink-2">Send your link. Whoever opens it and agrees becomes your client: you see their workouts, weigh-ins and goal, and can send them workouts.</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
          <Button icon={copied ? 'mdi:check' : 'mdi:share-variant-outline'} onClick={invite} disabled={!code}>{copied ? 'Link copied' : 'Invite a client'}</Button>
          <Button variant="secondary" icon="mdi:link-variant-off" onClick={reset} disabled={!code}>New link</Button>
        </div>
      </Card>
      {err && <InlineError>{err}</InlineError>}
      {clients === null ? <SkeletonRows rows={3} label="Loading clients" />
        : clients.length === 0 ? <EmptyState icon="mdi:account-plus-outline" title="No clients yet">Send your invite link to the people you coach.</EmptyState>
        : (
          <div className="space-y-2">
            {clients.map(c => (
              <button key={c.client_id} type="button" onClick={() => setOpen(c)}
                className="press w-full text-left bg-surface border border-line hover:border-line-strong rounded-2xl p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-11 h-11 rounded-full bg-raised text-ink font-bold flex items-center justify-center flex-shrink-0">{(c.name || '?').replace('@', '')[0]?.toUpperCase()}</span>
                <span className="grow basis-0 min-w-[8rem]">
                  <span className="block font-semibold text-ink break-words">{c.name}</span>
                  <span className="block text-xs text-muted">{ago(c.last_workout)}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Fact icon="mdi:calendar-week">{c.workouts_7d} this week</Fact>
                  {c.open_assignments > 0 && <Fact icon="mdi:clipboard-text-outline">{c.open_assignments} to do</Fact>}
                </span>
              </button>
            ))}
          </div>
        )}
    </div>
  )
}

function ClientDetail({ client: c, onRemoved }) {
  const { fmt, unit } = useUnit()
  const [workouts, setWorkouts] = useState(null)
  const [weights, setWeights] = useState([])
  const [assigned, setAssigned] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [openLog, setOpenLog] = useState(null)
  const [err, setErr] = useState('')
  const loadAssigned = () => fetchAssignmentsFor(c.client_id).then(setAssigned).catch(e => setErr(e.message))
  useEffect(() => {
    fetchClientWorkouts(c.client_id).then(setWorkouts).catch(e => { setErr(e.message); setWorkouts([]) })
    fetchClientWeights(c.client_id).then(setWeights).catch(() => {})
    loadAssigned()
  }, [c.client_id])

  async function remove() {
    if (!window.confirm(`Stop coaching ${c.name}? You'll no longer see their training. They're told.`)) return
    try { await removeClient(c.client_id); onRemoved() } catch (e) { setErr(e.message) }
  }
  async function unassign(a) {
    try { await deleteAssignment(a.id); loadAssigned() } catch (e) { setErr(e.message) }
  }

  const points = weights.map(w => ({ date: w.date, value: unit === 'kg' ? Number(w.weight_lb) / 2.20462 : Number(w.weight_lb) }))

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:account-outline" title={c.name}
        facts={<>
          {c.goal && <Fact icon="mdi:target">{GOAL_LABELS[c.goal] ?? c.goal}</Fact>}
          {c.nickname && <Fact icon="mdi:at">{c.nickname}</Fact>}
        </>} />
      <StatTiles items={[
        ['This week', c.workouts_7d],
        ['30 days', c.workouts_30d],
        ['Weight', c.weight_lb ? fmt(Number(c.weight_lb)) : '–'],
        ...(c.target_weight_lb ? [['Target', fmt(Number(c.target_weight_lb))]] : []),
      ]} />
      {err && <InlineError>{err}</InlineError>}

      {points.length >= 2 && (
        <Card>
          <SectionTitle>Weight</SectionTitle>
          <LineChart data={points} label="Weight" unit={unit} format={v => `${Math.round(v * 10) / 10}`}
            target={c.target_weight_lb ? (unit === 'kg' ? Number(c.target_weight_lb) / 2.20462 : Number(c.target_weight_lb)) : null} />
        </Card>
      )}

      <section aria-label="Assigned workouts">
        <SectionTitle action={<Button size="sm" icon="mdi:plus" onClick={() => setAssigning(true)}>Assign</Button>}>Assigned workouts</SectionTitle>
        {assigned === null ? <SkeletonRows rows={2} label="Loading" />
          : assigned.length === 0 ? <p className="text-sm text-muted">Nothing assigned yet. It shows on their Train, ready to start.</p>
          : (
            <div className="space-y-2">
              {assigned.map(a => (
                <div key={a.id} className="bg-surface border border-line rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Icon icon={a.done_at ? 'mdi:check-circle' : 'mdi:clipboard-text-outline'} width={22} className={a.done_at ? 'text-neon-ink' : 'text-muted'} aria-hidden="true" />
                  <span className="grow basis-0 min-w-[8rem]">
                    <span className="block font-semibold text-ink break-words">{a.title}</span>
                    <span className="block text-xs text-muted">{a.done_at ? `Done ${fmtDay(a.done_at)}` : a.day ? `For ${fmtDay(a.day)}` : 'Any day'} · {a.exercises.length} exercises</span>
                  </span>
                  {!a.done_at && <IconButton icon="mdi:delete-outline" tone="danger" label={`Remove ${a.title}`} onClick={() => unassign(a)} />}
                </div>
              ))}
            </div>
          )}
      </section>

      <section aria-label="Recent workouts">
        <SectionTitle>Recent workouts</SectionTitle>
        {workouts === null ? <SkeletonRows rows={3} label="Loading" />
          : workouts.length === 0 ? <p className="text-sm text-muted">No workouts logged yet.</p>
          : (
            <div className="space-y-2">
              {workouts.map(w => {
                const sets = Array.isArray(w.sets) ? w.sets.filter(s => !s.warmup) : []
                const shown = openLog === w.id
                return (
                  <div key={w.id} className="bg-surface border border-line rounded-2xl">
                    <button type="button" onClick={() => setOpenLog(shown ? null : w.id)} aria-expanded={shown}
                      className="press w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="grow basis-0 min-w-[8rem]">
                        <span className="block font-semibold text-ink break-words">{w.name}</span>
                        <span className="block text-xs text-muted">{fmtDay(w.date)} · {sets.length} sets{w.duration ? ` · ${w.duration.replace('min', ' min')}` : ''}</span>
                      </span>
                      <Icon icon={shown ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={20} className="text-muted" aria-hidden="true" />
                    </button>
                    {shown && (
                      <ul className="px-3 pb-3 space-y-1 text-sm fade-in">
                        {sets.map((s, i) => (
                          <li key={i} className="flex flex-wrap justify-between gap-x-3 text-ink-2">
                            <span className="break-words">{s.ex}</span>
                            <span className="tabular-nums text-ink">{setText(s, fmt)}{s.rpe ? ` · RPE ${s.rpe}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      </section>

      <Button variant="ghost" full icon="mdi:account-remove-outline" onClick={remove} className="text-danger hover:text-danger">Stop coaching {c.name}</Button>

      {assigning && <AssignSheet client={c} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); loadAssigned() }} />}
    </div>
  )
}

// A workout for the client: a title, an optional day and note, then exercises with sets and reps
function AssignSheet({ client, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [note, setNote] = useState('')
  const [list, setList] = useState([]) // [{ name, sets, reps, restSeconds, note }]
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('All')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const q = search.trim().toLowerCase()
  const results = EXERCISES.filter(e => (muscle === 'All' || e.muscle === muscle) && (!q || e.name.toLowerCase().includes(q)) && !list.some(l => l.name === e.name)).slice(0, 8)
  const change = (i, k, v) => setList(l => l.map((e, j) => (j === i ? { ...e, [k]: v } : e)))

  async function save() {
    setErr('')
    if (title.trim().length < 2) return setErr('Give the workout a name.')
    if (!list.length) return setErr('Add at least one exercise.')
    setBusy(true)
    try {
      await assignWorkout(client.client_id, {
        title, day, note,
        exercises: list.map(e => ({ name: e.name, sets: Math.min(10, Math.max(1, parseInt(e.sets) || 3)), reps: String(e.reps || '8-12').slice(0, 20), restSeconds: Math.min(600, Math.max(15, parseInt(e.restSeconds) || 90)), ...(e.note.trim() && { note: e.note.trim().slice(0, 200) }) })),
      })
      onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title={`Workout for ${client.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))' }}>
          <label className="block">
            <span className="text-xs text-muted block mb-1">Name</span>
            <input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} placeholder="Lower body A" className={INPUT} />
          </label>
          <label className="block">
            <span className="text-xs text-muted block mb-1">Day (optional)</span>
            <input type="date" value={day} min={todayKey()} onChange={e => setDay(e.target.value)} className={INPUT} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted block mb-1">Note (optional)</span>
          <input value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Keep 2 reps in the tank on squats" className={INPUT} />
        </label>

        {list.length > 0 && (
          <ul className="space-y-2" aria-label="Exercises">
            {list.map((e, i) => (
              <li key={e.name} className="bg-raised rounded-2xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="grow min-w-0 font-semibold text-ink break-words">{i + 1}. {e.name}</span>
                  <IconButton icon="mdi:close" label={`Remove ${e.name}`} onClick={() => setList(l => l.filter((_, j) => j !== i))} className="w-9 h-9" />
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5rem), 1fr))' }}>
                  <label><span className="text-xs text-muted block mb-1">Sets</span>
                    <input type="number" inputMode="numeric" min="1" max="10" value={e.sets} onChange={ev => change(i, 'sets', ev.target.value)} aria-label={`${e.name} sets`} className={INPUT} /></label>
                  <label><span className="text-xs text-muted block mb-1">Reps</span>
                    <input value={e.reps} maxLength={20} onChange={ev => change(i, 'reps', ev.target.value)} aria-label={`${e.name} reps`} className={INPUT} /></label>
                  <label><span className="text-xs text-muted block mb-1">Rest (s)</span>
                    <input type="number" inputMode="numeric" min="15" max="600" step="15" value={e.restSeconds} onChange={ev => change(i, 'restSeconds', ev.target.value)} aria-label={`${e.name} rest`} className={INPUT} /></label>
                </div>
                <input value={e.note} maxLength={200} onChange={ev => change(i, 'note', ev.target.value)} placeholder="Tip (optional)" aria-label={`${e.name} tip`} className={INPUT} />
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Add an exercise" aria-label="Search exercises" className={INPUT} />
          <div className="flex flex-wrap gap-1.5">
            {['All', ...MUSCLES.filter(m => m !== 'All')].map(m => (
              <button key={m} type="button" onClick={() => setMuscle(m)} aria-pressed={muscle === m}
                className={`press min-h-[36px] text-xs px-3 rounded-full border ${muscle === m ? 'bg-neon text-on-neon border-neon font-semibold' : 'bg-raised text-ink-2 border-line'}`}>{m}</button>
            ))}
          </div>
          <div className="bg-surface border border-line rounded-2xl p-1">
            {results.map(e => (
              <ListRow key={e.name} icon={getExerciseIcon(e)} title={e.name} meta={e.muscle}
                onClick={() => { setList(l => [...l, { name: e.name, sets: 3, reps: e.reps || '8-12', restSeconds: 90, note: '' }]); setSearch('') }} />
            ))}
          </div>
        </div>

        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        <Button full icon="mdi:send-outline" onClick={save} disabled={busy}>{busy ? 'Sending...' : 'Send to client'}</Button>
      </div>
    </Sheet>
  )
}
