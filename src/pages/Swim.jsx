import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, SectionTitle, Segmented, EmptyState, SkeletonRows, InlineError, Fact, InfoButton, ListRow, IconButton } from '../components/ui/index.js'
import { fetchCardio, saveCardio, deleteCardio } from '../lib/progressApi.js'
import { cardioUnits, parseDuration, fmtDuration, fmtDistance, paceSecs } from '../lib/cardio.js'
import {
  STROKES, DISTANCE_BANDS, PR_MIN_M, strokeLabel, strokeStats, strokeBoard, daysAgo, swimInviteLink, clearSwimInvite,
  readPoolUnit, setPoolUnit, subscribePoolUnit, intervalSet,
  swimmerName, PRACTICE_PARTS, PRACTICE_TEMPLATES, DRYLAND_MOVES, isDryland, blankItem, practiceTotals, practiceLine, mainStroke,
} from '../lib/swim.js'
import {
  photoUrls, fetchMyPhoto, uploadMyPhoto, fetchCoachedTeam, saveTeam, newTeamCode, fetchRoster, fetchSwimmerSwims,
  respondToSwimmer, fetchTeamPrs, fetchMyTeam, teamByCode, leaveTeam, searchTeams, joinTeam, setTeamName, accountName,
  fetchTeammates, fetchTeammatesPrs, setTeamVisible,
  fetchPractices, savePractice, deletePractice,
} from '../lib/swimApi.js'
import Sheet from '../components/Sheet.jsx'
import { localDateKey } from '../lib/data.js'
import { shareLink } from '../lib/shopLink.js'
import { fetchMyCoach, saveCoachProfile, fetchIsAdmin } from '../lib/coachApi.js'
import { Applications } from './Coach.jsx'
import { useUnit } from '../lib/units.js'
import LineChart from '../components/LineChart.jsx'
import { todayKey } from '../lib/data.js'

const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const inputCls = 'w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40'

