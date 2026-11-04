import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, EmptyState, SkeletonRows, StatTiles, Sheet } from '../components/ui/index.js'
import { fetchCardio, saveCardio, deleteCardio } from '../lib/progressApi.js'
import { cardioUnits, cardioSummary, parseDuration, fmtDuration, fmtDistance, paceSecs } from '../lib/cardio.js'
import { cardContent } from '../lib/shareCard.js'
import { todayKey } from '../lib/data.js'
import { useUnit } from '../lib/units.js'
import ShareSheet from '../components/ShareSheet.jsx'
import LineChart from '../components/LineChart.jsx'

const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const inputCls = 'w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40'
const PACE_MIN_M = 1000 // pace counts on runs of 1 km or more, as cardioSummary's fastest does

// km for kg users, miles for lb users (cardio.js)
function useRunUnits() {
  const { unit } = useUnit()
  return cardioUnits('run', unit)
}

const pace = (l, u) => `${fmtDuration(paceSecs(l, u))} /${u.per}`

export function runCard(l, u) {
  return cardContent({ kind: 'run', date: l.date, title: 'Run', distance: fmtDistance(l.distance_m, u), time: fmtDuration(l.seconds),
    pace: l.seconds > 0 && Number(l.distance_m) > 0 ? pace(l, u) : '' })
}

