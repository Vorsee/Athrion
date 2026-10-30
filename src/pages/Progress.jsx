import { useState, useEffect, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, Segmented, Skeleton, SkeletonRows, Fact, InfoButton, BigNumber, StatTiles } from '../components/ui/index.js'
import LineChart from '../components/LineChart.jsx'
import { fetchWorkoutHistory, saveProfileWeight } from '../lib/api.js'
import {
  fetchMeasurements, saveMeasurement, deleteMeasurement,
  fetchProgressPhotos, uploadProgressPhoto, deleteProgressPhoto,
  fetchBadges, awardBadges, fetchCheckinWeights, fetchCardio,
} from '../lib/progressApi.js'
import { weeklyStreak } from '../lib/progress.js'
import { useUnit } from '../lib/units.js'
import { BADGES, computeEarnedBadges } from '../lib/badges.js'
import { todayKey } from '../lib/data.js'

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
function Overview({ history, badges, fresh = new Set() }) {
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
        {/* Training and swim badges; earned first. Ones earned on this visit pop in, marked New */}
        {[['Training', BADGES.filter(b => !b.id.startsWith('swim_'))], ['Swim', BADGES.filter(b => b.id.startsWith('swim_'))]].map(([label, list]) => (
          <div key={label} className="mt-3 first:mt-0">
            <div className="text-xs font-semibold text-muted mb-1.5">{label} · {list.filter(b => earnedIds.has(b.id)).length}/{list.length}</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 5.5rem), 1fr))' }}>
              {[...list].sort((a, b) => earnedIds.has(b.id) - earnedIds.has(a.id)).map((b, i) => {
                const earned = earnedIds.has(b.id)
                const isNew = fresh.has(b.id)
                return (
                  <div key={b.id} title={b.desc} style={isNew ? { animationDelay: `${150 + i * 80}ms` } : undefined}
                    className={`relative rounded-xl p-2.5 text-center border ${isNew ? 'pop-in ' : ''}${earned ? 'border-neon-stroke/30 bg-neon-tint' : 'border-line border-dashed'}`}>
                    {isNew && <span className="absolute -top-1.5 right-1.5 text-2xs font-bold text-on-neon bg-neon rounded-full px-1.5">New</span>}
                    <Icon icon={earned ? b.icon : 'mdi:lock-outline'} width={26} className={`mx-auto ${earned ? 'text-neon-ink' : 'text-muted'}`} />
                    <div className={`text-xs font-semibold mt-1 leading-tight ${earned ? 'text-ink' : 'text-ink-2'}`}>{b.name}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
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

// Weigh-in form on the Body tab.
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
// Page
// ─────────────────────────────────────────────────────────────────────────────
// Overview (streak, badges) and Body (weight, measurements, photos). Opened from the You sheet.
const TABS = [['overview', 'Overview'], ['body', 'Body']]

export default function Progress({ profile, onProfileChange }) {
  const [tab, setTab] = useState('overview')
  const [history, setHistory] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [checkinWeights, setCheckinWeights] = useState([])
  const [photos, setPhotos] = useState([])
  const [badges, setBadges] = useState([])
  const [fresh, setFresh] = useState(() => new Set()) // earned on this visit
  const [loading, setLoading] = useState(true)

  async function load() {
    const [h, m, cw, p, earnedRows, cardio] = await Promise.all([
      fetchWorkoutHistory().catch(() => []),
      fetchMeasurements().catch(() => []),
      fetchCheckinWeights().catch(() => []),
      fetchProgressPhotos().catch(() => []),
      fetchBadges().catch(() => []),
      fetchCardio(1000).catch(() => []),
    ])
    const swims = (cardio ?? []).filter(l => l.kind === 'swim')
    setHistory(h); setMeasurements(m); setCheckinWeights(cw); setPhotos(p)
    syncProfileWeight(m)

    // Award anything newly earned
    let b = earnedRows
    const have = new Set(b.map(x => x.badge_id))
    const weighIns = new Set([...m.filter(x => x.weight_lb != null).map(x => x.date), ...cw.map(x => x.date)]).size
    const fresh = [...computeEarnedBadges({ history: h, weighIns, photos: p.length, swims })].filter(id => !have.has(id))
    if (fresh.length) {
      setFresh(new Set(fresh))
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
    <div className="space-y-4">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Progress sections" />
      {loading ? (
        <div role="status" aria-label="Loading your progress" className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <SkeletonRows rows={2} label="Loading your progress" />
        </div>
      ) : tab === 'overview' ? (
        <Overview history={history} badges={badges} fresh={fresh} />
      ) : (
        <>
          <Body measurements={measurements} checkinWeights={checkinWeights} onSaved={load} latestDate={latestDate} onProfileChange={onProfileChange} />
          {photos.length > 0 && <Photos photos={photos} onChanged={load} />}
        </>
      )}
    </div>
  )
}
