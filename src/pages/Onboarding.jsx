import { useState, useRef, useEffect, cloneElement } from 'react'
import { Icon } from '@iconify/react'
import { Button, BackLink, Segmented } from '../components/ui/index.js'
import { saveUserProfile } from '../lib/api.js'
import { toLb } from '../lib/units.js'
import { fetchMySocial, saveNickname, nicknameFree, suggestNickname } from '../lib/socialApi.js'
import { NICKNAME_RE, NICKNAME_HINT, cleanNickname } from '../lib/points.js'
import Brand from '../components/Brand.jsx'

const FT_OPTS  = [4, 5, 6, 7]
const IN_OPTS  = Array.from({ length: 12 }, (_, i) => i)
const CM_OPTS  = Array.from({ length: 81 },  (_, i) => i + 140)
const LB_OPTS  = Array.from({ length: 321 }, (_, i) => i + 80)
const KG_OPTS  = Array.from({ length: 161 }, (_, i) => i + 40)
// ATHRION is for people 16 and over (Terms of use)
const AGE_OPTS = Array.from({ length: 65 },  (_, i) => i + 16)

const ITEM_H = 44
const PAD    = 88  // (220 / 2) - (44 / 2)

// ─────────────────────────────────────────────────────────────────────────────
// Scroll Drum Picker
// ─────────────────────────────────────────────────────────────────────────────
function ScrollPicker({ items, value, onChange, fmt = v => String(v) }) {
  const ref   = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = items.indexOf(value)
    if (idx >= 0) el.scrollTop = idx * ITEM_H
  }, []) // intentionally mount-only; re-mounts when unit changes

  function onScroll() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const idx = Math.round(el.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      onChange(items[clamped])
    }, 80)
  }

  return (
    <div className="relative flex-1 overflow-hidden" style={{ height: 220 }}>
      {/* top fade */}
      <div className="absolute inset-x-0 top-0 h-[88px] pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, #161616 20%, transparent)' }} />
      {/* bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-[88px] pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, #161616 20%, transparent)' }} />
      {/* selection band */}
      <div className="absolute inset-x-3 pointer-events-none z-10 rounded-xl"
        style={{ top: PAD, height: ITEM_H, background: 'rgba(200,241,53,0.08)', border: '1px solid rgba(200,241,53,0.25)' }} />

      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-scroll"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ height: PAD }} />
        {items.map((item, i) => (
          <div key={i} style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className="flex items-center justify-center select-none">
            <span className={`text-lg font-semibold transition-colors duration-100 ${item === value ? 'text-ink' : 'text-muted'}`}>
              {fmt(item)}
            </span>
          </div>
        ))}
        <div style={{ height: PAD }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// First step for a new account — Nickname, so they're on the leaderboard from day one
// ─────────────────────────────────────────────────────────────────────────────
function NicknameStep({ name, onDone, n }) {
  const [value, setValue] = useState(() => suggestNickname(name))
  const [free, setFree]   = useState(null) // null = not checked yet
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const nick = cleanNickname(value)
  const valid = NICKNAME_RE.test(nick)

  useEffect(() => {
    setFree(null)
    if (!valid) return
    let alive = true
    const t = setTimeout(() => nicknameFree(nick).then(f => alive && setFree(f)).catch(() => {}), 300)
    return () => { alive = false; clearTimeout(t) }
  }, [nick, valid])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await saveNickname(nick)
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save the nickname')
      setBusy(false)
    }
  }

  const status = !nick ? NICKNAME_HINT
    : !valid ? `Use ${NICKNAME_HINT}`
    : free === false ? 'That nickname is taken'
    : free ? 'Available'
    : 'Checking…'
  const bad = (nick && !valid) || free === false

  return (
    <form className="space-y-5" onSubmit={save}>
      <div>
        <div className="font-bold text-3xl text-ink leading-tight">Pick a nickname</div>
        <div className="text-sm text-muted mt-1">{n} · How friends find you</div>
      </div>

      <div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted" aria-hidden="true">@</span>
          <input aria-label="Nickname" placeholder="nickname" value={value} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21}
            onChange={e => { setValue(e.target.value); setError('') }}
            className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl pl-10 pr-4 py-3 text-xl font-bold outline-none transition-colors" />
        </div>
        <div role="status" className={`flex items-center gap-1.5 text-xs mt-2 ${error || bad ? 'text-danger' : free ? 'text-neon-ink' : 'text-muted'}`}>
          {free && valid && !error && <Icon icon="mdi:check-circle-outline" width={16} aria-hidden="true" />}
          {error || status}
        </div>
      </div>

      <div className="flex gap-3 bg-raised border border-line rounded-2xl p-4">
        <Icon icon="mdi:trophy-outline" width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
        <p className="text-sm text-ink-2">You'll be on this month's leaderboard right away. Every workout earns points, and the top 3 win a free month of Pro. Only your nickname and points are shown.</p>
      </div>

      <Button full type="submit" disabled={!valid || free === false || busy} iconRight={busy ? undefined : 'mdi:arrow-right'}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Sex
// ─────────────────────────────────────────────────────────────────────────────
function SexStep({ sex, setSex, onNext, onBack, isEditing, n }) {
  const opts = [
    { id: 'male',   label: 'Male',              sub: 'Biological male'         },
    { id: 'female', label: 'Female',            sub: 'Biological female'       },
    { id: 'other',  label: 'Prefer not to say', sub: 'Skip this question'      },
  ]
  return (
    <div className="space-y-5">
      <div>
        {onBack && <BackLink onClick={onBack} className="mb-3" />}
        <div className="font-bold text-3xl text-ink leading-tight">
          {isEditing ? 'Update your\nprofile' : 'Tell us about\nyourself'}
        </div>
        <div className="text-sm text-muted mt-1">{n} · Biological sex</div>
      </div>

      <div className="space-y-2.5">
        {opts.map(o => (
          <button key={o.id} onClick={() => setSex(o.id)}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left ${
              sex === o.id
                ? 'bg-neon/10 border-neon-stroke/50'
                : 'bg-raised border-line hover:border-line-strong'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              sex === o.id ? 'border-neon-stroke bg-neon' : 'border-line-strong'
            }`}>
              {sex === o.id && <div className="w-1.5 h-1.5 rounded-full bg-on-neon" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm ${sex === o.id ? 'text-ink' : 'text-ink-2'}`}>{o.label}</div>
              <div className="text-xs text-muted">{o.sub}</div>
            </div>
          </button>
        ))}
      </div>

      <Button full onClick={onNext} disabled={!sex} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Age
// ─────────────────────────────────────────────────────────────────────────────
function AgeStep({ age, setAge, onNext, onBack, n }) {
  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Your age</div>
        <div className="text-sm text-muted mt-1">{n} · Needed for calorie calculation</div>
      </div>

      <div className="bg-raised border border-line rounded-2xl overflow-hidden">
        <ScrollPicker key="age" items={AGE_OPTS} value={age} onChange={setAge} fmt={v => `${v} yrs`} />
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon-ink">{age} years old</div>
      </div>

      <Button full onClick={onNext} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Height
// ─────────────────────────────────────────────────────────────────────────────
function HeightStep({ unit, setUnit, ft, setFt, inches, setInches, cm, setCm, onNext, onBack, n }) {
  const display = unit === 'ft' ? `${ft}' ${inches}"` : `${cm} cm`

  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Your height</div>
        <div className="text-sm text-muted mt-1">{n}</div>
      </div>

      <Segmented options={[['ft', 'ft / in'], ['cm', 'cm']]} value={unit} onChange={setUnit} label="Height unit" kind="choice" />

      <div className="bg-raised border border-line rounded-2xl overflow-hidden">
        {unit === 'ft' ? (
          <div className="flex">
            <ScrollPicker key="ft" items={FT_OPTS} value={ft} onChange={setFt} fmt={v => `${v} ft`} />
            <div className="w-px bg-line" />
            <ScrollPicker key="in" items={IN_OPTS} value={inches} onChange={setInches} fmt={v => `${v} in`} />
          </div>
        ) : (
          <ScrollPicker key="cm" items={CM_OPTS} value={cm} onChange={setCm} fmt={v => `${v} cm`} />
        )}
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon-ink">{display}</div>
      </div>

      <Button full onClick={onNext} iconRight="mdi:arrow-right">Continue</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Weight
// ─────────────────────────────────────────────────────────────────────────────
function WeightStep({ unit, setUnit, lb, setLb, kg, setKg, onComplete, saving, onBack, n }) {
  const display = unit === 'lb' ? `${lb} lb` : `${kg} kg`

  return (
    <div className="space-y-5">
      <div>
        <BackLink onClick={onBack} className="mb-3" />
        <div className="font-bold text-3xl text-ink">Your weight</div>
        <div className="text-sm text-muted mt-1">{n} · Almost done</div>
      </div>

      <Segmented options={[['lb', 'lb'], ['kg', 'kg']]} value={unit} onChange={setUnit} label="Weight unit" kind="choice" />

      <div className="bg-raised border border-line rounded-2xl overflow-hidden">
        {unit === 'lb' ? (
          <ScrollPicker key="lb" items={LB_OPTS} value={lb} onChange={setLb} fmt={v => `${v} lb`} />
        ) : (
          <ScrollPicker key="kg" items={KG_OPTS} value={kg} onChange={setKg} fmt={v => `${v} kg`} />
        )}
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon-ink">{display}</div>
      </div>

      <Button full onClick={onComplete} disabled={saving} iconRight={saving ? undefined : 'mdi:arrow-right'}>
        {saving ? 'Saving...' : 'Complete setup'}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Onboarding
// ─────────────────────────────────────────────────────────────────────────────
function initHeight(iv) {
  if (!iv?.height_cm) return { ft: 5, inches: 10, cm: 178 }
  const totalIn = Math.round(iv.height_cm / 2.54)
  return { ft: Math.floor(totalIn / 12), inches: totalIn % 12, cm: iv.height_cm }
}

// name: the account's name, for a nickname suggestion. A new account picks a nickname first.
export default function Onboarding({ onComplete, initialValues = null, name = '' }) {
  const iv = initialValues
  const ih = initHeight(iv)

  const [step, setStep]         = useState(0)
  const [animKey, setAnimKey]   = useState(0)
  const [animClass, setAnimClass] = useState('slide-from-right')

  const [sex, setSex]             = useState(iv?.sex ?? null)
  const [age, setAge]             = useState(iv?.age ?? 25)
  const [heightUnit, setHeightUnit] = useState(iv?.weight_unit === 'kg' ? 'cm' : 'ft')
  const [ft, setFt]               = useState(ih.ft)
  const [inches, setInches]       = useState(ih.inches)
  const [cm, setCm]               = useState(ih.cm)
  const [weightUnit, setWeightUnit] = useState(iv?.weight_unit ?? 'lb')
  const [lb, setLb]               = useState(iv?.weight_lb ?? 170)
  const [kg, setKg]               = useState(iv?.weight_lb ? Math.round(iv.weight_lb / 2.20462) : 77)
  const [saving, setSaving]       = useState(false)
  // New accounts start with a nickname, unless they already have one (set up before, then left)
  const [askNick, setAskNick]     = useState(!iv)
  useEffect(() => {
    if (!iv) fetchMySocial().then(me => { if (me?.nickname) setAskNick(false) }).catch(() => {})
  }, [])

  function goNext() {
    setAnimClass('slide-from-right')
    setAnimKey(k => k + 1)
    setStep(s => s + 1)
  }
  function goBack() {
    setAnimClass('slide-from-left')
    setAnimKey(k => k + 1)
    setStep(s => s - 1)
  }

  async function handleComplete() {
    setSaving(true)
    try {
      const height_cm = heightUnit === 'ft' ? Math.round((ft * 12 + inches) * 2.54) : cm
      const weight_lb = weightUnit === 'lb'  ? lb : toLb(kg, 'kg') // kept to 0.01 lb so kg reads back exactly
      await saveUserProfile({ sex, age, height_cm, weight_lb, weight_unit: weightUnit })
      onComplete()
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  const back = askNick ? goBack : undefined
  const stats = [
    <SexStep sex={sex} setSex={setSex} onNext={goNext} onBack={back} isEditing={!!initialValues} />,
    <AgeStep age={age} setAge={setAge} onNext={goNext} onBack={goBack} />,
    <HeightStep unit={heightUnit} setUnit={setHeightUnit}
      ft={ft} setFt={setFt} inches={inches} setInches={setInches}
      cm={cm} setCm={setCm} onNext={goNext} onBack={goBack} />,
    <WeightStep unit={weightUnit} setUnit={setWeightUnit}
      lb={lb} setLb={setLb} kg={kg} setKg={setKg}
      onComplete={handleComplete} saving={saving} onBack={goBack} />,
  ]
  const all = askNick ? [<NicknameStep name={name} onDone={goNext} />, ...stats] : stats
  const steps = all.map((el, i) => cloneElement(el, { n: `Step ${i + 1} of ${all.length}` }))

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 pt-safe pb-safe relative overflow-hidden">

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8 slide-up">
          <Brand size="text-3xl" />
          <div className="text-xs text-muted mt-1">
            {initialValues ? 'Update stats' : 'Profile setup'}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 justify-center mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all duration-500 ${
              i === step ? 'w-8 bg-neon' : i < step ? 'w-4 bg-neon/40' : 'w-4 bg-line-strong'
            }`} />
          ))}
        </div>

        {/* Animated step */}
        <div key={animKey} className={animClass}>
          {steps[step]}
        </div>
      </div>
    </div>
  )
}