function LogRun({ onSaved }) {
  const u = useRunUnits()
  const [form, setForm] = useState({ date: todayKey(), distance: '', time: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const distance = parseFloat(form.distance)
  const seconds = parseDuration(form.time)
  const preview = distance > 0 && seconds ? pace({ seconds, distance_m: u.toM(distance) }, u) : null
  const change = key => e => setForm(f => ({ ...f, [key]: key === 'time' ? e.target.value.replace(/[^\d:]/g, '').slice(0, 8) : e.target.value }))

  async function save() {
    setSaving(true); setErr('')
    try {
      if (!(distance > 0)) throw new Error(`Enter the distance in ${u.dist}`)
      if (!seconds) throw new Error('Enter the time, like 28:30 or 1:05:00')
      const saved = await saveCardio({ date: form.date, kind: 'run', distance_m: Math.round(u.toM(distance) * 10) / 10, seconds, notes: form.notes.trim().slice(0, 300) })
      onSaved(saved)
    } catch (e) {
      setErr(e.message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <label className="block">
          <span className="text-xs text-muted">Distance ({u.dist})</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder={u.dist === 'km' ? '5' : '3.1'} value={form.distance} onChange={change('distance')} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Time</span>
          <input inputMode="numeric" placeholder="28:30" value={form.time} onChange={change('time')} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Date</span>
          <input type="date" value={form.date} max={todayKey()} onChange={change('date')} className={`mt-1 ${inputCls}`} />
        </label>
        <div className="flex flex-col justify-end">
          <span className="text-xs text-muted">Pace</span>
          <span className="mt-1 min-h-[38px] flex items-center text-sm font-bold text-neon-ink tabular-nums">{preview ?? '–'}</span>
        </div>
      </div>
      <input value={form.notes} maxLength={300} onChange={change('notes')} placeholder="Notes: route, intervals, treadmill" aria-label="Notes" className={inputCls} />
      <Button full onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save run'}</Button>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  )
}

function RunList({ runs, onDelete, onShare }) {
  const u = useRunUnits()
  return (
    <div className="divide-y divide-line">
      {runs.map(l => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center text-neon-ink flex-shrink-0">
            <Icon icon="mdi:run" width={20} />
          </span>
          <div className="grow basis-0 min-w-[7rem]">
            <div className="text-sm font-semibold text-ink tabular-nums">{fmtDistance(l.distance_m, u)} · {fmtDuration(l.seconds)}</div>
            <div className="text-xs text-muted break-words">{fmtDate(l.date)} · {pace(l, u)}{l.notes ? ` · ${l.notes}` : ''}</div>
          </div>
          <button onClick={() => onShare(l)} aria-label={`Share run on ${fmtDate(l.date)}`}
            className="press w-9 h-9 inline-flex items-center justify-center rounded-md text-muted hover:text-neon-ink hover:bg-raised ml-auto">
            <Icon icon="mdi:share-variant-outline" width={16} aria-hidden="true" />
          </button>
          <button onClick={() => onDelete(l)} aria-label={`Delete run on ${fmtDate(l.date)}`}
            className="press w-9 h-9 inline-flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/12">
            <Icon icon="mdi:close" width={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Cardio → Run: this week, best pace and longest run, the pace chart, and every run
export default function Run() {
  const u = useRunUnits()
  const [runs, setRuns] = useState(null)
  const [logging, setLogging] = useState(false)
  const [justLogged, setJustLogged] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [all, setAll] = useState(false)

  const load = () => fetchCardio(500).then(l => setRuns(l.filter(x => x.kind === 'run'))).catch(() => setRuns([]))
  useEffect(() => { load() }, [])

  if (!runs) return <SkeletonRows rows={5} label="Loading runs" />

  const sum = cardioSummary(runs, 'run')
  const points = runs.filter(l => Number(l.distance_m) >= PACE_MIN_M && l.seconds > 0)
    .map(l => ({ date: l.date, value: paceSecs(l, u) }))
  const del = l => deleteCardio(l.id).then(load)

  return (
    <div className="space-y-4">
      {runs.length > 0 && (
        <Card>
          <SectionTitle>This week</SectionTitle>
          <StatTiles items={[
            ['Distance', fmtDistance(sum.week.distance_m, u)],
            ['Runs', sum.week.sessions],
            ['Time', sum.week.seconds ? fmtDuration(sum.week.seconds) : '0:00'],
          ]} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted tabular-nums">
            {sum.fastest && <span>Best pace <span className="font-semibold text-neon-ink">{pace(sum.fastest, u)}</span></span>}
            {sum.longest && <span>Longest <span className="font-semibold text-ink">{fmtDistance(sum.longest.distance_m, u)}</span></span>}
          </div>
        </Card>
      )}

      <Button full icon="mdi:plus" onClick={() => setLogging(true)}>Log a run</Button>

      {justLogged && (
        <Card className="flex flex-wrap items-center gap-3 pop-in">
          <Icon icon="mdi:check-circle-outline" width={24} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
          <span className="grow min-w-[8rem] text-sm text-ink"><span className="font-semibold">Run saved.</span> {fmtDistance(justLogged.distance_m, u)} in {fmtDuration(justLogged.seconds)}</span>
          <Button size="sm" icon="mdi:share-variant-outline" onClick={() => { setSharing(runCard(justLogged, u)); setJustLogged(null) }}>Share</Button>
        </Card>
      )}

      {points.length >= 2 && (
        <Card>
          <SectionTitle>Pace</SectionTitle>
          <LineChart data={points} label="Run pace" format={v => fmtDuration(v)} />
          <p className="text-xs text-muted mt-2">Pace per {u.per} on runs of {u.dist === 'km' ? '1 km' : '0.6 mi'} or more. Lower is faster.</p>
        </Card>
      )}

      {runs.length > 0 ? (
        <Card>
          <SectionTitle action={runs.length > 5 && <button onClick={() => setAll(v => !v)} className="press text-xs font-semibold text-neon-ink min-h-[32px]">{all ? 'Less' : 'All'}</button>}>Recent runs</SectionTitle>
          <RunList runs={all ? runs : runs.slice(0, 5)} onDelete={del} onShare={l => setSharing(runCard(l, u))} />
        </Card>
      ) : (
        <EmptyState icon="mdi:run" title="No runs yet">Log one to see your weekly distance, best pace and longest run.</EmptyState>
      )}

      {logging && (
        <Sheet title="Log a run" onClose={() => setLogging(false)}>
          <LogRun onSaved={row => { setLogging(false); setJustLogged(row ?? null); load() }} />
        </Sheet>
      )}
      {sharing && <ShareSheet content={sharing} onClose={() => setSharing(null)} />}
    </div>
  )
}
