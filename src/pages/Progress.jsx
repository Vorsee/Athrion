import { useState, useEffect, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler, useHeaderAction } from '../lib/shell.js'
import { Button, Card, SectionTitle, Segmented, EmptyState, Skeleton, SkeletonRows, Sheet, PageHeader, Fact, InfoButton, BigNumber, StatTiles } from '../components/ui/index.js'
import LineChart from '../components/LineChart.jsx'
import { fetchWorkoutHistory, saveProfileWeight } from '../lib/api.js'
import {
  fetchMeasurements, saveMeasurement, deleteMeasurement,
  fetchProgressPhotos, uploadProgressPhoto, deleteProgressPhoto,
  fetchDailyHealth, saveDailyHealth, fetchBadges, awardBadges, fetchCheckinWeights,
  fetchCardio, saveCardio, deleteCardio,
} from '../lib/progressApi.js'
import { fmtSecs, setShort } from '../lib/sets.js'
import { KINDS, cardioUnits, parseDuration, fmtDuration, fmtDistance, paceSecs, cardioSummary } from '../lib/cardio.js'
import { buildExerciseHistory, getRecords, e1rm, weeklyStreak } from '../lib/progress.js'
import { useUnit } from '../lib/units.js'
import { BADGES, computeEarnedBadges } from '../lib/badges.js'
import { getExerciseIcon, todayKey } from '../lib/data.js'
import { healthSyncAvailable, syncHealthData } from '../lib/health.js'