// Metres or yards: the pool unit picked on Log a swim, else the weight unit's system
function useSwimUnits() {
  const { unit } = useUnit()
  const pool = useSyncExternalStore(subscribePoolUnit, readPoolUnit) ?? (unit === 'kg' ? 'm' : 'yd')
  return cardioUnits('swim', pool === 'm' ? 'kg' : 'lb')
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

// One card per stroke: its PR pace and when it was last swum. Tapping one opens that stroke.
export function StrokeGrid({ swims, selected, onSelect }) {
  const u = useSwimUnits()
  const stats = strokeStats(swims)
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
      {STROKES.map(s => {
        const st = stats[s.id]
        const on = selected === s.id
        return (
          <button key={s.id} type="button" onClick={() => onSelect(on ? null : s.id)} aria-pressed={on}
            className={`press text-left rounded-2xl border p-3.5 transition-colors ${on ? 'bg-neon-tint border-neon-stroke/60' : 'bg-surface border-line hover:border-line-strong'}`}>
            <span className="block text-sm font-semibold text-ink">{s.label}</span>
            {st.count ? (
              <>
                <span className="block mt-2 text-2xl font-bold text-neon-ink tabular-nums leading-none">
                  {st.pr ? fmtDuration(paceSecs(st.pr, u)) : '–'}<span className="text-xs font-semibold text-muted"> /{u.per}</span>
                </span>
                <span className="block mt-1.5 text-xs text-muted">Last {daysAgo(st.last.date)}</span>
              </>
            ) : (
              <span className="block mt-2 text-xs text-muted">No swims yet</span>
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

function LogSwim({ stroke, setStroke, onSaved, bare = false }) {
  const u = useSwimUnits()
  const blank = { date: todayKey(), distance: '', time: '', notes: '', reps: '', each: '', sendOff: '' }
  const [form, setForm] = useState(blank)
  const [mode, setMode] = useState('swim') // swim | set
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = mode === 'set' ? intervalSet({ reps: parseInt(form.reps, 10), each: parseFloat(form.each), sendOff: parseDuration(form.sendOff.includes(':') ? form.sendOff : `0:${form.sendOff}`), dist: u.dist }) : null
  const distance = mode === 'set' ? set?.distance : parseFloat(form.distance)
  const seconds = mode === 'set' ? set?.seconds : parseDuration(form.time)
  const pace = distance > 0 && seconds ? fmtDuration(paceSecs({ seconds, distance_m: u.toM(distance) }, u)) : null
  const field = (key, label, props) => (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className={`mt-1 ${inputCls}`} {...props} />
    </label>
  )
  const timeOnly = v => v.replace(/[^\d:]/g, '').slice(0, 8)

  async function save() {
    setSaving(true); setErr('')
    try {
      if (mode === 'set' && !set) throw new Error('Enter the reps, the distance of each and the send-off, like 10 × 100 on 1:45')
      if (!(distance > 0)) throw new Error(`Enter the distance in ${u.dist}`)
      if (!seconds) throw new Error('Enter the time, like 32:00 or 1:05:00')
      const notes = [set?.note, form.notes.trim()].filter(Boolean).join('. ').slice(0, 300)
      await saveCardio({ date: form.date, kind: 'swim', stroke, distance_m: Math.round(u.toM(distance) * 10) / 10, seconds, notes })
      setForm(blank)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const unitToggle = (
    <div role="group" aria-label="Pool unit" className="flex rounded-lg border border-line overflow-hidden text-xs font-semibold">
      {['m', 'yd'].map(v => (
        <button key={v} type="button" onClick={() => setPoolUnit(v)} aria-pressed={u.dist === v}
          className={`press min-h-[32px] min-w-[40px] px-2 ${u.dist === v ? 'bg-neon text-on-neon' : 'text-ink-2'}`}>{v === 'm' ? 'Metres' : 'Yards'}</button>
      ))}
    </div>
  )
  const Wrap = bare ? 'div' : Card
  return (
    <Wrap>
      {bare ? <div className="flex justify-end mb-3">{unitToggle}</div> : <SectionTitle action={unitToggle}>Log a swim</SectionTitle>}
      <Segmented options={STROKES.map(s => [s.id, s.label])} value={stroke} onChange={setStroke} label="Stroke" kind="choice" scroll />
      <div className="mt-3">
        <Segmented options={[['swim', 'One swim'], ['set', 'Interval set']]} value={mode} onChange={setMode} label="What you swam" kind="choice" />
      </div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        {mode === 'swim' ? <>
          {field('distance', `Distance (${u.dist})`, { type: 'number', inputMode: 'decimal', step: 25, placeholder: u.dist === 'm' ? '1500' : '1650' })}
          <label className="block">
            <span className="text-xs text-muted">Time</span>
            <input inputMode="numeric" value={form.time} placeholder="32:00"
              onChange={e => setForm(f => ({ ...f, time: timeOnly(e.target.value) }))} className={`mt-1 ${inputCls}`} />
          </label>
        </> : <>
          {field('reps', 'Reps', { type: 'number', inputMode: 'numeric', min: 1, placeholder: '10' })}
          {field('each', `Each (${u.dist})`, { type: 'number', inputMode: 'numeric', step: 25, placeholder: '100' })}
          <label className="block">
            <span className="text-xs text-muted">Send-off</span>
            <input inputMode="numeric" value={form.sendOff} placeholder="1:45"
              onChange={e => setForm(f => ({ ...f, sendOff: timeOnly(e.target.value) }))} className={`mt-1 ${inputCls}`} />
          </label>
        </>}
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
      {set && <p className="text-xs text-muted mt-2 tabular-nums">{set.note}: {set.distance} {u.dist} in {fmtDuration(set.seconds)}, rest included.</p>}
      <Button full onClick={save} disabled={saving} className="mt-3">{saving ? 'Saving...' : `Save ${strokeLabel(stroke).toLowerCase()} ${mode === 'set' ? 'set' : 'swim'}`}</Button>
      {err && <p role="alert" className="text-xs text-danger mt-2">{err}</p>}
    </Wrap>
  )
}

// Pro: pace over time for one stroke. Lower is faster. Swims of at least one pool length.
function StrokeProgress({ swims, stroke, isPro, onUpgrade }) {
  const u = useSwimUnits()
  if (!isPro) return (
    <button type="button" onClick={onUpgrade} className="press w-full text-left flex items-center gap-2 text-sm text-ink-2 py-1">
      <Icon icon="mdi:chart-line" width={18} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
      <span className="grow">See your {strokeLabel(stroke).toLowerCase()} pace over time</span>
      <span className="text-xs font-semibold text-on-neon bg-neon rounded-md px-1.5 py-0.5">Pro</span>
    </button>
  )
  const points = swims.filter(l => l.stroke === stroke && Number(l.distance_m) >= PR_MIN_M && l.seconds > 0)
    .map(l => ({ date: l.date, value: paceSecs(l, u) }))
  const first = points.length ? [...points].sort((a, b) => a.date.localeCompare(b.date))[0] : null
  const best = points.length ? Math.min(...points.map(p => p.value)) : null
  return points.length >= 2 ? (
    <div>
      <LineChart data={points} label={`${strokeLabel(stroke)} pace`} format={v => `${fmtDuration(v)}`} />
      <p className="text-xs text-muted mt-2 tabular-nums">
        Pace per {u.per}, lower is faster. Best {fmtDuration(best)}{first && best < first.value ? `, ${fmtDuration(first.value - best)} faster than your first` : ''}.
      </p>
    </div>
  ) : (
    <p className="text-sm text-muted py-2">Log two {strokeLabel(stroke).toLowerCase()} swims of {PR_MIN_M} {u.dist} or more to see your pace over time.</p>
  )
}

function MySwims({ swims, onChanged, isPro, onUpgrade }) {
  const [selected, setSelected] = useState(null) // a stroke opened from its card
  const [logging, setLogging] = useState(false)
  const [stroke, setStroke] = useState('free')
  const [all, setAll] = useState(false)
  const shown = selected ? swims.filter(l => l.stroke === selected) : swims
  const del = l => deleteCardio(l.id).then(onChanged)

  return (
    <div className="space-y-4">
      <StrokeGrid swims={swims} selected={selected} onSelect={id => { setSelected(id); if (id) setStroke(id) }} />

      <Button full icon="mdi:plus" onClick={() => setLogging(true)}>Log a swim</Button>

      {selected ? (
        <Card className="space-y-3">
          <SectionTitle action={<button onClick={() => setSelected(null)} className="press text-xs font-semibold text-neon-ink min-h-[32px]">All strokes</button>}>
            {strokeLabel(selected)}
          </SectionTitle>
          <StrokeProgress swims={swims} stroke={selected} isPro={isPro} onUpgrade={onUpgrade} />
          {shown.length ? <SwimList swims={shown} onDelete={del} /> : <p className="text-sm text-muted">No {strokeLabel(selected).toLowerCase()} swims yet.</p>}
        </Card>
      ) : swims.length > 0 ? (
        <Card>
          <SectionTitle action={swims.length > 5 && <button onClick={() => setAll(v => !v)} className="press text-xs font-semibold text-neon-ink min-h-[32px]">{all ? 'Less' : 'All'}</button>}>Recent swims</SectionTitle>
          <SwimList swims={all ? swims : swims.slice(0, 5)} onDelete={del} />
        </Card>
      ) : (
        <EmptyState icon="mdi:swim" title="No swims yet">Log one to see your PR pace for each stroke.</EmptyState>
      )}

      {logging && (
        <Sheet title="Log a swim" onClose={() => setLogging(false)}>
          <LogSwim bare stroke={stroke} setStroke={setStroke} onSaved={() => { setLogging(false); onChanged() }} />
        </Sheet>
      )}
    </div>
  )
}

// ── Practices ────────────────────────────────────────────────────────────────

const plusDays = n => localDateKey(new Date(Date.now() + n * 86400000))
const dayName = d => d === todayKey() ? 'Today' : d === plusDays(1) ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

// The sets, grouped by part, with the total
function PracticeSets({ practice }) {
  const t = practiceTotals(practice.items)
  return (
    <div className="space-y-3">
      {PRACTICE_PARTS.map(([part, label]) => {
        const items = practice.items.filter(i => i.part === part)
        return items.length > 0 && (
          <div key={part}>
            <div className="text-xs font-semibold text-muted mb-1">{label}</div>
            <ul className="space-y-1">
              {items.map((i, n) => (
                <li key={n} className="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span className="font-semibold text-ink tabular-nums">{practiceLine(i)}</span>
                  {i.note && <span className="text-ink-2">{i.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {practice.notes && <p className="text-sm text-ink-2 border-l-2 border-neon-stroke/40 pl-3">{practice.notes}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Fact icon="mdi:map-marker-distance">{t.distance.toLocaleString()} {t.unit} total</Fact>
        {t.seconds && <Fact icon="mdi:clock-outline">About {Math.round(t.seconds / 60)} min</Fact>}
      </div>
    </div>
  )
}

// The coach writes a day's practice: start from a template, edit each set, post it
function PracticeEditor({ teamId, date: firstDate, existing, onClose, onSaved }) {
  const u = useSwimUnits()
  const [date, setDate] = useState(firstDate)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [items, setItems] = useState(existing?.items ?? [])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const t = practiceTotals(items)
  const set = (n, k, v) => setItems(list => list.map((i, x) => (x === n ? { ...i, [k]: v } : i)))

  async function save() {
    setErr('')
    if (!title.trim()) return setErr('Give the practice a name, like Aerobic base')
    const clean = items.filter(i => Number(i.reps) > 0 && (isDryland(i) ? i.name?.trim() : Number(i.distance) > 0))
      .map(i => (isDryland(i)
        ? { part: 'dryland', name: i.name.trim().slice(0, 40), reps: Math.min(20, Math.round(Number(i.reps))), amount: (i.amount ?? '').trim().slice(0, 12), note: (i.note ?? '').slice(0, 60) }
        : { ...i, reps: Math.min(99, Math.round(Number(i.reps))), distance: Math.min(5000, Math.round(Number(i.distance))), send_off: /^\d{1,2}:\d{2}$/.test(i.send_off) ? i.send_off : '', note: (i.note ?? '').slice(0, 60) }))
    if (!clean.length) return setErr('Add at least one set')
    setBusy(true)
    try { await savePractice({ teamId, date, title, items: clean, notes }); onSaved() } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <Sheet title={existing ? 'Edit practice' : 'Post a practice'} onClose={onClose} footer={
      <div className="space-y-2">
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        <Button full icon="mdi:send" onClick={save} disabled={busy}>{busy ? 'Posting…' : existing ? 'Save and tell the team' : 'Post to the team'}</Button>
      </div>
    }>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
        <label className="block">
          <span className="text-xs text-muted">Name</span>
          <input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} placeholder="Aerobic base" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Day</span>
          <input type="date" value={date} min={todayKey()} onChange={e => setDate(e.target.value)} disabled={!!existing} className={`mt-1 ${inputCls}`} />
        </label>
      </div>
      {!items.length && (
        <div>
          <div className="text-xs text-muted mb-1.5">Start from</div>
          <div className="flex flex-wrap gap-1.5">
            {PRACTICE_TEMPLATES.map(tp => (
              <button key={tp.title} type="button" onClick={() => { setItems(tp.build(u.dist)); setTitle(x => x || tp.title) }}
                className="press min-h-[36px] px-3.5 rounded-full text-xs font-semibold border bg-raised text-ink-2 border-line hover:border-line-strong">{tp.title}</button>
            ))}
          </div>
        </div>
      )}
      {PRACTICE_PARTS.map(([part, label]) => (
        <section key={part} aria-label={label} className="space-y-2">
          <div className="text-sm font-semibold text-ink">{label}</div>
          {part === 'dryland' && <p className="text-xs text-muted -mt-1">On land, before the warm-up: shoulders, core and legs for starts and turns.</p>}
          {items.map((i, n) => i.part === part && (
            <div key={n} className="rounded-xl border border-line p-2.5 space-y-2">
              {isDryland(i) ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 4.5rem), 1fr))' }}>
                  <label className="col-span-full"><span className="text-xs text-muted">Exercise</span>
                    <input value={i.name} maxLength={40} list="dryland-moves" placeholder="Band pull-aparts" onChange={e => set(n, 'name', e.target.value)} className={`mt-0.5 ${inputCls}`} /></label>
                  <label><span className="text-xs text-muted">Sets</span>
                    <input type="number" inputMode="numeric" min={1} value={i.reps} onChange={e => set(n, 'reps', e.target.value)} className={`mt-0.5 ${inputCls}`} /></label>
                  <label><span className="text-xs text-muted">Reps or time</span>
                    <input value={i.amount} maxLength={12} placeholder="12 or 30 s" onChange={e => set(n, 'amount', e.target.value)} className={`mt-0.5 ${inputCls}`} /></label>
                </div>
              ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 4.5rem), 1fr))' }}>
                <label><span className="text-xs text-muted">Reps</span>
                  <input type="number" inputMode="numeric" min={1} value={i.reps} onChange={e => set(n, 'reps', e.target.value)} className={`mt-0.5 ${inputCls}`} /></label>
                <label><span className="text-xs text-muted">Each ({i.unit})</span>
                  <input type="number" inputMode="numeric" step={25} min={25} value={i.distance} onChange={e => set(n, 'distance', e.target.value)} className={`mt-0.5 ${inputCls}`} /></label>
                <label><span className="text-xs text-muted">Send-off</span>
                  <input inputMode="numeric" value={i.send_off} placeholder="1:45" onChange={e => set(n, 'send_off', e.target.value.replace(/[^\d:]/g, '').slice(0, 5))} className={`mt-0.5 ${inputCls}`} /></label>
                <label><span className="text-xs text-muted">Stroke</span>
                  <select value={i.stroke} onChange={e => set(n, 'stroke', e.target.value)} className={`mt-0.5 ${inputCls}`}>
                    {STROKES.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                  </select></label>
              </div>
              )}
              <div className="flex gap-2">
                <input value={i.note} maxLength={60} placeholder="Note: drill, effort, kick" aria-label="Note" onChange={e => set(n, 'note', e.target.value)} className={`${inputCls} grow`} />
                <button type="button" onClick={() => setItems(list => list.filter((_, x) => x !== n))} aria-label="Remove this set"
                  className="press w-10 min-h-[38px] rounded-xl border border-line text-muted hover:text-danger flex items-center justify-center flex-shrink-0"><Icon icon="mdi:close" width={18} /></button>
              </div>
            </div>
          ))}
          {part === 'dryland' && (
            <div className="flex flex-wrap gap-1.5">
              {DRYLAND_MOVES.filter(([name]) => !items.some(i => isDryland(i) && i.name === name)).slice(0, 6).map(([name, amount]) => (
                <button key={name} type="button" onClick={() => setItems(list => [...list, { ...blankItem('dryland'), name, amount }])}
                  className="press min-h-[36px] px-3 rounded-full text-xs font-semibold border bg-raised text-ink-2 border-line hover:border-line-strong">+ {name}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setItems(list => [...list, blankItem(part, u.dist)])}
            className="press w-full min-h-[40px] rounded-xl border border-dashed border-line-strong text-sm font-semibold text-ink-2 flex items-center justify-center gap-1.5">
            <Icon icon="mdi:plus" width={18} />Add {label.toLowerCase()}
          </button>
        </section>
      ))}
      <datalist id="dryland-moves">{DRYLAND_MOVES.map(([name]) => <option key={name} value={name} />)}</datalist>
      <label className="block">
        <span className="text-xs text-muted">Notes for the team</span>
        <textarea value={notes} maxLength={500} rows={2} onChange={e => setNotes(e.target.value)} placeholder="Bring fins. Focus on turns." className={`mt-1 ${inputCls} resize-none`} />
      </label>
      <p className="text-xs text-muted tabular-nums">{t.distance.toLocaleString()} {u.dist} total{t.seconds ? `, about ${Math.round(t.seconds / 60)} min` : ''}. Posting sends every swimmer a notification.</p>
    </Sheet>
  )
}

// Coach: today's and coming practices, and a button to post one
function CoachPractices({ team }) {
  const [state, setState] = useState({ list: null, ready: true })
  const [editing, setEditing] = useState(null) // { date, existing }
  const [err, setErr] = useState('')
  const load = () => fetchPractices(team.id, todayKey()).then(r => setState({ list: r.practices, ready: r.ready })).catch(e => setErr(e.message))
  useEffect(() => { load() }, [team.id])
  if (!state.ready) return null
  const today = state.list?.find(p => p.date === todayKey())
  const coming = state.list?.filter(p => p.date !== todayKey()) ?? []

  async function remove(p) {
    if (!window.confirm(`Delete ${dayName(p.date).toLowerCase()}'s practice?`)) return
    try { await deletePractice(p.id); load() } catch (x) { setErr(x.message) }
  }

  return (
    <section aria-label="Practices">
      <SectionTitle action={<InfoButton title="Practices">
        Post the day's warm-up, sets and cool-down. Everyone on the team gets a notification and sees it on their Swim tab, and can log it as a swim in one tap.
      </InfoButton>}>Today's practice</SectionTitle>
      {state.list == null ? <SkeletonRows rows={2} label="Loading practices" /> : today ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="grow basis-0 min-w-[8rem] font-bold text-lg text-ink break-words">{today.title}</div>
            <button onClick={() => setEditing({ date: today.date, existing: today })} className="press text-xs font-semibold text-neon-ink min-h-[36px] px-2">Edit</button>
            <button onClick={() => remove(today)} className="press text-xs font-semibold text-muted hover:text-danger min-h-[36px] px-2">Delete</button>
          </div>
          <PracticeSets practice={today} />
        </Card>
      ) : (
        <Button full icon="mdi:clipboard-plus-outline" onClick={() => setEditing({ date: todayKey() })}>Post today's practice</Button>
      )}
      {coming.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {coming.map(p => (
            <li key={p.id}>
              <button onClick={() => setEditing({ date: p.date, existing: p })} className="press w-full text-left bg-surface border border-line rounded-xl px-3 py-2 flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="font-semibold text-ink">{dayName(p.date)}: {p.title}</span>
                <span className="text-muted tabular-nums">{practiceTotals(p.items).distance.toLocaleString()} {practiceTotals(p.items).unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {today && <button onClick={() => setEditing({ date: plusDays(1) })} className="press mt-2 w-full min-h-[40px] text-sm font-semibold text-neon-ink">Plan another day</button>}
      {err && <p role="alert" className="text-xs text-danger mt-1">{err}</p>}
      {editing && <PracticeEditor teamId={team.id} date={editing.date} existing={editing.existing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </section>
  )
}

// Swimmer: the coach's practice for today (or the next one), logged as a swim in one tap
function TeamPractice({ teamId, compact = false, onOpen, onLogged }) {
  const [list, setList] = useState(null)
  const [time, setTime] = useState('')
  const [state, setState] = useState('idle') // idle | saving | done
  const [err, setErr] = useState('')
  useEffect(() => { fetchPractices(teamId, todayKey()).then(r => setList(r.practices)).catch(() => setList([])) }, [teamId])
  const p = list?.[0]
  if (!p) return null
  const t = practiceTotals(p.items)
  const isToday = p.date === todayKey()

  if (compact) return (
    <Card pad="sm">
      <ListRow icon="mdi:clipboard-text-outline" tile="neon-ink" title={`${dayName(p.date)}: ${p.title}`}
        meta={`From your coach · ${t.distance.toLocaleString()} ${t.unit}`} chevron onClick={onOpen} />
    </Card>
  )

  async function log() {
    setErr('')
    const seconds = t.seconds ?? parseDuration(time)
    if (!seconds) return setErr('Enter how long the practice took, like 55:00')
    setState('saving')
    try {
      const distance_m = Math.round((t.unit === 'yd' ? t.distance * 0.9144 : t.distance) * 10) / 10
      await saveCardio({ date: todayKey(), kind: 'swim', stroke: mainStroke(p.items), distance_m, seconds, notes: `Team practice: ${p.title}`.slice(0, 300) })
      setState('done'); onLogged?.()
    } catch (x) { setErr(x.message || 'Could not save'); setState('idle') }
  }

  return (
    <Card hero className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-neon-ink">{dayName(p.date)} · from your coach</div>
        <div className="text-xl font-bold text-ink break-words leading-tight">{p.title}</div>
      </div>
      <PracticeSets practice={p} />
      {isToday && (state === 'done' ? (
        <p role="status" className="text-sm font-semibold text-neon-ink flex items-center gap-1.5"><Icon icon="mdi:check" width={18} />Logged. Your coach sees it.</p>
      ) : (
        <div className="space-y-2">
          {!t.seconds && (
            <label className="block">
              <span className="text-xs text-muted">How long it took</span>
              <input inputMode="numeric" value={time} placeholder="55:00" onChange={e => setTime(e.target.value.replace(/[^\d:]/g, '').slice(0, 8))} className={`mt-1 ${inputCls}`} />
            </label>
          )}
          <Button full icon="mdi:check" onClick={log} disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'I swam it, log it'}</Button>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        </div>
      ))}
    </Card>
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
        <div className="text-xs text-muted">{coach ? 'Your swimmers see it.' : 'Your coach sees it, and teammates while you show yourself to them.'}</div>
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
  const [name, setName] = useState('')
  useEffect(() => { teamByCode(code).then(setTeam).catch(() => setTeam(null)) }, [code])
  useEffect(() => { accountName().then(n => setName(x => x || n)).catch(() => {}) }, [])
  if (team === undefined) return <SkeletonRows rows={1} label="Loading the invite" />

  async function join() {
    setBusy(true); setErr('')
    try {
      await joinTeam({ code })
      // Before 026 the name can't be saved; joining still works
      if (name.trim()) await setTeamName(name.trim()).catch(() => {})
      clearSwimInvite(); onJoined()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
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
          <label className="block">
            <span className="text-xs text-muted">Your name for the coach</span>
            <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" className={`mt-1 ${inputCls}`} />
          </label>
          <p className="text-xs text-muted">Your coach sees this name, your photo and your swims. Teammates see your name, photo, distance this month and best paces; you can turn that off on Team.</p>
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

// Running a team takes an approved coach application (the same one as the shop's, 014/018)
function CoachApplyForm({ coach, onSaved, onCancel }) {
  const [f, setF] = useState({
    display_name: coach?.display_name ?? '', credentials: coach?.credentials ?? '', bio: coach?.bio ?? '',
  })
  const [agree, setAgree] = useState(!!coach)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = f.display_name.trim().length >= 2 && f.credentials.trim() && f.bio.trim().length >= 20 && agree

  async function send(e) {
    e.preventDefault()
    if (!ok) return
    setBusy(true); setErr('')
    try {
      const specialties = [...new Set([...(coach?.specialties ?? []), 'Swimming'])].slice(0, 6)
      onSaved(await saveCoachProfile(
        { display_name: f.display_name.trim(), credentials: f.credentials.trim(), bio: f.bio.trim(), specialties },
        { isNew: !coach, reapply: coach?.status === 'rejected' }))
    } catch (x) {
      setErr(x.message || "Couldn't send it"); setBusy(false)
    }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <label className="block">
        <span className="text-xs text-muted">Coach name</span>
        <input value={f.display_name} maxLength={40} onChange={e => setF(v => ({ ...v, display_name: e.target.value }))} placeholder="How your swimmers will see you" className={`mt-1 ${inputCls}`} />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Qualifications</span>
        <input value={f.credentials} maxLength={500} onChange={e => setF(v => ({ ...v, credentials: e.target.value }))} placeholder="ASCA level 2, 5 years coaching masters" className={`mt-1 ${inputCls}`} />
      </label>
      <label className="block">
        <span className="text-xs text-muted">About you and your team (at least 20 characters)</span>
        <textarea value={f.bio} maxLength={1000} onChange={e => setF(v => ({ ...v, bio: e.target.value }))} className={`mt-1 min-h-[90px] ${inputCls}`} />
      </label>
      {!coach && (
        <label className="flex items-start gap-3 text-xs text-muted leading-relaxed cursor-pointer min-h-[44px] py-1">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-5 h-5 flex-shrink-0 accent-neon rounded" />
          <span>I'm 18 or older and agree to the <a href="/terms.html#coaches" target="_blank" rel="noreferrer" className="underline underline-offset-2 text-ink-2">coach terms</a>. My advice is safe and honest.</span>
        </label>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button type="submit" icon="mdi:send-outline" disabled={!ok || busy}>{busy ? 'Sending...' : coach?.status === 'rejected' ? 'Apply again' : 'Send application'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </form>
  )
}

function StartTeam({ coach, onCoachChange, onStarted }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const status = coach?.status ?? null

  async function start(e) {
    e.preventDefault()
    if (name.trim().length < 2) { setErr('Give the team a name of at least 2 letters'); return }
    setBusy(true); setErr('')
    try { await saveTeam(name.trim()); onStarted() } catch (x) { setErr(x.message); setBusy(false) }
  }

  const head = {
    null: ['Coach a team, free', 'Roster, practices with dryland, leaderboards and every swimmer\'s swims, at no cost. Apply, and once an admin approves you, start a team and invite your swimmers.', 'Become a coach'],
    pending: ['Application sent', 'An admin is reviewing it. You get a notification when it is done, then you can start your team.', 'Edit application'],
    rejected: ['Not approved yet', coach?.review_note ? `Why: ${coach.review_note}` : 'Update your application and send it again.', 'Update and apply again'],
    suspended: ['Coaching paused', 'Email athrionsportapp@gmail.com to find out more.', null],
    approved: ['You are an approved coach', 'Start your team, then invite swimmers with a link. Coach tools are free.', 'Start my team'],
  }[status] ?? ['Coach a team', '', null]

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Icon icon={status === 'pending' ? 'mdi:progress-clock' : 'mdi:whistle-outline'} width={26} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
        <div className="grow basis-0 min-w-[8rem]">
          <div className="text-sm font-semibold text-ink">{head[0]}</div>
          <div className="text-xs text-muted break-words">{head[1]}</div>
        </div>
        {!open && head[2] && <Button size="sm" variant={status === 'approved' ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>{head[2]}</Button>}
      </div>
      {open && status === 'approved' && (
        <form onSubmit={start} className="space-y-2">
          <label className="block">
            <span className="text-xs text-muted">Team name</span>
            <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Riverside masters" autoFocus className={`mt-1 ${inputCls}`} />
          </label>
          <Button full type="submit" disabled={busy}>{busy ? 'Starting...' : 'Start my team'}</Button>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        </form>
      )}
      {open && status !== 'approved' && status !== 'suspended' && (
        <CoachApplyForm coach={coach} onCancel={() => setOpen(false)} onSaved={c => { setOpen(false); onCoachChange(c) }} />
      )}
    </Card>
  )
}

function MyTeamCard({ team, coachUrl, myPhoto, myUrl, onChanged }) {
  const [settings, setSettings] = useState(false)
  const pending = team.status === 'pending'
  // 026 adds my_name (the name the coach sees); before it runs the field isn't there
  const needsName = 'my_name' in team && !team.my_name
  return (
    <>
      <Card hero className="space-y-3">
        <div className="flex items-center gap-3">
          <Photo url={coachUrl} name={team.coach_nickname} size={48} />
          <div className="grow min-w-0">
            <div className="text-xs font-semibold text-neon-ink">{pending ? 'Request sent' : 'Your team'}</div>
            <div className="text-xl font-bold text-ink break-words leading-tight">{team.name}</div>
            {team.coach_nickname && <div className="text-sm text-muted">Coach @{team.coach_nickname}</div>}
          </div>
          <IconButton icon="mdi:cog-outline" label="You on the team" onClick={() => setSettings(true)} />
        </div>
        {pending && <p className="text-sm text-ink-2">Waiting for the coach to accept. Keep logging swims meanwhile.</p>}
        {needsName && (
          <button type="button" onClick={() => setSettings(true)} className="press w-full text-left rounded-xl border border-dashed border-neon-stroke/40 px-3 py-2.5 text-sm text-ink-2">
            <span className="font-semibold text-neon-ink">Add your name</span> so your coach knows who you are.
          </button>
        )}
      </Card>
      {settings && <TeamSettings team={team} myPhoto={myPhoto} myUrl={myUrl} onClose={() => setSettings(false)} onChanged={onChanged} />}
    </>
  )
}

// The swimmer's own settings on the team: the name the coach sees, their photo, being shown to
// teammates (027), and leaving
function TeamSettings({ team, myPhoto, myUrl, onClose, onChanged }) {
  const pending = team.status === 'pending'
  const [name, setName] = useState(team.my_name ?? '')
  const [visible, setVisible] = useState(team.visible ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!team.my_name) accountName().then(n => setName(x => x || n)).catch(() => {}) }, [team.my_name])
  async function save() {
    setErr(''); setBusy(true)
    try {
      if ('my_name' in team && name.trim() !== (team.my_name ?? '')) await setTeamName(name.trim())
      if (visible != null && visible !== team.visible) await setTeamVisible(visible)
      onChanged(); onClose()
    } catch (x) { setErr(x.message || 'Could not save'); setBusy(false) }
  }
  async function leave() {
    if (!pending && !window.confirm(`Leave ${team.name}? Your coach and teammates stop seeing your swims.`)) return
    setBusy(true)
    try { await leaveTeam(); onChanged(); onClose() } catch (x) { setErr(x.message); setBusy(false) }
  }
  return (
    <Sheet title="You on the team" onClose={onClose} footer={
      <div className="space-y-2">
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        <Button full onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <button type="button" onClick={leave} disabled={busy} className="press w-full min-h-[44px] text-sm font-semibold text-muted hover:text-danger">{pending ? 'Cancel request' : 'Leave team'}</button>
      </div>
    }>
      {'my_name' in team && (
        <label className="block">
          <span className="text-xs text-muted">Your name for the team</span>
          <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" className={`mt-1 ${inputCls}`} />
        </label>
      )}
      <PhotoCard path={myPhoto} url={myUrl} onChanged={onChanged} />
      {visible != null && (
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer">
          <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[rgb(var(--neon-stroke))]" />
          <span>
            <span className="block text-sm font-semibold text-ink">Show me to my teammates</span>
            <span className="block text-xs text-muted">Your name, photo, distance this month and best paces. Your coach always sees your swims.</span>
          </span>
        </label>
      )}
    </Sheet>
  )
}

// Teammates by distance in the last 30 days: who's in the water most
function Teammates({ mates, urls }) {
  const u = useSwimUnits()
  if (!mates.length) return null
  const ranked = [...mates].sort((a, b) => Number(b.metres_30d) - Number(a.metres_30d))
  return (
    <Card>
      <SectionTitle action={<span className="text-xs text-muted">Last 30 days</span>}>Teammates</SectionTitle>
      <ol className="divide-y divide-line">
        {ranked.map((m, i) => (
          <li key={m.user_id} className={`flex items-center gap-3 py-2.5 ${m.is_me ? 'font-semibold' : ''}`}>
            <span className={`w-5 text-center text-sm font-bold tabular-nums ${i === 0 ? 'text-neon-ink' : 'text-muted'}`}>{i + 1}</span>
            <Photo url={urls[m.photo_path]} name={m.display_name || m.nickname} size={36} />
            <span className="grow min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{swimmerName(m)}{m.is_me ? ' (you)' : ''}</span>
            <span className="text-sm font-bold text-ink tabular-nums">{fmtDistance(m.metres_30d ?? 0, u)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function CoachView({ team, roster, prs, urls, onChanged, onOpenSwimmer }) {
  const u = useSwimUnits()
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

      <CoachPractices team={team} />

      {requests.length > 0 && (
        <section aria-label="Asking to join">
          <SectionTitle>Asking to join</SectionTitle>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.user_id} className="bg-surface border border-line rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Photo url={urls[r.photo_path]} name={r.display_name || r.nickname} size={44} />
                <span className="grow basis-0 min-w-[6rem] text-sm font-semibold text-ink break-words">{swimmerName(r)}</span>
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
                <Photo url={urls[r.photo_path]} name={r.display_name || r.nickname} size={64} />
                <span className="text-[0.8125rem] font-semibold text-ink [overflow-wrap:anywhere] leading-tight">{swimmerName(r)}</span>
                {r.last_swim ? <>
                  <span className="text-sm font-bold text-neon-ink tabular-nums leading-none">{fmtDistance(r.metres_30d ?? 0, u)}</span>
                  <span className="text-xs text-muted leading-tight">{r.swims_30d ?? 0} {r.swims_30d === 1 ? 'swim' : 'swims'} in 30 days · {daysAgo(r.last_swim)}</span>
                </> : <span className="text-xs text-muted">No swims yet</span>}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="mdi:account-group-outline" title="No swimmers yet">
            Send your invite link, or tell swimmers to search for {team.name}.
          </EmptyState>
        )}
      </section>
      {swimmers.length > 0 && <Leaderboard prs={prs} roster={roster} urls={urls} onOpenSwimmer={onOpenSwimmer} />}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  )
}

// Who's fastest per stroke: each swimmer's PR pace, ranked
function Leaderboard({ prs, roster, urls, onOpenSwimmer, title = 'Leaderboard' }) {
  const u = useSwimUnits()
  const [stroke, setStroke] = useState('free')
  const [band, setBand] = useState('sprint')
  const board = strokeBoard(prs, roster, stroke, band)
  const bandInfo = DISTANCE_BANDS.find(b => b.id === band)
  return (
    <section aria-label="Leaderboard">
      <SectionTitle action={<InfoButton title="Leaderboard">
        Each swimmer's best pace per {u.per} for the stroke, ranked within a distance so sprints and distance swims aren't mixed: sprint is 50 to 100, middle 200 to 300, distance 400 and up.{onOpenSwimmer ? ' Tap a swimmer to see all their swims.' : ''}
      </InfoButton>}>{title}</SectionTitle>
      <Segmented options={STROKES.map(s => [s.id, s.label])} value={stroke} onChange={setStroke} label="Stroke" kind="choice" scroll />
      <div className="mt-2">
        <Segmented options={DISTANCE_BANDS.map(b => [b.id, b.label])} value={band} onChange={setBand} label="Distance" kind="choice" />
      </div>
      {board.length ? (
        <ol className="mt-3 bg-surface border border-line rounded-2xl divide-y divide-line">
          {board.map(p => (
            <li key={p.user_id}>
              <button type="button" onClick={onOpenSwimmer && (() => onOpenSwimmer(p.swimmer))} disabled={!onOpenSwimmer}
                className="press w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 disabled:cursor-default">
                <span className={`w-7 text-center text-sm font-bold tabular-nums flex-shrink-0 ${p.place === 1 ? 'text-neon-ink' : 'text-muted'}`}>{p.place}</span>
                <Photo url={urls[p.swimmer.photo_path]} name={p.swimmer.display_name || p.swimmer.nickname} size={40} />
                <span className="grow basis-0 min-w-[6rem]">
                  <span className="block text-sm font-semibold text-ink [overflow-wrap:anywhere]">{swimmerName(p.swimmer)}</span>
                  <span className="block text-xs text-muted tabular-nums">{fmtDistance(p.distance_m, u)} in {fmtDuration(p.seconds)} · {fmtDate(p.date)}</span>
                </span>
                <span className="ml-auto text-right">
                  <span className={`block text-lg font-bold tabular-nums leading-tight ${p.place === 1 ? 'text-neon-ink' : 'text-ink'}`}>{fmtDuration(p.perM * u.paceM)}</span>
                  <span className="block text-xs text-muted">/{u.per}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted text-center py-5">No {strokeLabel(stroke).toLowerCase()} swims of {bandInfo.hint} {u.dist} yet. They show once {onOpenSwimmer ? 'your swimmers log' : 'the team logs'} one.</p>
      )}
    </section>
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
    if (!window.confirm(`Remove ${swimmerName(swimmer)} from your team?`)) return
    await respondToSwimmer(swimmer.user_id, false)
    onRemoved()
  }
  const shown = swims ? (filter ? swims.filter(l => l.stroke === filter) : swims) : []

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="flex flex-wrap items-center gap-4">
        <Photo url={url} name={swimmer.display_name || swimmer.nickname} size={88} />
        <div className="grow basis-0 min-w-[8rem]">
          <h1 className="font-bold text-2xl text-ink leading-tight [overflow-wrap:anywhere]">{swimmerName(swimmer)}</h1>
          {swimmer.display_name && swimmer.nickname && <div className="text-sm text-muted">@{swimmer.nickname}</div>}
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

function Team({ invite, onInviteDone, onOpenSwimmer, onOpenApplications, reload, data, setCoach }) {
  const { coached, mine, roster, prs, mates = [], matePrs = [], myPhoto, urls, coach, isAdmin } = data
  return (
    <div className="space-y-4">
      {invite && !coached && <InviteCard code={invite} onJoined={() => { onInviteDone(); reload() }} onDismiss={onInviteDone} />}
      {coached ? (
        <CoachView team={coached} roster={roster} prs={prs} urls={urls} onChanged={reload} onOpenSwimmer={onOpenSwimmer} />
      ) : mine ? (
        <>
          <MyTeamCard team={mine} coachUrl={urls[mine.coach_photo]} myPhoto={myPhoto} myUrl={urls[myPhoto]} onChanged={reload} />
          {mine.status === 'active' && <TeamPractice teamId={mine.id} />}
          {mine.status === 'active' && <Teammates mates={mates} urls={urls} />}
          {mine.status === 'active' && mates.length > 1 && <Leaderboard title="Team results" prs={matePrs} roster={mates} urls={urls} />}
        </>
      ) : (
        <FindTeam onJoined={reload} />
      )}
      {(coached || !mine) && <PhotoCard path={myPhoto} url={urls[myPhoto]} onChanged={reload} coach={!!coached} />}
      {!coached && !mine && <StartTeam coach={coach} onCoachChange={setCoach} onStarted={reload} />}
      {isAdmin && (
        <Card pad="sm">
          <ListRow icon="mdi:account-check-outline" tile="info" title="Coach applications" meta="Approve or turn down new coaches" chevron onClick={onOpenApplications} />
        </Card>
      )}
    </div>
  )
}

const TABS = [['me', 'My swims'], ['team', 'Team']]

// The Swim tab: strokes with PR and last session, logging, and swim teams with a coach
export default function Swim({ intent, onIntentDone, isPro, onUpgrade }) {
  const u = useSwimUnits()
  const [tab, setTab] = useState(intent?.invite || intent?.tab === 'team' ? 'team' : 'me')
  const [swims, setSwims] = useState(null)
  const [team, setTeam] = useState(null) // { coached, mine, roster, myPhoto, urls }
  const [teamState, setTeamState] = useState('loading') // loading | ready | error
  const [swimmer, setSwimmer] = useState(null)
  const [applications, setApplications] = useState(false)
  const [invite, setInvite] = useState(intent?.invite ?? null)
  const landed = useRef(false)

  const loadSwims = () => fetchCardio(500).then(l => setSwims(l.filter(x => x.kind === 'swim'))).catch(() => setSwims([]))
  async function loadTeam() {
    try {
      const [coached, mine, myPhoto, coach, isAdmin] = await Promise.all([
        fetchCoachedTeam(), fetchMyTeam(), fetchMyPhoto(), fetchMyCoach().catch(() => null), fetchIsAdmin().catch(() => false),
      ])
      const [roster, prs] = coached ? await Promise.all([fetchRoster(), fetchTeamPrs().catch(() => [])]) : [[], []]
      // A swimmer on a team sees their teammates and the team's best paces (027)
      const onTeam = !coached && mine?.status === 'active'
      const [mates, matePrs] = onTeam ? await Promise.all([fetchTeammates().catch(() => []), fetchTeammatesPrs().catch(() => [])]) : [[], []]
      const urls = await photoUrls([myPhoto, mine?.coach_photo, ...roster.map(r => r.photo_path), ...mates.map(m => m.photo_path)])
      setTeam({ coached, mine, roster, prs, mates: mates.map(m => ({ ...m, status: 'active' })), matePrs, myPhoto, urls, coach, isAdmin })
      setTeamState('ready')
      // A coach opens Swim to see the team: start there the first time it loads
      if (coached && !landed.current) setTab('team')
      landed.current = true
    } catch {
      setTeamState('error')
    }
  }
  useEffect(() => { loadSwims(); loadTeam() }, [])
  // From an invite link, or a notification about the team (reload: there may be a new request)
  useEffect(() => {
    if (!intent) return
    if (intent.invite) setInvite(intent.invite)
    if (intent.invite || intent.tab === 'team') { setTab('team'); setSwimmer(null); loadTeam() }
    onIntentDone?.()
  }, [intent])

  useBackHandler(!!swimmer, () => setSwimmer(null), 'Swim', swimmer ? swimmerName(swimmer) : '')
  useBackHandler(applications, () => setApplications(false), 'Swim', 'Applications')

  if (applications) return <Applications />

  if (swimmer) return (
    <SwimmerPage swimmer={swimmer} url={team?.urls[swimmer.photo_path]}
      onRemoved={() => { setSwimmer(null); loadTeam() }} />
  )

  const waiting = team?.roster.filter(r => r.status === 'pending').length ?? 0

  return (
    <div className="space-y-4 py-4 slide-up">
      <h1 className="font-bold text-xl text-ink">Swim</h1>
      <Segmented options={TABS.map(([id, label]) => [id, id === 'team' && waiting ? `${label} (${waiting})` : label])} value={tab} onChange={setTab} label="Swim" />

      {tab === 'me' && team?.mine?.status === 'active' && <TeamPractice teamId={team.mine.id} compact onOpen={() => setTab('team')} />}
      {tab === 'me' && (swims ? <MySwims swims={swims} onChanged={loadSwims} isPro={isPro} onUpgrade={onUpgrade} /> : <SkeletonRows rows={5} label="Loading swims" />)}
      {tab === 'team' && (
        teamState === 'loading' ? <SkeletonRows rows={4} label="Loading your team" />
          : teamState === 'error' ? <InlineError onRetry={() => { setTeamState('loading'); loadTeam() }}>Couldn't load your team.</InlineError>
          : <Team data={team} invite={invite} onInviteDone={() => setInvite(null)} onOpenSwimmer={setSwimmer}
              onOpenApplications={() => setApplications(true)} setCoach={coach => setTeam(t => ({ ...t, coach }))} reload={loadTeam} />
      )}
    </div>
  )
}
