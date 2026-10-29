import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { todayKey } from '../lib/data.js'
import { supabase } from '../lib/supabase.js'
import { fetchTodayCalorieLog, saveTodayCalorieLog, fetchCalorieLogs, saveGoals } from '../lib/api.js'
import { resolveGoals } from '../lib/goals.js'
import { MIN_CALORIES, DIET_OPTS, chipsFrom } from '../lib/nutrition.js'
import { fetchLatestNutritionTarget, fetchFitnessProfile } from '../lib/fitnessApi.js'
import MealPlan from '../components/MealPlan.jsx'
import AdaptiveNutritionCard from '../components/AdaptiveNutritionCard.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import { tok } from '../lib/tokens.js'
import { Segmented, Sheet, Button, Card, SectionTitle, SectionLink, ListRow, Fact, IconButton } from '../components/ui/index.js'
import { useHeaderAction } from '../lib/shell.js'

const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: 'mdi:weather-sunset-up', hours: [5,  11], color: 'warn' },
  { id: 'lunch',     label: 'Lunch',     icon: 'mdi:white-balance-sunny', hours: [11, 16], color: 'info' },
  { id: 'dinner',    label: 'Dinner',    icon: 'mdi:weather-night', hours: [16, 22], color: 'lilac' },
  { id: 'snack',     label: 'Snacks',    icon: 'mdi:food-apple-outline', hours: null,     color: 'rose' },
]

function getCurrentMeal() {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 22) return 'dinner'
  return 'snack'
}

const EMPTY_FORM = { name: '', kcal: '', protein: '', carbs: '', fat: '' }

// Example day shown behind the Pro lock; never saved
// Free: manual logging, barcode scanning and goals. Pro: the AI photo scanner
// (also enforced in the analyze-meal Edge Function) and plan-based adaptive targets.
export default function Calories(props) {
  return <CaloriesPage {...props} />
}

