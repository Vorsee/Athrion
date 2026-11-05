import { useState } from 'react'
import { IconButton, Button } from './ui/index.js'
import { rescale } from '../lib/mealScan.js'

const INPUT = 'bg-raised border border-line focus:border-neon-stroke text-ink rounded-lg px-2 h-10 text-sm font-semibold tabular-nums outline-none transition-colors w-full min-w-0'
const MACROS = [['kcal', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)']]

// One food the photo scan found; the pencil opens its amount (rescales everything) and its
// figures, for when the exact weight or label numbers are known
export default function ScanFoodRow({ food: f, onChange }) {
  const [open, setOpen] = useState(false)
  const grams = f.base?.unit === 'g'
  const set = (k, v) => onChange({ ...f, [k]: k === 'kcal' ? Math.round(+v || 0) : Math.max(0, +v || 0) })

  return (
    <div className="py-2 border-b border-line last:border-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="grow basis-0 min-w-[7rem]">
          <div className="font-medium text-sm text-ink break-words">{f.name}</div>
          <div className="text-xs text-muted">{f.portion}</div>
        </div>
        <div className="text-right ml-auto">
          <div className="font-bold text-sm text-neon-ink tabular-nums">{f.kcal} kcal</div>
          <div className="text-xs text-muted tabular-nums">P{f.protein} C{f.carbs} F{f.fat}</div>
        </div>
        <IconButton icon={open ? 'mdi:check' : 'mdi:pencil-outline'} label={open ? `Done editing ${f.name}` : `Edit ${f.name}`}
          onClick={() => setOpen(o => !o)} className="w-9 h-9" />
      </div>

      {open && (
        <div className="mt-2 space-y-2 fade-in">
          <label className="block">
            <span className="text-xs text-muted block mb-1">{grams ? 'Amount (g)' : 'Servings'}</span>
            <input type="number" inputMode="decimal" min="0" step={grams ? 5 : 0.5} value={f.amount}
              onChange={e => onChange(rescale(f, e.target.value))}
              aria-label={`${f.name} ${grams ? 'grams' : 'servings'}`} className={INPUT} />
          </label>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5rem), 1fr))' }}>
            {MACROS.map(([k, label]) => (
              <label key={k} className="block">
                <span className="text-xs text-muted block mb-1">{label}</span>
                <input type="number" inputMode="decimal" min="0" value={f[k]} onChange={e => set(k, e.target.value)}
                  aria-label={`${f.name} ${label}`} className={INPUT} />
              </label>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon="mdi:check" onClick={() => setOpen(false)}>Done</Button>
        </div>
      )}
    </div>
  )
}
