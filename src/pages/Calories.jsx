import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { todayKey } from '../lib/data.js'
import { supabase } from '../lib/supabase.js'
import { fetchTodayCalorieLog, saveTodayCalorieLog, fetchCalorieLogs, saveGoals } from '../lib/api.js'
import { resolveGoals } from '../lib/goals.js'
import { fetchLatestNutritionTarget } from '../lib/fitnessApi.js'
import AdaptiveNutritionCard from '../components/AdaptiveNutritionCard.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import { tok } from '../lib/tokens.js'
import { Segmented, Sheet, Button, SectionTitle } from '../components/ui/index.js'

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

function CaloriesPage({ profile, onGoToPlan, isPro, onUpgrade }) {
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
  const fileRef = useRef()

  // Plan nutrition targets when there is a plan, otherwise profile-based (or custom) goals
  const baseGoals = localGoals ?? resolveGoals(profile)
  const activeGoals = planNutrition
    ? { calories: planNutrition.calorie_target, protein: planNutrition.protein_grams, carbs: planNutrition.carb_grams }
    : baseGoals
  const goals = activeGoals
  const fatGoal = planNutrition?.fat_grams
    ? planNutrition.fat_grams
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
      <div className="bg-surface border border-line rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg leading-[1.3] font-semibold text-ink">Today's intake</div>
          {planNutrition ? (
            <button onClick={onGoToPlan}
              className="text-xs text-neon-ink border border-neon-stroke/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
              From plan <Icon icon="mdi:chevron-right" width={14} className="-mr-1" />
            </button>
          ) : (
            <button onClick={() => setEditingGoals(true)}
              className="text-xs text-neon-ink border border-neon-stroke/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all">
              Edit targets
            </button>
          )}
        </div>
        <div className="flex items-center gap-5">
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={rv} fill="none" className="stroke-line" strokeWidth="10"/>
              <circle cx="80" cy="80" r={rv} fill="none" strokeWidth="10"
                strokeDasharray={`${circ*pct/100} ${circ}`} strokeLinecap="round"
                style={{ stroke: ringColor, transition: 'stroke-dasharray 0.6s ease-out' }}/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-bold text-3xl leading-none tabular-nums" style={{ color: ringText }}>{totals.kcal}</div>
              <div className="text-xs font-medium text-muted">kcal</div>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Goal</span>
                <span className="font-semibold tabular-nums">{goals.calories} kcal</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Remaining</span>
                <span style={{ color: ringText }} className="font-semibold tabular-nums">{remaining} kcal</span>
              </div>
            </div>
            <MacroBar label="Protein" val={totals.protein} goal={goals.protein} color="info"/>
            <MacroBar label="Carbs"   val={totals.carbs}   goal={goals.carbs}   color="warn"/>
            <MacroBar label="Fat"     val={totals.fat}      goal={fatGoal}       color="rose"/>
          </div>
        </div>
      </div>

      {planNutrition && (
        <AdaptiveNutritionCard calorieLogs={logs} current={planNutrition} profile={profile} onApplied={setPlanNutrition} />
      )}

      {/* Tab switcher */}
      <Segmented options={[['today', 'Today'], ['log', 'Log']]} value={tab} onChange={setTab} label="Food view" />

      {tab === 'today' ? (
        <>
          {/* AI Scanner */}
          <div className="bg-surface border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-lg leading-[1.3] font-semibold text-ink">AI food scanner</div>
              {!isPro && <span className="text-xs font-semibold text-neon-ink bg-neon-tint border border-neon-stroke/25 rounded-md px-2 py-0.5">Pro</span>}
            </div>
            <div
              role="button" tabIndex={0}
              onClick={() => (isPro ? fileRef.current?.click() : onUpgrade?.())}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isPro ? fileRef.current?.click() : onUpgrade?.() } }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); isPro ? analyzeImage(e.dataTransfer.files[0]) : onUpgrade?.() }}
              className="border-2 border-dashed border-line-strong hover:border-neon-stroke hover:bg-neon-tint rounded-xl p-6 text-center cursor-pointer transition-all"
            >
              <Icon icon="mdi:camera-outline" width={32} className="mx-auto mb-2 text-neon-ink" />
              <div className="font-medium text-sm mb-1">Take or upload a photo of your meal</div>
              <div className="text-xs text-muted">{isPro ? 'AI will identify food and estimate macros' : 'Snap your plate, get calories and macros. Included with Pro.'}</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files[0]) analyzeImage(e.target.files[0]) }} />
            </div>
            <button onClick={() => setScanning(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 border border-line-strong hover:border-neon-stroke/40 text-ink-2 hover:text-neon-ink font-semibold py-3 rounded-xl text-xs transition-all">
              <Icon icon="mdi:barcode-scan" width={18} /> Scan barcode
            </button>
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
                  <div className="text-sm font-medium text-neon-ink">AI found {aiResult.foods?.length} item(s)</div>
                  <div className="text-xs text-muted">Confidence: {aiResult.confidence}</div>
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
        <div className="bg-surface border border-line rounded-2xl p-5">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-4">Food log</div>
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
        </div>
      )}

      {selectedLog && (
        <DayModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {editingGoals && (
        <GoalEditSheet
          goals={goals}
          calculated={resolveGoals(profile).calculated}
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
    <div className="bg-surface border border-line rounded-2xl overflow-hidden transition-all"
      style={isCurrent ? { borderColor: tok(meal.color, 0.35) } : {}}>

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Icon icon={meal.icon} width={24} style={{ color: tok(meal.color) }} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{meal.label}</span>
              {isCurrent && (
                <span className="text-2xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: tok(meal.color, 0.12), color: tok(meal.color) }}>Now</span>
              )}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {meal.hours ? `${meal.hours[0]}:00 – ${meal.hours[1]}:00` : 'Any time'}
              {mealKcal > 0 && (
                <span className="ml-2 font-bold" style={{ color: tok(meal.color) }}>{mealKcal} kcal</span>
              )}
            </div>
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
                  <div className="text-sm font-medium">{f.name}</div>
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
                  <button onClick={() => onRemove(idx)} aria-label={`Remove ${f.name}`}
                    className="press w-9 h-9 flex items-center justify-center bg-danger/10 text-danger border border-danger/20 rounded-md hover:bg-danger/20 transition-colors">
                    <Icon icon="mdi:close" width={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {foods.length === 0 && !isAdding && (
        <div className="px-4 pb-4 pt-0 border-t border-line mt-0">
          <div className="text-xs text-muted pt-3">Nothing logged yet</div>
        </div>
      )}

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
function GoalEditSheet({ goals, calculated, onSave, onReset, onClose }) {
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

  async function handleSave() {
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <Sheet title="Daily targets" onClose={onClose} bodyClassName="" footer={
      <>
        <Button full onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save targets'}</Button>
        <Button variant="ghost" full onClick={onReset} className="mt-2">Reset to calculated values</Button>
      </>
    }>
        <div className="text-xs text-muted mb-5 leading-relaxed">
          Calculated via Mifflin-St Jeor × 1.55 (moderate activity). Adjust to fit your goal.
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
      <div className="flex justify-between text-xs mb-1">
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
