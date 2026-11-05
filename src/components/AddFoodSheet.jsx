import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Sheet, Segmented, Chip, Tag } from './ui/index.js'
import { FOOD_GROUPS, portion, searchFoods, recentFoods, rememberFood } from '../lib/foodLibrary.js'

const INPUT = 'bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors'
const EMPTY = { name: '', kcal: '', protein: '', carbs: '', fat: '' }
const MODES = [['library', 'Food library'], ['own', 'Enter yourself']]

function Macros({ e }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag tone="info">P {e.protein}g</Tag>
      <Tag tone="warn">C {e.carbs}g</Tag>
      <Tag tone="rose">F {e.fat}g</Tag>
    </div>
  )
}

// How much of one library food: an amount in servings or grams, counted straight into
// calories and macros (lib/foodLibrary.js), no AI
function Amount({ food, mealLabel, onAdd, onBack }) {
  // Grams (or ml) first, starting at 100; servings like "1 cup" are in the unit list
  const [unit, setUnit] = useState('g')
  const [amount, setAmount] = useState('100')
  const { grams, entry } = portion(food, amount, unit)
  const g = food.ml ? 'ml' : 'g'

  function changeUnit(v) {
    const next = v === 'g' ? 'g' : Number(v)
    // Keep the same amount of food when switching between servings and grams
    setAmount(next === 'g' ? String(Math.round(grams) || 100) : '1')
    setUnit(next)
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="press inline-flex items-center gap-1 min-h-[36px] text-sm font-semibold text-ink-2 hover:text-ink">
        <Icon icon="mdi:chevron-left" width={20} aria-hidden="true" />All foods
      </button>
      <div>
        <div className="text-lg leading-[1.3] font-semibold text-ink break-words">{food.name}</div>
        <div className="text-xs text-muted tabular-nums">Per 100 {g}: {food.kcal} kcal · P {food.p}g · C {food.c}g · F {food.f}g</div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7rem), 1fr))' }}>
        <label className="block">
          <span className="text-xs text-muted block mb-1">Amount</span>
          <input type="number" inputMode="decimal" min="0" step={unit === 'g' ? 5 : 0.5} value={amount}
            onChange={e => setAmount(e.target.value)} aria-label="Amount" className={`${INPUT} w-full text-lg font-bold tabular-nums`} />
        </label>
        <label className="block">
          <span className="text-xs text-muted block mb-1">Unit</span>
          <select value={unit} onChange={e => changeUnit(e.target.value)} aria-label="Unit" className={`${INPUT} w-full h-[46px]`}>
            <option value="g">{food.ml ? 'Millilitres' : 'Grams'}</option>
            {food.servings.map(([label, gr], i) => <option key={label} value={i}>{label} ({gr} {g})</option>)}
          </select>
        </label>
      </div>

      <div className="bg-raised rounded-2xl p-4" aria-live="polite">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-[2rem] leading-none text-neon-ink tabular-nums">{entry.kcal}</span>
          <span className="text-sm font-semibold text-muted">kcal</span>
          {unit !== 'g' && <span className="ml-auto text-xs text-muted tabular-nums">{Math.round(grams)} {g}</span>}
        </div>
        <div className="mt-2"><Macros e={entry} /></div>
      </div>

      <Button full icon="mdi:plus" disabled={!(grams > 0)} onClick={() => { rememberFood(food.id); onAdd(entry) }}>
        Add to {mealLabel}
      </Button>
    </div>
  )
}

function Library({ mealLabel, onAdd }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')
  const [picked, setPicked] = useState(null)
  const [recent] = useState(recentFoods)

  if (picked) return <Amount food={picked} mealLabel={mealLabel} onAdd={onAdd} onBack={() => setPicked(null)} />

  const list = searchFoods(query, group)
  const showRecent = !query.trim() && group === 'All' && recent.length > 0
  const row = x => (
    <li key={x.id}>
      <button type="button" onClick={() => setPicked(x)}
        className="press w-full flex items-center gap-3 bg-raised rounded-xl px-3 py-2.5 text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink break-words">{x.name}</span>
          <span className="block text-xs text-muted tabular-nums">
            {x.kcal} kcal per 100 {x.ml ? 'ml' : 'g'}
          </span>
        </span>
        <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />
      </button>
    </li>
  )

  return (
    <div className="space-y-3">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search foods, like rice or banana" aria-label="Search foods"
        className={`${INPUT} w-full`} />
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {['All', ...FOOD_GROUPS].map(x => <Chip key={x} selected={group === x} onClick={() => setGroup(x)}>{x}</Chip>)}
      </div>
      {showRecent && (
        <div>
          <div className="text-xs font-semibold text-muted mb-1.5">Recent</div>
          <ul className="space-y-1.5">{recent.map(row)}</ul>
        </div>
      )}
      <div>
        {showRecent && <div className="text-xs font-semibold text-muted mb-1.5">All foods</div>}
        {list.length > 0
          ? <ul className="space-y-1.5" aria-label="Foods">{list.map(row)}</ul>
          : <p className="text-sm text-muted text-center py-4">Not in the library. Use Enter yourself, or scan the barcode.</p>}
      </div>
    </div>
  )
}

function OwnFood({ mealLabel, onAdd }) {
  const [form, setForm] = useState(EMPTY)
  const add = () => {
    if (!form.name.trim()) return
    onAdd({ name: form.name.trim(), kcal: +form.kcal || 0, protein: +form.protein || 0, carbs: +form.carbs || 0, fat: +form.fat || 0 })
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[['name', 'Food name', 'text'], ['kcal', 'Calories', 'number'], ['protein', 'Protein (g)', 'number'], ['carbs', 'Carbs (g)', 'number'], ['fat', 'Fat (g)', 'number']].map(([k, ph, t]) => (
          <input key={k} type={t} inputMode={t === 'number' ? 'decimal' : undefined} placeholder={ph} aria-label={ph} value={form[k]}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
            className={`${INPUT} min-w-0 ${k === 'name' ? 'col-span-2' : ''}`} />
        ))}
      </div>
      <Button full icon="mdi:plus" onClick={add} disabled={!form.name.trim()}>Add to {mealLabel}</Button>
    </div>
  )
}

// Add to a meal: pick from the food library and set how much, or type it in
export default function AddFoodSheet({ meal, onAdd, onClose }) {
  const [mode, setMode] = useState('library')
  const label = meal.label.toLowerCase()
  return (
    <Sheet title={`Add to ${label}`} onClose={onClose}>
      <Segmented options={MODES} value={mode} onChange={setMode} label="How to add" />
      {mode === 'library' ? <Library mealLabel={label} onAdd={onAdd} /> : <OwnFood mealLabel={label} onAdd={onAdd} />}
    </Sheet>
  )
}
