import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, InfoButton, Fact, Chip, Segmented, SkeletonRows, InlineError } from './ui/index.js'
import Sheet from './Sheet.jsx'
import { fetchMealPlan, generateMealPlan } from '../lib/mealPlanApi.js'
import { DIET_OPTS } from '../lib/nutrition.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TODAY = DAYS[(new Date().getDay() + 6) % 7]
const ICON = { breakfast: 'mdi:weather-sunset-up', lunch: 'mdi:white-balance-sunny', dinner: 'mdi:weather-night', snack: 'mdi:food-apple-outline' }
const LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
const COOK = [['quick', 'Under 15 min'], ['normal', 'Under 30 min'], ['any', 'Any, I batch cook']]
const inputCls = 'w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40'

// Pro: a week of meals Claude writes for the person's targets, diet and tastes, with a shopping list.
// targets: { calories, protein, carbs, fat }; onLog(meal, foods) adds to today's Food log
export default function AiMealPlan({ targets, diet, onDietChange, onLog }) {
  const [row, setRow] = useState(undefined) // undefined loading, null none
  const [form, setForm] = useState(null) // the preferences sheet, or null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [day, setDay] = useState(TODAY)
  const [groceries, setGroceries] = useState(false)
  const [logged, setLogged] = useState({})
  const [open, setOpen] = useState(null)

  useEffect(() => { fetchMealPlan().then(setRow).catch(() => setRow(null)) }, [])

  async function build(prefs) {
    setBusy(true); setErr(''); setForm(null)
    try {
      setRow(await generateMealPlan({ ...targets, diet, ...prefs }))
      setLogged({})
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const startForm = () => setForm({ likes: row?.prefs?.likes ?? '', dislikes: row?.prefs?.dislikes ?? '', cookTime: row?.prefs?.cookTime ?? 'normal' })

  if (row === undefined) return <SkeletonRows rows={4} label="Loading your meal plan" />

  const plan = row?.plan
  const today = plan?.days.find(d => d.day === day)
  // Targets changed since it was built (a new goal, or adaptive calories): offer a rebuild
  const stale = plan?.targets && Math.abs(plan.targets.calories - targets.calories) > 100

  return (
    <div className="space-y-3">
      {busy ? (
        <Card hero role="status" className="space-y-2 text-center py-8">
          <span className="inline-block w-6 h-6 border-2 border-neon/30 border-t-neon rounded-full animate-spin" aria-hidden="true" />
          <div className="font-bold text-lg text-ink">Writing your week of meals</div>
          <p className="text-sm text-muted">About a minute. You can leave this screen; it saves when it's done.</p>
        </Card>
      ) : !plan ? (
        <Card hero className="space-y-3">
          <div className="font-bold text-xl text-ink">Your week of meals</div>
          <p className="text-sm text-ink-2">Seven days of breakfasts, lunches, dinners and snacks written for your {targets.calories.toLocaleString()} kcal and {targets.protein} g protein, the foods you like and the time you have, with a shopping list for the week.</p>
          <Button full icon="mdi:auto-fix" onClick={startForm}>Build my meal plan</Button>
        </Card>
      ) : (
        <>
          <Card hero className="space-y-3">
            <SectionTitle action={<InfoButton title="Your AI meal plan">
              <div className="space-y-2 text-sm text-ink-2">
                <p>Written by AI for your targets, diet and tastes. The numbers are estimates from the ingredients; weigh foods raw unless it says cooked.</p>
                <p>A starting point, not medical advice. With a health condition or allergies, check with a doctor or dietitian.</p>
              </div>
            </InfoButton>}>Your meal plan</SectionTitle>
            <Segmented options={DAYS.map(d => [d, d.slice(0, 3)])} value={day} onChange={setDay} label="Day" kind="choice" scroll />
            {today && (
              <div className="flex flex-wrap gap-1.5">
                <Fact icon="mdi:fire">{today.totals.kcal.toLocaleString()} kcal</Fact>
                <Fact icon="mdi:food-steak">{today.totals.protein} g protein</Fact>
                <Fact icon="mdi:bread-slice-outline">{today.totals.carbs} g carbs</Fact>
              </div>
            )}
            {stale && <p className="text-xs text-warn">Your targets changed to {targets.calories.toLocaleString()} kcal since this was built. Rebuild it to match.</p>}
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
              <Button variant="secondary" icon="mdi:cart-outline" onClick={() => setGroceries(true)}>Shopping list</Button>
              <Button variant="secondary" icon="mdi:refresh" onClick={startForm}>Rebuild</Button>
            </div>
          </Card>

          {today?.meals.map((m, i) => {
            const key = `${day}-${i}`
            return (
              <Card key={key} className="space-y-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <Icon icon={ICON[m.meal] ?? 'mdi:silverware-fork-knife'} width={22} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="grow basis-0 min-w-[8rem]">
                    <div className="text-xs font-semibold text-muted">{LABEL[m.meal] ?? 'Meal'} · {m.minutes} min</div>
                    <div className="text-base font-bold text-ink leading-tight break-words">{m.title}</div>
                  </div>
                  <div className="text-right ml-auto">
                    <div className="text-sm font-bold text-neon-ink tabular-nums">{m.kcal} kcal</div>
                    <div className="text-xs text-muted tabular-nums">{m.protein} g protein</div>
                  </div>
                </div>
                <ul className="space-y-1">
                  {m.ingredients.map((g, n) => (
                    <li key={n} className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span className="text-ink-2">{g.name}</span><span className="text-ink font-semibold tabular-nums">{g.amount}</span>
                    </li>
                  ))}
                </ul>
                {open === key && m.steps.length > 0 && (
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-ink-2">{m.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
                )}
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7rem), 1fr))' }}>
                  {m.steps.length > 0 && (
                    <Button size="sm" variant="secondary" icon={open === key ? 'mdi:chevron-up' : 'mdi:chef-hat'} onClick={() => setOpen(open === key ? null : key)}>
                      {open === key ? 'Hide steps' : 'How to make it'}
                    </Button>
                  )}
                  <Button size="sm" variant={logged[key] ? 'secondary' : 'primary'} icon={logged[key] ? 'mdi:check' : 'mdi:plus'} disabled={logged[key]}
                    onClick={() => { onLog(m.meal, [{ name: m.title, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, meal: m.meal }]); setLogged(l => ({ ...l, [key]: true })) }}>
                    {logged[key] ? 'Logged' : 'Log this meal'}
                  </Button>
                </div>
              </Card>
            )
          })}
          {plan.tips?.length > 0 && (
            <Card>
              <SectionTitle>Tips for the week</SectionTitle>
              <ul className="space-y-1.5">{plan.tips.map((t, n) => <li key={n} className="flex gap-2.5 text-sm text-ink-2"><Icon icon="mdi:lightbulb-outline" width={18} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />{t}</li>)}</ul>
            </Card>
          )}
        </>
      )}
      {err && <InlineError>{err}</InlineError>}

      {form && (
        <Sheet title="Your meal plan" onClose={() => setForm(null)} footer={
          <Button full icon="mdi:auto-fix" onClick={() => build(form)}>{plan ? 'Rebuild my week' : 'Build my week'}</Button>
        }>
          <p className="text-sm text-ink-2">For {targets.calories.toLocaleString()} kcal and {targets.protein} g protein a day.</p>
          <div>
            <div className="text-xs text-muted mb-1.5">Diet</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Diet">
              {DIET_OPTS.map(o => (
                <Chip key={o.id} selected={diet.includes(o.id)} onClick={() => onDietChange(diet.includes(o.id) ? diet.filter(d => d !== o.id) : [...diet, o.id])}>
                  {o.id === 'fasting' ? 'I fast' : o.label}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-muted">Foods you like</span>
            <input value={form.likes} maxLength={300} onChange={e => setForm(f => ({ ...f, likes: e.target.value }))} placeholder="Chicken, rice, Greek yogurt, berries" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Foods to leave out</span>
            <input value={form.dislikes} maxLength={300} onChange={e => setForm(f => ({ ...f, dislikes: e.target.value }))} placeholder="Mushrooms, tuna, nuts (allergy)" className={`mt-1 ${inputCls}`} />
          </label>
          <div>
            <div className="text-xs text-muted mb-1.5">Time to cook</div>
            <Segmented options={COOK} value={form.cookTime} onChange={v => setForm(f => ({ ...f, cookTime: v }))} label="Time to cook" kind="choice" />
          </div>
        </Sheet>
      )}
      {groceries && plan && (
        <Sheet title="Shopping list" onClose={() => setGroceries(false)}>
          <p className="text-sm text-muted">Everything for the week.</p>
          <ul className="divide-y divide-line">
            {plan.groceries.map((g, n) => (
              <li key={n} className="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
                <span className="text-ink">{g.item}</span><span className="text-ink-2 tabular-nums">{g.amount}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  )
}
