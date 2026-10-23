import { useState, useEffect, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import LineChart from '../components/LineChart.jsx'
import ReminderSettings from '../components/ReminderSettings.jsx'
import { fetchWorkoutHistory } from '../lib/api.js'
import {
  fetchMeasurements, saveMeasurement, deleteMeasurement,
  fetchProgressPhotos, uploadProgressPhoto, deleteProgressPhoto,
  fetchDailyHealth, saveDailyHealth, fetchBadges, awardBadges, fetchCheckinWeights,
} from '../lib/progressApi.js'
import { buildExerciseHistory, getRecords, e1rm, weeklyStreak } from '../lib/progress.js'
import { BADGES, computeEarnedBadges } from '../lib/badges.js'
import { getExerciseIcon } from '../lib/data.js'
import { healthSyncAvailable, syncHealthData } from '../lib/health.js'

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Card({ children, className = '' }) {
  return <div className={`bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 ${className}`}>{children}</div>
}

function SectionLabel({ children }) {
  return <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{children}</div>
}

function NumField({ label, value, onChange, step = '0.1', placeholder = '' }) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
      <input type="number" inputMode="decimal" step={step} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40" />
    </label>
  )
}

const num = v => (v === '' || v == null ? null : Number(v))

// ─────────────────────────────────────────────────────────────────────────────
// Overview: streak + badges
// ─────────────────────────────────────────────────────────────────────────────
function Overview({ history, badges }) {
  const streak = weeklyStreak(history)
  const thisWeek = history.filter(h => Date.now() - new Date(h.created_at) < 7 * 86400000).length
  const earnedIds = new Set(badges.map(b => b.badge_id))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Week streak', streak, 'mdi:fire'],
          ['This week', thisWeek, 'mdi:calendar-check'],
          ['Workouts', history.length, 'mdi:dumbbell'],
        ].map(([label, val, icon]) => (
          <Card key={label} className="text-center p-3">
            <Icon icon={icon} width={20} className="mx-auto text-neon mb-1" />
            <div className="font-bebas text-3xl text-white leading-none">{val}</div>
            <div className="text-[10px] text-gray-600 uppercase mt-1">{label}</div>
          </Card>
        ))}
      </div>

      <ReminderSettings />

      <Card>
        <SectionLabel>Badges · {earnedIds.size}/{BADGES.length}</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map(b => {
            const earned = earnedIds.has(b.id)
            return (
              <div key={b.id} className={`rounded-xl p-2.5 text-center border ${earned ? 'border-neon/30 bg-neon/5' : 'border-[#1e1e1e] opacity-40'}`}>
                <Icon icon={b.icon} width={26} className={`mx-auto ${earned ? 'text-neon' : 'text-gray-600'}`} />
                <div className="text-[11px] font-semibold text-white mt-1 leading-tight">{b.name}</div>
                <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">{b.desc}</div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Body: weight trend + measurements
// ─────────────────────────────────────────────────────────────────────────────
const MEASURE_FIELDS = [
  ['waist_in', 'Waist (in)'], ['chest_in', 'Chest (in)'], ['hips_in', 'Hips (in)'],
  ['arm_in', 'Arm (in)'], ['thigh_in', 'Thigh (in)'], ['body_fat_pct', 'Body fat %'],
]

function Body({ measurements, checkinWeights, onSaved }) {
  const [form, setForm] = useState({ date: today(), weight_lb: '' })
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Measurements take precedence over check-in weights on the same day
  const weightSeries = useMemo(() => {
    const byDate = {}
    for (const c of checkinWeights) byDate[c.date] = c.weight_lb
    for (const m of measurements) if (m.weight_lb != null) byDate[m.date] = m.weight_lb
    return Object.entries(byDate).map(([date, value]) => ({ date, value }))
  }, [measurements, checkinWeights])

  async function save() {
    setSaving(true); setErr('')
    try {
      const row = { date: form.date, weight_lb: num(form.weight_lb) }
      for (const [k] of MEASURE_FIELDS) row[k] = num(form[k])
      if (Object.entries(row).every(([k, v]) => k === 'date' || v == null)) throw new Error('Enter at least one value')
      await saveMeasurement(row)
      setForm({ date: today(), weight_lb: '' })
      setShowMore(false)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const sorted = [...weightSeries].sort((a, b) => a.date.localeCompare(b.date))
  const change = sorted.length >= 2 ? Math.round((sorted[sorted.length - 1].value - sorted[0].value) * 10) / 10 : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline justify-between">
          <SectionLabel>Body weight</SectionLabel>
          {change !== null && <span className="text-xs text-gray-500">{change > 0 ? '+' : ''}{change} lb since {fmtDate(sorted[0].date)}</span>}
        </div>
        <LineChart data={weightSeries} unit="lb" label="Weight" />
      </Card>

      <Card>
        <SectionLabel>Log a weigh-in</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Date</span>
            <input type="date" value={form.date} max={today()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1 w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-neon/40" />
          </label>
          <NumField label="Weight (lb)" value={form.weight_lb} onChange={v => setForm(f => ({ ...f, weight_lb: v }))} />
        </div>
        {showMore ? (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {MEASURE_FIELDS.map(([k, label]) => (
              <NumField key={k} label={label} value={form[k] ?? ''} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
            ))}
          </div>
        ) : (
          <button onClick={() => setShowMore(true)} className="text-xs text-neon mt-3">+ Add measurements</button>
        )}
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <button onClick={save} disabled={saving}
          className="mt-3 w-full bg-neon text-black font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </Card>

      {measurements.some(m => MEASURE_FIELDS.some(([k]) => m[k] != null)) && (
        <Card>
          <SectionLabel>Measurements</SectionLabel>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 text-left">
                  <th className="font-normal py-1 px-1">Date</th>
                  {MEASURE_FIELDS.map(([k, l]) => <th key={k} className="font-normal py-1 px-1 text-right whitespace-nowrap">{l.split(' ')[0]}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {measurements.filter(m => MEASURE_FIELDS.some(([k]) => m[k] != null)).map(m => (
                  <tr key={m.id} className="border-t border-[#1e1e1e]">
                    <td className="py-1.5 px-1 text-gray-400 whitespace-nowrap">{fmtDate(m.date)}</td>
                    {MEASURE_FIELDS.map(([k]) => <td key={k} className="py-1.5 px-1 text-right text-white">{m[k] ?? '–'}</td>)}
                    <td className="py-1.5 px-1 text-right">
                      <button onClick={() => deleteMeasurement(m.id).then(onSaved)} aria-label="Delete entry" className="text-gray-700 hover:text-red-400">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Photos: upload + first vs latest comparison
// ─────────────────────────────────────────────────────────────────────────────
const POSES = ['front', 'side', 'back']

function Photos({ photos, onChanged }) {
  const fileRef = useRef(null)
  const [pose, setPose] = useState('front')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [comparePose, setComparePose] = useState('front')

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      await uploadProgressPhoto(file, { date: today(), pose })
      onChanged()
    } catch (e2) {
      setErr(e2.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const forPose = photos.filter(p => p.pose === comparePose).sort((a, b) => a.date.localeCompare(b.date))
  const first = forPose[0], latest = forPose[forPose.length - 1]

  return (
    <div className="space-y-4">
      <Card>
        <SectionLabel>Add a photo</SectionLabel>
        <div className="flex gap-2 mb-3">
          {POSES.map(p => (
            <button key={p} onClick={() => setPose(p)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize border ${pose === p ? 'border-neon bg-neon/10 text-white' : 'border-[#222] text-gray-500'}`}>
              {p}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full bg-neon text-black font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
          <Icon icon="mdi:camera" width={16} />{busy ? 'Uploading...' : `Take ${pose} photo`}
        </button>
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <p className="text-[10px] text-gray-700 mt-2">Photos are private to your account.</p>
      </Card>

      {photos.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Compare</SectionLabel>
            <div className="flex gap-1">
              {POSES.map(p => (
                <button key={p} onClick={() => setComparePose(p)}
                  className={`px-2 py-0.5 rounded-md text-[10px] capitalize ${comparePose === p ? 'bg-neon/15 text-neon' : 'text-gray-600'}`}>{p}</button>
              ))}
            </div>
          </div>
          {forPose.length >= 2 ? (
            <div className="grid grid-cols-2 gap-2">
              {[first, latest].map((p, i) => (
                <div key={p.id}>
                  <img src={p.url} alt={`${p.pose} photo ${fmtDate(p.date)}`} className="w-full aspect-[3/4] object-cover rounded-xl bg-[#1a1a1a]" />
                  <div className="text-[10px] text-gray-500 mt-1 text-center">{i ? 'Latest' : 'First'} · {fmtDate(p.date)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600">Add a second {comparePose} photo to compare.</p>
          )}
        </Card>
      )}

      {photos.length > 0 && (
        <Card>
          <SectionLabel>All photos</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative">
                <img src={p.url} alt={`${p.pose} photo ${fmtDate(p.date)}`} className="w-full aspect-[3/4] object-cover rounded-lg bg-[#1a1a1a]" />
                <div className="text-[9px] text-gray-500 mt-0.5 capitalize">{p.pose} · {fmtDate(p.date)}</div>
                <button onClick={() => deleteProgressPhoto(p).then(onChanged)} aria-label="Delete photo"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-gray-300 text-xs">✕</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Health: steps, sleep, resting HR (manual or synced)
// ─────────────────────────────────────────────────────────────────────────────
function Health({ health, onChanged }) {
  const todayRow = health.find(h => h.date === today())
  const [form, setForm] = useState({
    steps: todayRow?.steps ?? '', sleep_hours: todayRow?.sleep_hours ?? '', resting_hr: todayRow?.resting_hr ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const canSync = healthSyncAvailable()

  async function save() {
    setSaving(true); setMsg('')
    try {
      await saveDailyHealth({ date: today(), steps: num(form.steps), sleep_hours: num(form.sleep_hours), resting_hr: num(form.resting_hr), source: 'manual' })
      setMsg('Saved')
      onChanged()
    } catch (e) {
      setMsg(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function sync() {
    setSyncing(true); setMsg('')
    try {
      const n = await syncHealthData(14)
      setMsg(`Synced ${n} days`)
      onChanged()
    } catch (e) {
      setMsg(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const week = health.filter(h => Date.now() - new Date(h.date) < 7 * 86400000)
  const avg = key => {
    const v = week.map(h => h[key]).filter(x => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + Number(b), 0) / v.length) * 10) / 10 : '–'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[['Avg steps', avg('steps'), 'mdi:shoe-print'], ['Avg sleep', avg('sleep_hours'), 'mdi:sleep'], ['Resting HR', avg('resting_hr'), 'mdi:heart-pulse']].map(([l, v, icon]) => (
          <Card key={l} className="text-center p-3">
            <Icon icon={icon} width={20} className="mx-auto text-neon mb-1" />
            <div className="font-bebas text-2xl text-white leading-none">{v}</div>
            <div className="text-[10px] text-gray-600 uppercase mt-1">{l} · 7d</div>
          </Card>
        ))}
      </div>

      {canSync && (
        <button onClick={sync} disabled={syncing}
          className="w-full border border-neon/30 text-neon font-semibold py-3 rounded-xl text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
          <Icon icon="mdi:heart-plus" width={16} />{syncing ? 'Syncing...' : 'Sync from Health'}
        </button>
      )}

      <Card>
        <SectionLabel>Today</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Steps" step="1" value={form.steps} onChange={v => setForm(f => ({ ...f, steps: v }))} />
          <NumField label="Sleep (h)" value={form.sleep_hours} onChange={v => setForm(f => ({ ...f, sleep_hours: v }))} />
          <NumField label="Rest HR" step="1" value={form.resting_hr} onChange={v => setForm(f => ({ ...f, resting_hr: v }))} />
        </div>
        <button onClick={save} disabled={saving}
          className="mt-3 w-full bg-neon text-black font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Today'}
        </button>
        {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}
        <p className="text-[10px] text-gray-700 mt-2">Your coach uses sleep and recovery data when it adapts next week's plan.</p>
      </Card>

      {health.length > 1 && (
        <Card>
          <SectionLabel>Steps</SectionLabel>
          <LineChart data={health.map(h => ({ date: h.date, value: h.steps }))} label="Steps" />
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifts: per-exercise records and estimated 1RM trend
// ─────────────────────────────────────────────────────────────────────────────
function Lifts({ history }) {
  const byEx = useMemo(() => buildExerciseHistory(history), [history])
  const names = Object.keys(byEx).sort((a, b) => byEx[b].length - byEx[a].length)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')

  if (!names.length) {
    return <Card><p className="text-xs text-gray-500">Log a workout to start tracking your lifts.</p></Card>
  }

  if (selected) {
    const sessions = byEx[selected]
    const rec = getRecords(sessions)
    const weighted = rec.maxWeight > 0
    const series = sessions.map(s => ({
      date: s.createdAt,
      value: weighted ? Math.max(...s.sets.map(x => e1rm(x.weight, x.reps))) : Math.max(...s.sets.map(x => x.reps)),
    }))
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="text-xs text-gray-500">← All exercises</button>
        <div className="flex items-center gap-3">
          <Icon icon={getExerciseIcon({ name: selected })} width={28} className="text-neon flex-shrink-0" />
          <div className="font-bebas text-2xl text-white tracking-wide leading-tight break-words">{selected}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(weighted
            ? [['Heaviest', `${rec.maxWeight}×${rec.maxWeightReps}`], ['Est. 1RM', Math.round(rec.bestE1rm)], ['Best volume', Math.round(rec.bestVolume)]]
            : [['Most reps', rec.maxReps], ['Sessions', sessions.length], ['Best volume', '–']]
          ).map(([l, v]) => (
            <Card key={l} className="text-center p-3">
              <div className="font-bebas text-2xl text-white leading-none">{v}</div>
              <div className="text-[10px] text-gray-600 uppercase mt-1">{l}</div>
            </Card>
          ))}
        </div>
        <Card>
          <SectionLabel>{weighted ? 'Estimated 1-rep max' : 'Best set (reps)'}</SectionLabel>
          <LineChart data={series} unit={weighted ? 'lb' : 'reps'} label={weighted ? 'Est. 1RM' : 'Reps'} />
        </Card>
        <Card>
          <SectionLabel>Sessions</SectionLabel>
          <div className="space-y-1.5">
            {[...sessions].reverse().slice(0, 15).map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1 border-b border-[#1e1e1e] last:border-0">
                <span className="text-xs text-gray-500 flex-shrink-0">{fmtDate(s.createdAt)}</span>
                <span className="text-xs text-white text-right break-words">{s.sets.map(x => `${x.weight}×${x.reps}`).join(', ')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  const filtered = names.filter(n => n.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="space-y-3">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search exercises"
        className="w-full bg-[#141414] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40" />
      {filtered.map(name => {
        const rec = getRecords(byEx[name])
        return (
          <button key={name} onClick={() => setSelected(name)}
            className="w-full flex items-center gap-3 bg-[#141414] border border-[#1e1e1e] rounded-xl px-3 py-3 text-left hover:border-[#2a2a2a]">
            <Icon icon={getExerciseIcon({ name })} width={22} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white break-words">{name}</div>
              <div className="text-[11px] text-gray-500">{byEx[name].length} sessions</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-bebas text-lg text-neon leading-none">{rec.maxWeight > 0 ? `${rec.maxWeight} lb` : `${rec.maxReps} reps`}</div>
              <div className="text-[10px] text-gray-600">best</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  ['overview', 'Overview'], ['body', 'Body'], ['lifts', 'Lifts'], ['photos', 'Photos'], ['health', 'Health'],
]

export default function Progress() {
  const [tab, setTab] = useState('overview')
  const [history, setHistory] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [checkinWeights, setCheckinWeights] = useState([])
  const [photos, setPhotos] = useState([])
  const [health, setHealth] = useState([])
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [h, m, cw, p, hl, earnedRows] = await Promise.all([
      fetchWorkoutHistory().catch(() => []),
      fetchMeasurements().catch(() => []),
      fetchCheckinWeights().catch(() => []),
      fetchProgressPhotos().catch(() => []),
      fetchDailyHealth(30).catch(() => []),
      fetchBadges().catch(() => []),
    ])
    setHistory(h); setMeasurements(m); setCheckinWeights(cw); setPhotos(p); setHealth(hl)

    // Award anything newly earned
    let b = earnedRows
    const have = new Set(b.map(x => x.badge_id))
    const weighIns = new Set([...m.filter(x => x.weight_lb != null).map(x => x.date), ...cw.map(x => x.date)]).size
    const fresh = [...computeEarnedBadges({ history: h, weighIns, photos: p.length })].filter(id => !have.has(id))
    if (fresh.length) {
      await awardBadges(fresh).catch(() => {})
      b = [...b, ...fresh.map(badge_id => ({ badge_id, earned_at: new Date().toISOString() }))]
    }
    setBadges(b)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4 pt-2 pb-4">
      <div className="font-bebas text-3xl text-white tracking-wide">Progress</div>
      <div className="flex bg-[#111] border border-[#222] rounded-2xl p-1 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 min-w-[64px] py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all ${
              tab === id ? 'bg-neon text-black' : 'text-gray-500'
            }`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-700 text-sm animate-pulse text-center py-16">Loading your progress...</div>
      ) : (
        <>
          {tab === 'overview' && <Overview history={history} badges={badges} />}
          {tab === 'body' && <Body measurements={measurements} checkinWeights={checkinWeights} onSaved={load} />}
          {tab === 'lifts' && <Lifts history={history} />}
          {tab === 'photos' && <Photos photos={photos} onChanged={load} />}
          {tab === 'health' && <Health health={health} onChanged={load} />}
        </>
      )}
    </div>
  )
}
