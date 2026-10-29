import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, InfoButton, Fact } from './ui/index.js'
import { buildDay, amountText } from '../lib/mealPlan.js'
import { DIET_OPTS } from '../lib/nutrition.js'

const KEY = 'athrion_meal_picks'
const readPicks = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const ICON = { breakfast: 'mdi:weather-sunset-up', lunch: 'mdi:white-balance-sunny', dinner: 'mdi:weather-night', snack: 'mdi:food-apple-outline' }

// A suggested day that fits the person's targets. Swap a meal for another option, or log it.
// onLog(mealId, foods): foods in the Food log's shape
export default function MealPlan({ calories, protein, diet = [], onLog, loggedMeals = [] }) {
  const [picks, setPicks] = useState(readPicks)
  const [logged, setLogged] = useState({})
  const day = buildDay({ calories, protein, diet, picks })
  const short = day.totals.protein < protein * 0.85

  function swap(meal) {
    const next = { ...picks, [meal]: (picks[meal] ?? 0) + 1 }
    setPicks(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    setLogged(l => ({ ...l, [meal]: false }))
  }
  function log(m) {
    onLog(m.meal, m.items.map(i => ({ name: `${i.name}, ${amountText(i)}`, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, meal: m.meal })))
    setLogged(l => ({ ...l, [m.meal]: true }))
  }
  const dietLabels = DIET_OPTS.filter(o => diet.includes(o.id)).map(o => o.label.split(' (')[0])

  return (
    <div className="space-y-3">
      <Card hero>
        <SectionTitle action={<InfoButton title="Your meal plan">
          <div className="space-y-2 text-sm text-ink-2">
            <p>Built from everyday foods and sized in grams to your daily targets: {calories.toLocaleString()} kcal and {protein} g protein, split across the day.</p>
            <p>Swap any meal for another option, or log it to today in one tap. Weigh foods raw unless it says cooked.</p>
            <p>A starting point, not medical advice. With a health condition or allergies, check with a doctor or dietitian.</p>
          </div>
        </InfoButton>}>Today's meal plan</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          <Fact icon="mdi:fire">{day.totals.kcal.toLocaleString()} of {calories.toLocaleString()} kcal</Fact>
          <Fact icon="mdi:food-steak">{day.totals.protein} of {protein} g protein</Fact>
          {dietLabels.map(l => <Fact key={l} icon="mdi:leaf">{l}</Fact>)}
        </div>
        {short && <p className="text-xs text-muted mt-2">Plant foods bring carbs with their protein, so this day runs a little short on protein. A soy or pea protein shake closes the gap.</p>}
      </Card>

      {day.meals.map(m => (
        <Card key={m.meal} className="space-y-3">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <Icon icon={ICON[m.meal]} width={22} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="grow basis-0 min-w-[8rem]">
              <div className="text-xs font-semibold text-muted">{m.label}</div>
              <div className="text-base font-bold text-ink leading-tight break-words">{m.title}</div>
            </div>
            <div className="text-right ml-auto">
              <div className="text-sm font-bold text-neon-ink tabular-nums">{m.totals.kcal} kcal</div>
              <div className="text-xs text-muted tabular-nums">{m.totals.protein} g protein</div>
            </div>
          </div>
          <ul className="space-y-1">
            {m.items.map(i => (
              <li key={i.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="text-ink-2">{i.name}</span>
                <span className="text-ink font-semibold tabular-nums">{amountText(i)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7rem), 1fr))' }}>
            {m.options > 1 && <Button size="sm" variant="secondary" icon="mdi:swap-horizontal" onClick={() => swap(m.meal)}>Swap</Button>}
            <Button size="sm" variant={logged[m.meal] || loggedMeals.includes(m.meal) ? 'secondary' : 'primary'} icon={logged[m.meal] ? 'mdi:check' : 'mdi:plus'}
              onClick={() => log(m)} disabled={logged[m.meal]}>
              {logged[m.meal] ? 'Logged' : 'Log this meal'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
