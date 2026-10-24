import { useState, useRef, useEffect } from 'react'
import { saveUserProfile } from '../lib/api.js'

const FT_OPTS  = [4, 5, 6, 7]
const IN_OPTS  = Array.from({ length: 12 }, (_, i) => i)
const CM_OPTS  = Array.from({ length: 81 },  (_, i) => i + 140)
const LB_OPTS  = Array.from({ length: 321 }, (_, i) => i + 80)
const KG_OPTS  = Array.from({ length: 161 }, (_, i) => i + 40)
const AGE_OPTS = Array.from({ length: 68 },  (_, i) => i + 13)

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
            <span className={`text-lg font-semibold transition-colors duration-100 ${item === value ? 'text-white' : 'text-gray-400'}`}>
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
// Step 1 — Sex
// ─────────────────────────────────────────────────────────────────────────────
function SexStep({ sex, setSex, onNext, isEditing }) {
  const opts = [
    { id: 'male',   label: 'Male',              sub: 'Biological male'         },
    { id: 'female', label: 'Female',            sub: 'Biological female'       },
    { id: 'other',  label: 'Prefer not to say', sub: 'Skip this question'      },
  ]
  return (
    <div className="space-y-5">
      <div>
        <div className="font-bold text-3xl text-white leading-tight">
          {isEditing ? 'Update your\nprofile' : 'Tell us about\nyourself'}
        </div>
        <div className="text-sm text-gray-400 mt-1">Step 1 of 4 · Biological sex</div>
      </div>

      <div className="space-y-2.5">
        {opts.map(o => (
          <button key={o.id} onClick={() => setSex(o.id)}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left ${
              sex === o.id
                ? 'bg-neon/10 border-neon/50'
                : 'bg-[#1a1a1a] border-[#262626] hover:border-[#333]'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              sex === o.id ? 'border-neon bg-neon' : 'border-[#444]'
            }`}>
              {sex === o.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm ${sex === o.id ? 'text-white' : 'text-gray-300'}`}>{o.label}</div>
              <div className="text-xs text-gray-400">{o.sub}</div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={onNext} disabled={!sex}
        className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm disabled:opacity-25 transition-all">
        Continue →
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Age
// ─────────────────────────────────────────────────────────────────────────────
function AgeStep({ age, setAge, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3 block">← Back</button>
        <div className="font-bold text-3xl text-white">Your age</div>
        <div className="text-sm text-gray-400 mt-1">Step 2 of 4 · Needed for calorie calculation</div>
      </div>

      <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
        <ScrollPicker key="age" items={AGE_OPTS} value={age} onChange={setAge} fmt={v => `${v} yrs`} />
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon">{age} years old</div>
      </div>

      <button onClick={onNext}
        className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm transition-all">
        Continue →
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Height
// ─────────────────────────────────────────────────────────────────────────────
function HeightStep({ unit, setUnit, ft, setFt, inches, setInches, cm, setCm, onNext, onBack }) {
  const display = unit === 'ft' ? `${ft}' ${inches}"` : `${cm} cm`

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3 block">← Back</button>
        <div className="font-bold text-3xl text-white">Your height</div>
        <div className="text-sm text-gray-400 mt-1">Step 3 of 4</div>
      </div>

      <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl">
        {[['ft', 'ft / in'], ['cm', 'cm']].map(([u, label]) => (
          <button key={u} onClick={() => setUnit(u)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              unit === u ? 'bg-neon text-black' : 'text-gray-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
        {unit === 'ft' ? (
          <div className="flex">
            <ScrollPicker key="ft" items={FT_OPTS} value={ft} onChange={setFt} fmt={v => `${v} ft`} />
            <div className="w-px bg-[#262626]" />
            <ScrollPicker key="in" items={IN_OPTS} value={inches} onChange={setInches} fmt={v => `${v} in`} />
          </div>
        ) : (
          <ScrollPicker key="cm" items={CM_OPTS} value={cm} onChange={setCm} fmt={v => `${v} cm`} />
        )}
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon">{display}</div>
      </div>

      <button onClick={onNext}
        className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm transition-all">
        Continue →
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Weight
// ─────────────────────────────────────────────────────────────────────────────
function WeightStep({ unit, setUnit, lb, setLb, kg, setKg, onComplete, saving, onBack }) {
  const display = unit === 'lb' ? `${lb} lb` : `${kg} kg`

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3 block">← Back</button>
        <div className="font-bold text-3xl text-white">Your weight</div>
        <div className="text-sm text-gray-400 mt-1">Step 4 of 4 · Almost done!</div>
      </div>

      <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl">
        {['lb', 'kg'].map(u => (
          <button key={u} onClick={() => setUnit(u)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              unit === u ? 'bg-neon text-black' : 'text-gray-400'
            }`}>
            {u}
          </button>
        ))}
      </div>

      <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
        {unit === 'lb' ? (
          <ScrollPicker key="lb" items={LB_OPTS} value={lb} onChange={setLb} fmt={v => `${v} lb`} />
        ) : (
          <ScrollPicker key="kg" items={KG_OPTS} value={kg} onChange={setKg} fmt={v => `${v} kg`} />
        )}
      </div>

      <div className="text-center -mt-1">
        <div className="font-bold text-2xl text-neon">{display}</div>
      </div>

      <button onClick={onComplete} disabled={saving}
        className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-all">
        {saving ? 'Saving...' : 'Complete setup →'}
      </button>
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

export default function Onboarding({ onComplete, initialValues = null }) {
  const iv = initialValues
  const ih = initHeight(iv)

  const [step, setStep]         = useState(0)
  const [animKey, setAnimKey]   = useState(0)
  const [animClass, setAnimClass] = useState('slide-from-right')

  const [sex, setSex]             = useState(iv?.sex ?? null)
  const [age, setAge]             = useState(iv?.age ?? 25)
  const [heightUnit, setHeightUnit] = useState('ft')
  const [ft, setFt]               = useState(ih.ft)
  const [inches, setInches]       = useState(ih.inches)
  const [cm, setCm]               = useState(ih.cm)
  const [weightUnit, setWeightUnit] = useState('lb')
  const [lb, setLb]               = useState(iv?.weight_lb ?? 170)
  const [kg, setKg]               = useState(iv?.weight_lb ? Math.round(iv.weight_lb / 2.20462) : 77)
  const [saving, setSaving]       = useState(false)

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
      const weight_lb = weightUnit === 'lb'  ? lb : Math.round(kg * 2.20462)
      await saveUserProfile({ sex, age, height_cm, weight_lb })
      onComplete()
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  const steps = [
    <SexStep sex={sex} setSex={setSex} onNext={goNext} isEditing={!!initialValues} />,
    <AgeStep age={age} setAge={setAge} onNext={goNext} onBack={goBack} />,
    <HeightStep unit={heightUnit} setUnit={setHeightUnit}
      ft={ft} setFt={setFt} inches={inches} setInches={setInches}
      cm={cm} setCm={setCm} onNext={goNext} onBack={goBack} />,
    <WeightStep unit={weightUnit} setUnit={setWeightUnit}
      lb={lb} setLb={setLb} kg={kg} setKg={setKg}
      onComplete={handleComplete} saving={saving} onBack={goBack} />,
  ]

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="fixed w-[500px] h-[500px] rounded-full bg-neon opacity-[0.06] blur-[120px] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[400px] h-[400px] rounded-full bg-blue-500 opacity-[0.06] blur-[100px] -bottom-20 -left-20 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,241,53,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,241,53,0.03) 1px,transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8 slide-up">
          <div className="font-bold text-3xl tracking-tight text-white">Athrion</div>
          <div className="text-xs text-gray-400 mt-1">
            {initialValues ? 'Update stats' : 'Profile setup'}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 justify-center mb-8">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`h-1 rounded-full transition-all duration-500 ${
              i === step ? 'w-8 bg-neon' : i < step ? 'w-4 bg-neon/40' : 'w-4 bg-[#2a2a2a]'
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