function CaloriesPage({ profile, onGoToPlan, isPro, onUpgrade, intent, onIntentHandled }) {
  const [foods, setFoods]             = useState([])
  const [saveError, setSaveError]     = useState('')
  const saveQueue = useRef(Promise.resolve()) // one save at a time, in order
  const [logs, setLogs]               = useState([])
  const [tab, setTab]                 = useState('today')
  const [selectedLog, setSelectedLog] = useState(null)
  const [addingTo, setAddingTo]       = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [aiState, setAiState]         = useState('idle')
  const [aiResult, setAiResult]       = useState(null)
  const [aiError, setAiError]         = useState(null)
  const [aiMeal, setAiMeal]           = useState(getCurrentMeal)
  const [editingGoals, setEditingGoals] = useState(false)
  const [localGoals, setLocalGoals]   = useState(null)
  const [planNutrition, setPlanNutrition] = useState(null)
  const [scanning, setScanning]       = useState(false)
  const [diet, setDiet]               = useState([]) // from the plan questions, for the meal plan
  const fileRef = useRef()
  const [logFood, setLogFood]         = useState(false)
  useHeaderAction('mdi:plus', 'Log food', () => setLogFood(true))

  // Opened from the You sheet's Nutrition targets
  useEffect(() => {
    if (intent !== 'goals') return
    setEditingGoals(true)
    onIntentHandled?.()
  }, [intent])

  // Log food sheet: each option opens one of the existing add flows
  function logBy(kind) {
    setLogFood(false)
    if (kind === 'photo') {
      if (!isPro) return onUpgrade?.()
      if (fileRef.current) return fileRef.current.click()
      setTab('today') // the photo input lives on the Today view
      return requestAnimationFrame(() => fileRef.current?.click())
    }
    setTab('today')
    if (kind === 'barcode') return setScanning(true)
    const meal = getCurrentMeal()
    setAddingTo(meal)
    requestAnimationFrame(() => document.getElementById(`meal-${meal}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
  }

  // Pro with a plan: the plan's targets (adaptive, Pro). Everyone else: their own targets,
  // typed in or calculated from the profile. A free account that answered the plan questions
  // still has a nutrition_targets row; it mustn't lock them out of editing.
  const planTargets = isPro ? planNutrition : null
  const baseGoals = localGoals ?? resolveGoals(profile)
  const activeGoals = planTargets
    ? { calories: planTargets.calorie_target, protein: planTargets.protein_grams, carbs: planTargets.carb_grams }
    : baseGoals
  const goals = activeGoals
  const fatGoal = planTargets?.fat_grams
    ? planTargets.fat_grams
    : Math.max(30, Math.round((goals.calories - goals.protein * 4 - goals.carbs * 4) / 9))

  useEffect(() => {
    fetchTodayCalorieLog(todayKey())
      .then(log => { if (log) setFoods(log.foods || []) })
      .catch(() => {})
    fetchCalorieLogs()
      .then(l => setLogs(l || []))
      .catch(() => {})
    fetchLatestNutritionTarget()
      .then(t => { if (t) setPlanNutrition(t) })
      .catch(() => {})
    fetchFitnessProfile()
      .then(fp => setDiet(chipsFrom(fp?.limitations, DIET_OPTS)))
      .catch(() => {})
  }, [])

  function saveFoods(f) {
    setFoods(f)
    // Quick successive adds would otherwise race and lose foods or create a second log
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await saveTodayCalorieLog(todayKey(), f)
        setSaveError('')
      } catch {
        setSaveError("Couldn't save your food log. Check your connection and try again.")
      }
    })
    return saveQueue.current
  }

  function addManual(meal) {
    const { name, kcal, protein, carbs, fat } = form
    if (!name.trim()) return
    saveFoods([...foods, { name, kcal: +kcal||0, protein: +protein||0, carbs: +carbs||0, fat: +fat||0, meal }])
    setForm(EMPTY_FORM)
    setAddingTo(null)
  }

  function removeFood(idx) {
    const f = [...foods]; f.splice(idx, 1); saveFoods(f)
  }

  async function analyzeImage(file) {
    setAiState('loading'); setAiResult(null); setAiError(null)
    const base64 = await new Promise(res => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.readAsDataURL(file)
    })
    try {
      // The function checks who is calling, so send the user's own token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again.')
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-meal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ base64, mediaType: file.type || 'image/jpeg' }),
        }
      )
      const data = await resp.json()
      if (!resp.ok) { setAiError(data.error?.message || `Error ${resp.status}`); setAiState('error'); return }
      const text = data.content?.map(c => c.text || '').join('') || ''
      const result = JSON.parse(text.replace(/```json|```/g, '').trim())
      setAiResult(result); setAiState('result')
    } catch (e) {
      setAiError(e.message); setAiState('error')
    }
  }

  const totals = foods.reduce((t, f) => ({
    kcal:    t.kcal    + (f.kcal    || 0),
    protein: t.protein + (f.protein || 0),
    carbs:   t.carbs   + (f.carbs   || 0),
    fat:     t.fat     + (f.fat     || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })

  const rawPct = Math.round((totals.kcal / goals.calories) * 100)
  const pct = Math.min(100, rawPct)
  const remaining = Math.max(0, goals.calories - totals.kcal)
  const rv = 68, circ = 2 * Math.PI * rv
  const ringColor = rawPct > 100 ? tok('danger') : rawPct > 80 ? tok('warn') : tok('neon-stroke')
  const ringText = rawPct > 100 ? tok('danger') : rawPct > 80 ? tok('warn') : tok('neon-ink')

  return (
    <div className="space-y-4 py-4 slide-up">

      {saveError && (
        <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">{saveError}</div>
      )}

      {/* Ring + macros */}
      <Card hero>
        <SectionTitle action={planTargets
          ? <SectionLink icon="mdi:clipboard-text-outline" onClick={onGoToPlan}>From plan</SectionLink>
          : <SectionLink icon="mdi:pencil-outline" onClick={() => setEditingGoals(true)}>Edit targets</SectionLink>}>
          Today
        </SectionTitle>
        {/* The figures drop under the ring when there's no room beside it (narrow screen, big text) */}
        <div className="flex flex-wrap items-center justify-center gap-5">
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={rv} fill="none" className="stroke-line" strokeWidth="10"/>
              <circle cx="80" cy="80" r={rv} fill="none" strokeWidth="10"
                strokeDasharray={`${circ*pct/100} ${circ}`} strokeLinecap="round"
                style={{ stroke: ringColor, transition: 'stroke-dasharray 0.6s ease-out' }}/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-bold text-3xl leading-none tabular-nums text-ink">{totals.kcal}</div>
              <div className="text-xs font-medium text-muted">eaten</div>
            </div>
          </div>
          <div className="grow basis-0 min-w-[7rem] space-y-3">
            <div>
              <div className="font-bold text-3xl tabular-nums leading-none" style={{ color: ringText }}>{remaining}</div>
              <div className="text-xs text-muted mt-1">kcal left of <span className="font-semibold text-ink-2 tabular-nums">{goals.calories}</span></div>
            </div>
            <MacroBar label="Protein" val={totals.protein} goal={goals.protein} color="info"/>
            <MacroBar label="Carbs"   val={totals.carbs}   goal={goals.carbs}   color="warn"/>
            <MacroBar label="Fat"     val={totals.fat}      goal={fatGoal}       color="rose"/>
          </div>
        </div>
      </Card>

      {planTargets && (
        <AdaptiveNutritionCard calorieLogs={logs} current={planNutrition} profile={profile} onApplied={setPlanNutrition} />
      )}

      {/* Tab switcher */}
      <Segmented options={[['today', 'Today'], ['plan', 'Meal plan'], ['log', 'Log']]} value={tab} onChange={setTab} label="Food view" />

      {tab === 'plan' ? (
        <MealPlan calories={goals.calories} protein={goals.protein} diet={diet}
          onLog={(meal, items) => saveFoods([...foods, ...items])} />
      ) : tab === 'today' ? (
        <>
          {/* Quick add: photo and barcode */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => (isPro ? fileRef.current?.click() : onUpgrade?.())}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); isPro ? analyzeImage(e.dataTransfer.files[0]) : onUpgrade?.() }}
                className="press relative flex flex-col items-start gap-2 bg-surface border border-line hover:border-neon-stroke/40 rounded-2xl p-4 text-left transition-colors">
                <Icon icon="mdi:camera-outline" width={26} className="text-neon-ink" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink">Snap a meal</span>
                {!isPro && <span className="absolute top-3 right-3"><Fact>Pro</Fact></span>}
              </button>
              <button type="button" onClick={() => setScanning(true)}
                className="press flex flex-col items-start gap-2 bg-surface border border-line hover:border-neon-stroke/40 rounded-2xl p-4 text-left transition-colors">
                <Icon icon="mdi:barcode-scan" width={26} className="text-neon-ink" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink">Scan barcode</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files[0]) analyzeImage(e.target.files[0]) }} />
            {scanning && (
              <BarcodeScanner meals={MEALS} defaultMeal={getCurrentMeal()} onClose={() => setScanning(false)}
                onAdd={food => { saveFoods([...foods, food]); setScanning(false) }} />
            )}

            {aiState === 'loading' && (
              <div className="mt-3 flex items-center gap-3 text-muted text-sm p-3 bg-inset rounded-xl">
                <span className="w-4 h-4 border-2 border-neon-stroke/30 border-t-neon-stroke rounded-full animate-spin flex-shrink-0" aria-hidden="true" /> Looking at your photo...
              </div>
            )}
            {aiState === 'error' && (
              <div className="mt-3 p-3 bg-danger/12 border border-danger/20 rounded-xl text-sm text-danger">
                {aiError || 'Could not analyze image. Try again or add manually.'}
              </div>
            )}
            {aiState === 'result' && aiResult && (
              <div className="mt-3 p-4 bg-neon-tint border border-neon-stroke/20 rounded-xl fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-neon-ink">Found {aiResult.foods?.length} {aiResult.foods?.length === 1 ? 'item' : 'items'}</div>
                  {aiResult.confidence && <Fact>{aiResult.confidence} confidence</Fact>}
                </div>

                {/* Meal picker */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {MEALS.map(m => (
                    <button key={m.id} onClick={() => setAiMeal(m.id)}
                      className={`py-2 rounded-xl text-center text-xs font-bold transition-all border ${
                        aiMeal === m.id ? 'border-transparent' : 'border-line-strong text-muted bg-raised'
                      }`}
                      style={aiMeal === m.id ? { background: tok(m.color), color: tok('canvas') } : {}}>
                      <Icon icon={m.icon} width={20} className="mx-auto mb-0.5" style={aiMeal === m.id ? {} : { color: tok(m.color) }} />
                      {m.label}
                    </button>
                  ))}
                </div>

                {aiResult.foods?.map((f, i) => (
                  <div key={i} className="py-2 border-b border-line last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{f.name}</div>
                        <div className="text-xs text-muted">{f.portion}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-neon-ink">{f.kcal} kcal</div>
                        <div className="text-xs text-muted">P{f.protein} C{f.carbs} F{f.fat}</div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      const tagged = (aiResult.foods || []).map(f => ({ ...f, meal: aiMeal }))
                      saveFoods([...foods, ...tagged])
                      setAiState('idle')
                    }}
                    className="press flex-1 font-bold py-2.5 rounded-xl text-sm text-canvas"
                    style={{ background: tok(MEALS.find(m => m.id === aiMeal)?.color) }}>
                    Add to {MEALS.find(m => m.id === aiMeal)?.label.toLowerCase()}
                  </button>
                  <button onClick={() => setAiState('idle')}
                    className="bg-raised border border-line-strong text-muted px-4 py-2 rounded-xl text-sm">
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Meal sections */}
          {MEALS.map(meal => (
            <MealSection
              key={meal.id}
              meal={meal}
              foods={foods.filter(f => f.meal === meal.id)}
              allFoods={foods}
              isAdding={addingTo === meal.id}
              form={form}
              setForm={setForm}
              onToggleAdd={() => setAddingTo(addingTo === meal.id ? null : meal.id)}
              onAdd={() => addManual(meal.id)}
              onRemove={removeFood}
              isCurrent={getCurrentMeal() === meal.id}
            />
          ))}

          {/* Backward-compat: foods logged before meal tagging */}
          {foods.some(f => !f.meal) && (
            <div className="bg-surface border border-line rounded-2xl p-4">
              <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Other</div>
              {foods.map((f, idx) => !f.meal ? (
                <div key={idx} className="flex items-center justify-between py-2.5 border-b border-line last:border-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="flex gap-1.5 mt-0.5 flex-wrap">
                      <Tag color="info">P {f.protein}g</Tag>
                      <Tag color="warn">C {f.carbs}g</Tag>
                      <Tag color="rose">F {f.fat}g</Tag>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <div className="text-right">
                      <div className="font-bold text-sm text-neon-ink">{f.kcal}</div>
                      <div className="text-xs font-medium text-muted">kcal</div>
                    </div>
                    <button onClick={() => removeFood(idx)} aria-label={`Remove ${f.name}`}
                      className="press w-9 h-9 flex items-center justify-center bg-danger/10 text-danger border border-danger/20 rounded-md hover:bg-danger/20 transition-colors"><Icon icon="mdi:close" width={16} /></button>
                  </div>
                </div>
              ) : null)}
            </div>
          )}
        </>
      ) : (
        /* Log tab */
        <Card>
          <SectionTitle>Food log</SectionTitle>
          {logs.length === 0 ? (
            <div className="text-muted text-sm text-center py-6">No logs yet</div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, i) => {
                const isToday = log.date === todayKey()
                const displayFoods = isToday ? foods : (log.foods || [])
                const displayKcal  = isToday ? totals.kcal : (log.total_calories || 0)
                const mealCounts = MEALS.map(m => ({
                  ...m,
                  count: displayFoods.filter(f => f.meal === m.id).length,
                })).filter(m => m.count > 0)
                return (
                  <button key={log.id || i}
                    onClick={() => setSelectedLog({ ...log, foods: displayFoods })}
                    className="w-full flex items-center justify-between py-3 px-3 rounded-xl hover:bg-raised transition-colors text-left">
                    <div>
                      <div className="font-medium text-sm">{isToday ? 'Today' : log.date}</div>
                      <div className="flex gap-1.5 mt-1">
                        {mealCounts.length > 0
                          ? mealCounts.map(m => (
                              <span key={m.id} className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                style={{ background: tok(m.color, 0.12), color: tok(m.color) }}>
                                <Icon icon={m.icon} width={12} className="inline -mt-0.5" /> {m.count}
                              </span>
                            ))
                          : <span className="text-xs text-muted">{displayFoods.length} items</span>
                        }
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-neon-ink">{displayKcal} kcal</div>
                      <Icon icon="mdi:chevron-right" width={18} className="text-muted ml-auto" aria-hidden="true" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {logFood && (
        <Sheet title="Log food" onClose={() => setLogFood(false)} bodyClassName="space-y-1 -mx-2">
          <ListRow icon="mdi:camera-outline" tile="neon-ink" title="Photo" chevron onClick={() => logBy('photo')}
            trailing={!isPro && <Fact>Pro</Fact>} />
          <ListRow icon="mdi:barcode-scan" tile="info" title="Barcode" chevron onClick={() => logBy('barcode')} />
          <ListRow icon="mdi:pencil-outline" tile="lilac" title="Type it in" chevron onClick={() => logBy('manual')}
            meta={MEALS.find(m => m.id === getCurrentMeal())?.label} />
        </Sheet>
      )}

      {selectedLog && (
        <DayModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {editingGoals && (
        <GoalEditSheet
          goals={goals}
          calculated={resolveGoals(profile).calculated}
          minCalories={MIN_CALORIES[profile?.sex] ?? MIN_CALORIES.other}
          onClose={() => setEditingGoals(false)}
          onSave={async (form) => {
            const payload = {
              calorie_goal: parseInt(form.calories) || null,
              protein_goal: parseInt(form.protein)  || null,
              carb_goal:    parseInt(form.carbs)    || null,
            }
            await saveGoals(payload)
            const base = resolveGoals(profile).calculated
            setLocalGoals({
              calories: payload.calorie_goal ?? base.calories,
              protein:  payload.protein_goal ?? base.protein,
              carbs:    payload.carb_goal    ?? base.carbs,
            })
            setEditingGoals(false)
          }}
          onReset={async () => {
            await saveGoals({ calorie_goal: null, protein_goal: null, carb_goal: null })
            setLocalGoals(null)
            setEditingGoals(false)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Meal Section
// ─────────────────────────────────────────────────────────────────────────────
function MealSection({ meal, foods, allFoods, isAdding, form, setForm, onToggleAdd, onAdd, onRemove, isCurrent }) {
  const mealKcal = foods.reduce((a, f) => a + (f.kcal || 0), 0)

  return (
    <div id={`meal-${meal.id}`} className="bg-surface border border-line rounded-2xl overflow-hidden transition-all"
      style={isCurrent ? { borderColor: tok(meal.color, 0.35) } : {}}>

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Icon icon={meal.icon} width={24} style={{ color: tok(meal.color) }} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base text-ink">{meal.label}</span>
              {isCurrent && (
                <span className="text-2xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: tok(meal.color, 0.12), color: tok(meal.color) }}>Now</span>
              )}
            </div>
            {mealKcal > 0 && (
              <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: tok(meal.color) }}>{mealKcal} kcal</div>
            )}
          </div>
        </div>
        <button onClick={onToggleAdd}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
            isAdding
              ? 'bg-raised text-muted border border-line-strong'
              : 'border text-neon-ink border-neon-stroke/40 hover:bg-neon hover:text-on-neon'
          }`}>
          {isAdding ? 'Cancel' : <span className="inline-flex items-center gap-1"><Icon icon="mdi:plus" width={14} />Add</span>}
        </button>
      </div>

      {/* Food list */}
      {foods.length > 0 && (
        <div className="px-4">
          {foods.map(f => {
            const idx = allFoods.indexOf(f)
            return (
              <div key={idx} className="flex items-center justify-between py-2.5 border-t border-line">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink break-words">{f.name}</div>
                  <div className="flex gap-1.5 mt-0.5 flex-wrap">
                    <Tag color="info">P {f.protein}g</Tag>
                    <Tag color="warn">C {f.carbs}g</Tag>
                    <Tag color="rose">F {f.fat}g</Tag>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <div className="text-right">
                    <div className="font-bold text-sm" style={{ color: tok(meal.color) }}>{f.kcal}</div>
                    <div className="text-xs font-medium text-muted">kcal</div>
                  </div>
                  <IconButton icon="mdi:trash-can-outline" label={`Remove ${f.name}`} tone="danger" onClick={() => onRemove(idx)} className="w-9 h-9" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}

      {/* Inline add form */}
      {isAdding && (
        <div className="px-4 pb-4 pt-3 border-t border-line">
          <div className="grid grid-cols-2 gap-2">
            {[['name','Food name','text'],['kcal','Calories','number'],['protein','Protein (g)','number'],['carbs','Carbs (g)','number'],['fat','Fat (g)','number']].map(([k, ph, t]) => (
              <input key={k} type={t} placeholder={ph} value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />
            ))}
            <button onClick={onAdd}
              className="press font-bold py-2.5 rounded-xl text-sm text-canvas inline-flex items-center justify-center gap-1"
              style={{ background: tok(meal.color) }}>
              <Icon icon="mdi:plus" width={16} />Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function DayModal({ log, onClose }) {
  const foods = log.foods || []
  const total = foods.reduce((a, f) => a + (f.kcal || 0), 0)
  const macros = foods.reduce((t, f) => ({
    protein: t.protein + (f.protein || 0),
    carbs:   t.carbs   + (f.carbs   || 0),
    fat:     t.fat     + (f.fat     || 0),
  }), { protein: 0, carbs: 0, fat: 0 })

  const byMeal = MEALS.map(m => ({
    ...m,
    foods: foods.filter(f => f.meal === m.id),
  })).filter(m => m.foods.length > 0)

  const untagged = foods.filter(f => !f.meal)

  return (
    <Sheet title={log.date === todayKey() ? 'Today' : log.date} onClose={onClose} bodyClassName="">
        <div className="text-xs text-muted -mt-1 tabular-nums">{total} kcal total</div>

        {/* Macro summary */}
        <div className="flex gap-2 mt-4 mb-5">
          {[['Protein', macros.protein, 'info'], ['Carbs', macros.carbs, 'warn'], ['Fat', macros.fat, 'rose']].map(([l, v, c]) => (
            <div key={l} className="flex-1 bg-inset rounded-xl p-3 text-center">
              <div className="font-bold text-xl tabular-nums" style={{ color: tok(c) }}>{v}g</div>
              <div className="text-2xs text-muted">{l}</div>
            </div>
          ))}
        </div>

        {/* Meals */}
        <div className="space-y-4">
          {byMeal.map(meal => {
            const mKcal = meal.foods.reduce((a, f) => a + (f.kcal || 0), 0)
            return (
              <div key={meal.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon={meal.icon} width={20} style={{ color: tok(meal.color) }} />
                  <div className="font-semibold text-sm">{meal.label}</div>
                  <div className="text-xs font-bold ml-auto" style={{ color: tok(meal.color) }}>{mKcal} kcal</div>
                </div>
                <div className="bg-inset rounded-xl overflow-hidden">
                  {meal.foods.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0">
                      <div>
                        <div className="text-sm font-medium">{f.name}</div>
                        <div className="text-xs text-muted">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
                      </div>
                      <div className="font-bold text-sm" style={{ color: tok(meal.color) }}>{f.kcal} kcal</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {untagged.length > 0 && (
            <div>
              <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">Other</div>
              <div className="bg-inset rounded-xl overflow-hidden">
                {untagged.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-muted">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
                    </div>
                    <div className="font-bold text-sm text-neon-ink">{f.kcal} kcal</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byMeal.length === 0 && untagged.length === 0 && (
            <div className="text-xs text-muted text-center py-4">No foods logged for this day</div>
          )}
        </div>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal Edit Sheet
// ─────────────────────────────────────────────────────────────────────────────
function GoalEditSheet({ goals, calculated, minCalories, onSave, onReset, onClose }) {
  const [form, setForm] = useState({
    calories: String(goals.calories),
    protein:  String(goals.protein),
    carbs:    String(goals.carbs),
  })
  const [saving, setSaving] = useState(false)

  const FIELDS = [
    { key: 'calories', label: 'Calories', unit: 'kcal/day', color: 'neon-ink', calc: calculated.calories },
    { key: 'protein',  label: 'Protein',  unit: 'g / day',  color: 'info', calc: calculated.protein },
    { key: 'carbs',    label: 'Carbs',    unit: 'g / day',  color: 'warn', calc: calculated.carbs },
  ]

  const kcal = parseInt(form.calories) || 0
  const protein = parseInt(form.protein) || 0, carbs = parseInt(form.carbs) || 0
  const tooLow = form.calories !== '' && kcal < minCalories
  const tooHigh = kcal > 7000
  const fat = Math.max(0, Math.round((kcal - protein * 4 - carbs * 4) / 9))
  const macrosOver = kcal > 0 && protein * 4 + carbs * 4 > kcal

  async function handleSave() {
    if (tooLow || tooHigh || macrosOver) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <Sheet title="Daily targets" onClose={onClose} bodyClassName="" footer={
      <>
        <Button full onClick={handleSave} disabled={saving || tooLow || tooHigh || macrosOver}>{saving ? 'Saving...' : 'Save targets'}</Button>
        <Button variant="ghost" full onClick={onReset} className="mt-2">Reset to calculated values</Button>
      </>
    }>
        <div className="text-xs text-muted mb-5 leading-relaxed">
          The auto values are estimated from your body stats and a moderate activity level. Change them to fit your goal. This is general guidance, not medical advice.
        </div>

        <div className="space-y-4">
          {FIELDS.map(({ key, label, unit, color, calc }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={`goal-${key}`} className="text-xs font-bold" style={{ color: tok(color) }}>{label}</label>
                <span className="text-xs text-muted">Auto: {calc} {unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`goal-${key}`}
                  type="number"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="flex-1 bg-raised border border-line focus:border-neon-stroke text-ink rounded-xl px-4 py-3 text-sm outline-none transition-colors font-semibold"
                />
                <span className="text-xs text-muted w-16 flex-shrink-0">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {kcal > 0 && !macrosOver && (
          <p className="text-xs text-muted mt-4">Fat fills the rest: about <span className="font-semibold text-ink-2 tabular-nums">{fat} g</span> a day.</p>
        )}
        {tooLow && (
          <p role="alert" className="text-xs text-danger mt-3">
            {minCalories} kcal is the lowest target ATHRION will set. Going lower than that should be planned with a doctor or dietitian.
          </p>
        )}
        {tooHigh && <p role="alert" className="text-xs text-danger mt-3">That's more than 7000 kcal. Check the number.</p>}
        {macrosOver && <p role="alert" className="text-xs text-danger mt-3">Protein and carbs add up to more than your calories. Lower one of them.</p>}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────
function MacroBar({ label, val, goal, color }) {
  const p = Math.min(100, Math.round((val / goal) * 100))
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-x-2 text-xs mb-1">
        <span style={{ color: tok(color) }}>{label}</span>
        <span className="text-muted tabular-nums">{val}g/{goal}g</span>
      </div>
      <div className="h-1 bg-raised rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ background: tok(color), width: `${p}%` }}/>
      </div>
    </div>
  )
}

function Tag({ children, color }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: tok(color, 0.12), color: tok(color) }}>
      {children}
    </span>
  )
}