const today = () => todayKey()
// A bare YYYY-MM-DD is read as local noon; new Date('2026-10-27') would be UTC midnight, the day before in the Americas
const fmtDate = d => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function NumField({ label, value, onChange, step = '0.1', placeholder = '' }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input type="number" inputMode="decimal" step={step} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
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
      <Card hero>
        <div className="text-xs font-semibold text-neon-ink mb-1">Week streak</div>
        <BigNumber value={streak} unit={streak === 1 ? 'week' : 'weeks'} />
        <StatTiles className="mt-4" items={[['This week', thisWeek], ['Workouts', history.length]]} />
      </Card>

      <Card>
        <SectionTitle action={<>
          <Fact icon="mdi:trophy-outline">{earnedIds.size}/{BADGES.length}</Fact>
          <InfoButton title="How to earn badges">
            <ul className="space-y-2.5">
              {BADGES.map(b => (
                <li key={b.id} className="flex items-start gap-3">
                  <Icon icon={b.icon} width={20} className={`mt-0.5 flex-shrink-0 ${earnedIds.has(b.id) ? 'text-neon-ink' : 'text-muted'}`} aria-hidden="true" />
                  <div><div className="text-sm font-semibold text-ink">{b.name}</div><div className="text-sm text-ink-2">{b.desc}</div></div>
                </li>
              ))}
            </ul>
          </InfoButton>
        </>}>Badges</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map(b => {
            const earned = earnedIds.has(b.id)
            return (
              <div key={b.id} className={`rounded-xl p-2.5 text-center border ${earned ? 'border-neon-stroke/30 bg-neon-tint' : 'border-line border-dashed'}`}>
                <Icon icon={earned ? b.icon : 'mdi:lock-outline'} width={26} className={`mx-auto ${earned ? 'text-neon-ink' : 'text-muted'}`} />
                <div className={`text-xs font-semibold mt-1 leading-tight ${earned ? 'text-ink' : 'text-ink-2'}`}>{b.name}</div>
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

// Weigh-in form: on the Body tab and in the header's Log weight sheet.
// latestDate: the newest weigh-in so far; one on or after it also updates the profile weight.
function WeighInForm({ onSaved, latestDate, onProfileChange }) {
  const { unit, toLb } = useUnit()
  const [form, setForm] = useState({ date: today(), weight_lb: '' })
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr('')
    try {
      const w = num(form.weight_lb)
      const row = { date: form.date, weight_lb: w == null ? null : toLb(w) }
      for (const [k] of MEASURE_FIELDS) row[k] = num(form[k])
      if (Object.entries(row).every(([k, v]) => k === 'date' || v == null)) throw new Error('Enter at least one value')
      await saveMeasurement(row)
      if (row.weight_lb != null && (!latestDate || row.date >= latestDate)) {
        await saveProfileWeight(row.weight_lb).then(() => onProfileChange?.()).catch(() => {})
      }
      setForm({ date: today(), weight_lb: '' })
      setShowMore(false)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">Date</span>
          <input type="date" value={form.date} max={today()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-neon-stroke/40" />
        </label>
        <NumField label={`Weight (${unit})`} value={form.weight_lb} onChange={v => setForm(f => ({ ...f, weight_lb: v }))} />
      </div>
      {showMore ? (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {MEASURE_FIELDS.map(([k, label]) => (
            <NumField key={k} label={label} value={form[k] ?? ''} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          ))}
        </div>
      ) : (
        <button onClick={() => setShowMore(true)} className="press text-xs font-semibold text-neon-ink mt-2 min-h-[44px] inline-flex items-center gap-1"><Icon icon="mdi:plus" width={16} />Add measurements</button>
      )}
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
      <Button full onClick={save} disabled={saving} className="mt-3">{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  )
}

function Body({ measurements, checkinWeights, onSaved, latestDate, onProfileChange }) {
  const { unit, fromLb } = useUnit()

  // Measurements take precedence over check-in weights on the same day
  const weightSeries = useMemo(() => {
    const byDate = {}
    for (const c of checkinWeights) byDate[c.date] = c.weight_lb
    for (const m of measurements) if (m.weight_lb != null) byDate[m.date] = m.weight_lb
    return Object.entries(byDate).map(([date, value]) => ({ date, value: fromLb(value) }))
  }, [measurements, checkinWeights, unit])

  const sorted = [...weightSeries].sort((a, b) => a.date.localeCompare(b.date))
  const change = sorted.length >= 2 ? Math.round((sorted[sorted.length - 1].value - sorted[0].value) * 10) / 10 : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline justify-between">
          <SectionTitle>Body weight</SectionTitle>
          {change !== null && <span className="text-xs text-muted">{change > 0 ? '+' : ''}{change} {unit} since {fmtDate(sorted[0].date)}</span>}
        </div>
        <LineChart data={weightSeries} unit={unit} label="Weight" />
      </Card>

      <Card>
        <SectionTitle>Log a weigh-in</SectionTitle>
        <WeighInForm onSaved={onSaved} latestDate={latestDate} onProfileChange={onProfileChange} />
      </Card>

      {measurements.some(m => MEASURE_FIELDS.some(([k]) => m[k] != null)) && (
        <Card>
          <SectionTitle>Measurements</SectionTitle>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-left">
                  <th className="font-normal py-1 px-1">Date</th>
                  {MEASURE_FIELDS.map(([k, l]) => <th key={k} className="font-normal py-1 px-1 text-right whitespace-nowrap">{l.split(' ')[0]}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {measurements.filter(m => MEASURE_FIELDS.some(([k]) => m[k] != null)).map(m => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-1.5 px-1 text-muted whitespace-nowrap">{fmtDate(m.date)}</td>
                    {MEASURE_FIELDS.map(([k]) => <td key={k} className="py-1.5 px-1 text-right text-ink">{m[k] ?? '–'}</td>)}
                    <td className="py-1.5 px-1 text-right">
                      <button onClick={() => deleteMeasurement(m.id).then(onSaved)} aria-label="Delete entry" className="press w-8 h-8 inline-flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/12"><Icon icon="mdi:close" width={16} /></button>
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
        <SectionTitle>Add a photo</SectionTitle>
        <div className="flex gap-2 mb-3">
          {POSES.map(p => (
            <button key={p} onClick={() => setPose(p)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize border ${pose === p ? 'border-neon-stroke bg-neon/10 text-ink' : 'border-line text-muted'}`}>
              {p}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
        <Button full icon="mdi:camera-outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading...' : `Take ${pose} photo`}
        </Button>
        {err && <p className="text-xs text-danger mt-2">{err}</p>}
        <p className="text-xs text-muted mt-2">Photos are private to your account.</p>
      </Card>

      {photos.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>Compare</SectionTitle>
            <div className="flex gap-1">
              {POSES.map(p => (
                <button key={p} onClick={() => setComparePose(p)}
                  className={`px-2 py-0.5 rounded-md text-xs capitalize ${comparePose === p ? 'bg-neon/15 text-neon-ink' : 'text-muted'}`}>{p}</button>
              ))}
            </div>
          </div>
          {forPose.length >= 2 ? (
            <div className="grid grid-cols-2 gap-2">
              {[first, latest].map((p, i) => (
                <div key={p.id}>
                  <img src={p.url} alt={`${p.pose} photo ${fmtDate(p.date)}`} className="w-full aspect-[3/4] object-cover rounded-xl bg-raised" />
                  <div className="text-xs text-muted mt-1 text-center">{i ? 'Latest' : 'First'} · {fmtDate(p.date)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Add a second {comparePose} photo to compare.</p>
          )}
        </Card>
      )}

      {photos.length > 0 && (
        <Card>
          <SectionTitle>All photos</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative">
                <img src={p.url} alt={`${p.pose} photo ${fmtDate(p.date)}`} className="w-full aspect-[3/4] object-cover rounded-lg bg-raised" />
                <div className="text-2xs text-muted mt-0.5 capitalize">{p.pose} · {fmtDate(p.date)}</div>
                <button onClick={() => deleteProgressPhoto(p).then(onChanged)} aria-label="Delete photo"
                  className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/70 text-[#fff] flex items-center justify-center"><Icon icon="mdi:close" width={16} /></button>
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
      <Card>
        <SectionTitle action={<Fact icon="mdi:calendar-range">7 days</Fact>}>Averages</SectionTitle>
        <StatTiles items={[['Steps', avg('steps')], ['Sleep (h)', avg('sleep_hours')], ['Resting HR', avg('resting_hr')]]} />
      </Card>

      {canSync && (
        <Button variant="secondary" full icon="mdi:heart-plus-outline" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync from Health'}
        </Button>
      )}

      <Card>
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Steps" step="1" value={form.steps} onChange={v => setForm(f => ({ ...f, steps: v }))} />
          <NumField label="Sleep (h)" value={form.sleep_hours} onChange={v => setForm(f => ({ ...f, sleep_hours: v }))} />
          <NumField label="Rest HR" step="1" value={form.resting_hr} onChange={v => setForm(f => ({ ...f, resting_hr: v }))} />
        </div>
        <Button full onClick={save} disabled={saving} className="mt-3">{saving ? 'Saving...' : 'Save today'}</Button>
        {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
      </Card>

      {health.length > 1 && (
        <Card>
          <SectionTitle>Steps</SectionTitle>
          <LineChart data={health.map(h => ({ date: h.date, value: h.steps }))} label="Steps" />
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Cardio: runs with pace, this week's totals and bests (swims have their own tab, Swim.jsx)
// ─────────────────────────────────────────────────────────────────────────────
function Cardio({ logs, onChanged }) {
  const { unit } = useUnit()
  const kind = 'run'
  const [form, setForm] = useState({ date: today(), distance: '', time: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const u = cardioUnits(kind, unit)
  const sum = cardioSummary(logs, kind)
  const mine = logs.filter(l => l.kind === kind)
  const pace = l => `${fmtDuration(paceSecs(l, u))} /${u.per}`

  const distance = parseFloat(form.distance)
  const seconds = parseDuration(form.time)
  const preview = distance > 0 && seconds ? pace({ seconds, distance_m: u.toM(distance) }) : null

  async function save() {
    setSaving(true); setErr('')
    try {
      if (!(distance > 0)) throw new Error(`Enter the distance in ${u.dist}`)
      if (!seconds) throw new Error('Enter the time, like 32:15 or 1:05:00')
      await saveCardio({ date: form.date, kind, distance_m: Math.round(u.toM(distance) * 10) / 10, seconds, notes: form.notes.trim().slice(0, 300) })
      setForm({ date: today(), distance: '', time: '', notes: '' })
      onChanged()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const chart = [...mine].reverse().map(l => ({ date: l.date, value: Math.round(u.fromM(l.distance_m) * 100) / 100 }))

  return (
    <div className="space-y-4">
      <Card hero>
        <SectionTitle action={<Fact icon="mdi:calendar-week">This week</Fact>}>{KINDS[kind].label}s</SectionTitle>
        <StatTiles items={[
          ['Distance', sum.week.sessions ? fmtDistance(sum.week.distance_m, u) : '–'],
          ['Time', sum.week.sessions ? fmtDuration(sum.week.seconds) : '–'],
          [kind === 'run' ? 'Runs' : 'Swims', sum.week.sessions],
        ]} />
      </Card>

      <Card>
        <SectionTitle>Log a {kind}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumField label={`Distance (${u.dist})`} step={u.dist === 'km' || u.dist === 'mi' ? '0.01' : '25'} value={form.distance}
            onChange={v => setForm(f => ({ ...f, distance: v }))} placeholder={kind === 'run' ? (u.dist === 'km' ? '5' : '3.1') : (u.dist === 'm' ? '1500' : '1650')} />
          <label className="block">
            <span className="text-xs text-muted">Time</span>
            <input inputMode="numeric" value={form.time} placeholder={kind === 'run' ? '28:30' : '32:00'} aria-label="Time"
              onChange={e => setForm(f => ({ ...f, time: e.target.value.replace(/[^\d:]/g, '').slice(0, 8) }))}
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Date</span>
            <input type="date" value={form.date} max={today()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-neon-stroke/40" />
          </label>
          <div className="flex flex-col justify-end">
            <span className="text-xs text-muted">Pace</span>
            <span className="mt-1 h-[38px] flex items-center text-sm font-bold text-neon-ink tabular-nums">{preview ?? '–'}</span>
          </div>
        </div>
        <input value={form.notes} maxLength={300} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder={kind === 'run' ? 'Notes: easy run, intervals, hills' : 'Notes: freestyle, drills, open water'} aria-label="Notes"
          className="mt-3 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
        <Button full onClick={save} disabled={saving} className="mt-3">{saving ? 'Saving...' : `Save ${kind}`}</Button>
        {err && <p className="text-xs text-danger mt-2">{err}</p>}
      </Card>

      {sum.count > 0 && (
        <Card>
          <SectionTitle>Bests</SectionTitle>
          <StatTiles items={[
            ['Longest', fmtDistance(sum.longest.distance_m, u)],
            [`Fastest per ${u.per}`, sum.fastest ? fmtDuration(paceSecs(sum.fastest, u)) : '–'],
            ['All time', `${sum.count} ${kind === 'run' ? (sum.count === 1 ? 'run' : 'runs') : (sum.count === 1 ? 'swim' : 'swims')}`],
          ]} />
        </Card>
      )}

      {chart.length > 1 && (
        <Card>
          <SectionTitle>Distance</SectionTitle>
          <LineChart data={chart} unit={u.dist} label="Distance" />
        </Card>
      )}

      {mine.length > 0 ? (
        <Card>
          <SectionTitle>History</SectionTitle>
          <div className="divide-y divide-line">
            {mine.slice(0, 30).map(l => (
              <div key={l.id} className="flex items-center gap-3 py-2.5">
                <Icon icon={KINDS[kind].icon} width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink tabular-nums">{fmtDistance(l.distance_m, u)} · {fmtDuration(l.seconds)}</div>
                  <div className="text-xs text-muted truncate">{fmtDate(l.date)} · {pace(l)}{l.notes ? ` · ${l.notes}` : ''}</div>
                </div>
                <button onClick={() => deleteCardio(l.id).then(onChanged)} aria-label={`Delete ${kind} on ${fmtDate(l.date)}`}
                  className="press w-9 h-9 inline-flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/12">
                  <Icon icon="mdi:close" width={16} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState icon={KINDS[kind].icon} title={`No ${kind}s yet`}>
          Log one above to see your pace, weekly distance and bests.
        </EmptyState>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifts: per-exercise records and estimated 1RM trend
// ─────────────────────────────────────────────────────────────────────────────
function Lifts({ history }) {
  const { unit, fromLb, fmt } = useUnit()
  const byEx = useMemo(() => buildExerciseHistory(history), [history])
  const names = Object.keys(byEx).sort((a, b) => byEx[b].length - byEx[a].length)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  useBackHandler(!!selected, () => setSelected(null), 'Progress', selected)

  if (!names.length) {
    return (
      <Card>
        <EmptyState icon="mdi:chart-line" title="Your lifts will chart here">
          Finish a workout and each exercise gets its own history.
        </EmptyState>
      </Card>
    )
  }

  if (selected) {
    const sessions = byEx[selected]
    const rec = getRecords(sessions)
    const held = rec.maxSecs > 0
    const weighted = !held && rec.maxWeight > 0
    const series = sessions.map(s => ({
      date: s.createdAt,
      value: held ? Math.max(...s.sets.map(x => x.secs ?? 0))
        : weighted ? fromLb(Math.max(...s.sets.map(x => e1rm(x.weight, x.reps)))) : Math.max(...s.sets.map(x => x.reps)),
    }))
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Icon icon={getExerciseIcon({ name: selected })} width={28} className="text-neon-ink flex-shrink-0" />
          <div className="font-bold text-xl text-ink leading-tight break-words">{selected}</div>
        </div>
        <StatTiles items={held
          ? [['Longest hold', fmtSecs(rec.maxSecs)], ['Sessions', sessions.length], ['Sets', sessions.reduce((a, s) => a + s.sets.length, 0)]]
          : weighted
          ? [['Heaviest', `${fromLb(rec.maxWeight)}×${rec.maxWeightReps}`], ['Est. 1RM', Math.round(fromLb(rec.bestE1rm))], ['Best volume', Math.round(fromLb(rec.bestVolume))]]
          : [['Most reps', rec.maxReps], ['Sessions', sessions.length], ['Best volume', '–']]} />
        <Card>
          <SectionTitle>{held ? 'Longest hold (seconds)' : weighted ? 'Estimated 1-rep max' : 'Best set (reps)'}</SectionTitle>
          <LineChart data={series} unit={held ? 's' : weighted ? unit : 'reps'} label={held ? 'Seconds' : weighted ? 'Est. 1RM' : 'Reps'} />
        </Card>
        <Card>
          <SectionTitle>Sessions</SectionTitle>
          <div className="space-y-1.5">
            {[...sessions].reverse().slice(0, 15).map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1 border-b border-line last:border-0">
                <span className="text-xs text-muted flex-shrink-0">{fmtDate(s.createdAt)}</span>
                <span className="text-xs text-ink text-right break-words">{s.sets.map(x => setShort(x, fromLb)).join(', ')}</span>
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
        className="w-full bg-surface border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40" />
      {filtered.map(name => {
        const rec = getRecords(byEx[name])
        return (
          <button key={name} onClick={() => setSelected(name)}
            className="w-full flex items-center gap-3 bg-surface border border-line rounded-xl px-3 py-3 text-left hover:border-line-strong">
            <Icon icon={getExerciseIcon({ name })} width={22} className="text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink break-words">{name}</div>
              <div className="text-xs text-muted">{byEx[name].length} sessions</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-bold text-lg text-neon-ink leading-none">{rec.maxSecs > 0 ? fmtSecs(rec.maxSecs) : rec.maxWeight > 0 ? fmt(rec.maxWeight) : `${rec.maxReps} reps`}</div>
              <div className="text-xs font-medium text-muted">best</div>
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
  ['overview', 'Overview'], ['body', 'Body'], ['lifts', 'Lifts'], ['cardio', 'Cardio'], ['health', 'Health'],
]

export default function Progress({ profile, onProfileChange }) {
  const [tab, setTab] = useState('overview')
  const [history, setHistory] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [checkinWeights, setCheckinWeights] = useState([])
  const [photos, setPhotos] = useState([])
  const [cardio, setCardio] = useState([])
  const [health, setHealth] = useState([])
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)
  const [logWeight, setLogWeight] = useState(false)
  useHeaderAction('mdi:scale-bathroom', 'Log weight', () => setLogWeight(true))

  async function load() {
    fetchCardio().then(setCardio).catch(() => setCardio([]))
    const [h, m, cw, p, hl, earnedRows] = await Promise.all([
      fetchWorkoutHistory().catch(() => []),
      fetchMeasurements().catch(() => []),
      fetchCheckinWeights().catch(() => []),
      fetchProgressPhotos().catch(() => []),
      fetchDailyHealth(30).catch(() => []),
      fetchBadges().catch(() => []),
    ])
    setHistory(h); setMeasurements(m); setCheckinWeights(cw); setPhotos(p); setHealth(hl)
    syncProfileWeight(m)

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

  // Catch up a weigh-in the profile missed (logged before weigh-ins updated it, or on another
  // device): the newest one wins if it was entered after the profile was last saved
  function syncProfileWeight(m) {
    const latest = m.filter(x => x.weight_lb != null).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (!latest || !profile || Number(latest.weight_lb) === Number(profile.weight_lb)) return
    if (profile.updated_at && latest.created_at && Date.parse(latest.created_at) < Date.parse(profile.updated_at)) return
    saveProfileWeight(Number(latest.weight_lb)).then(() => onProfileChange?.()).catch(() => {})
  }
  const latestDate = [...measurements.filter(m => m.weight_lb != null).map(m => m.date), ...checkinWeights.map(c => c.date)].sort().at(-1) ?? null

  return (
    <div className="space-y-4 pt-2 pb-4">
      <PageHeader icon="mdi:chart-line" title="Progress" />
      <Segmented options={TABS} value={tab} onChange={setTab} label="Progress sections" />

      {loading ? (
        <div role="status" aria-label="Loading your progress" className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <SkeletonRows rows={2} label="Loading your progress" />
        </div>
      ) : (
        <>
          {tab === 'overview' && <Overview history={history} badges={badges} />}
          {tab === 'body' && <Body measurements={measurements} checkinWeights={checkinWeights} onSaved={load} latestDate={latestDate} onProfileChange={onProfileChange} />}
          {/* Photos left the tabs for Cardio; anyone who already has some still sees them under Body */}
          {tab === 'body' && photos.length > 0 && <Photos photos={photos} onChanged={load} />}
          {tab === 'lifts' && <Lifts history={history} />}
          {tab === 'cardio' && <Cardio logs={cardio} onChanged={load} />}
          {tab === 'health' && <Health health={health} onChanged={load} />}
        </>
      )}

      {logWeight && (
        <Sheet title="Log weight" onClose={() => setLogWeight(false)}>
          <WeighInForm onSaved={() => { setLogWeight(false); load() }} latestDate={latestDate} onProfileChange={onProfileChange} />
        </Sheet>
      )}
    </div>
  )
}
