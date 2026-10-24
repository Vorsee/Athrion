import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { todayKey } from '../lib/data.js'
import { supabase } from '../lib/supabase.js'
import { fetchTodayCalorieLog, saveTodayCalorieLog, fetchCalorieLogs, saveGoals } from '../lib/api.js'
import { resolveGoals } from '../lib/goals.js'
import { fetchLatestNutritionTarget } from '../lib/fitnessApi.js'
import AdaptiveNutritionCard from '../components/AdaptiveNutritionCard.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import ProLock from '../components/ProLock.jsx'

const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: 'mdi:weather-sunset-up', hours: [5,  11], color: '#f59e0b' },
  { id: 'lunch',     label: 'Lunch',     icon: 'mdi:white-balance-sunny', hours: [11, 16], color: '#3B82F6' },
  { id: 'dinner',    label: 'Dinner',    icon: 'mdi:weather-night', hours: [16, 22], color: '#8B5CF6' },
  { id: 'snack',     label: 'Snacks',    icon: 'mdi:food-apple-outline', hours: null,     color: '#ec4899' },
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
const SAMPLE_FOODS = [
  { name: 'Greek yogurt with berries', kcal: 280, protein: 22, carbs: 32, fat: 6, meal: 'breakfast' },
  { name: 'Oatmeal with banana', kcal: 350, protein: 10, carbs: 64, fat: 6, meal: 'breakfast' },
  { name: 'Chicken rice bowl', kcal: 620, protein: 48, carbs: 70, fat: 14, meal: 'lunch' },
  { name: 'Apple', kcal: 95, protein: 0, carbs: 25, fat: 0, meal: 'lunch' },
  { name: 'Salmon, potatoes and greens', kcal: 680, protein: 42, carbs: 55, fat: 28, meal: 'dinner' },
  { name: 'Protein shake', kcal: 160, protein: 30, carbs: 4, fat: 3, meal: 'snack' },
]
const SAMPLE_GOALS = { calories: 2600, protein: 180, carbs: 300 }

export default function Calories({ isPro, onUpgrade, ...props }) {
  if (!isPro) return (
    <ProLock onUpgrade={onUpgrade}
      description="Track calories, macros and meals, scan food with AI or barcodes, and get targets that adapt to your progress.">
      <CaloriesPage {...props} preview />
    </ProLock>
  )
  return <CaloriesPage {...props} />
}

// preview: render with sample data, without loading or saving anything
function CaloriesPage({ profile, onGoToPlan, preview = false }) {
  const [foods, setFoods]             = useState(preview ? SAMPLE_FOODS : [])
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
  const baseGoals = preview ? SAMPLE_GOALS : (localGoals ?? resolveGoals(profile))
  const activeGoals = planNutrition
    ? { calories: planNutrition.calorie_target, protein: planNutrition.protein_grams, carbs: planNutrition.carb_grams }
    : baseGoals
  const goals = activeGoals
  const fatGoal = planNutrition?.fat_grams
    ? planNutrition.fat_grams
    : Math.max(30, Math.round((goals.calories - goals.protein * 4 - goals.carbs * 4) / 9))

  useEffect(() => {
    if (preview) return
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
    if (preview) return
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

  const pct = Math.min(100, Math.round((totals.kcal / goals.calories) * 100))
  const remaining = Math.max(0, goals.calories - totals.kcal)
  const rv = 68, circ = 2 * Math.PI * rv
  const ringColor = pct > 100 ? '#ff6b6b' : pct > 80 ? '#f59e0b' : '#C8F135'

  return (
    <div className="space-y-4 py-4 slide-up">

      {saveError && (
        <div role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{saveError}</div>
      )}

      {/* Ring + macros */}
      <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-200">Today's intake</div>
          {planNutrition ? (
            <button onClick={onGoToPlan}
              className="text-xs text-neon border border-neon/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
              From plan →
            </button>
          ) : (
            <button onClick={() => setEditingGoals(true)}
              className="text-xs text-neon border border-neon/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all">
              Edit targets
            </button>
          )}
        </div>
        <div className="flex items-center gap-5">
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={rv} fill="none" stroke="#1e1e1e" strokeWidth="10"/>
              <circle cx="80" cy="80" r={rv} fill="none" stroke={ringColor} strokeWidth="10"
                strokeDasharray={`${circ*pct/100} ${circ}`} strokeLinecap="round"
                style={{transition:'stroke-dasharray 0.6s ease'}}/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-bold text-3xl leading-none" style={{color:ringColor}}>{totals.kcal}</div>
              <div className="text-sm font-semibold text-gray-200">kcal</div>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Goal</span>
                <span className="font-semibold">{goals.calories} kcal</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Remaining</span>
                <span style={{color:ringColor}} className="font-semibold">{remaining} kcal</span>
              </div>
            </div>
            <MacroBar label="Protein" val={totals.protein} goal={goals.protein} color="#3B82F6"/>
            <MacroBar label="Carbs"   val={totals.carbs}   goal={goals.carbs}   color="#f59e0b"/>
            <MacroBar label="Fat"     val={totals.fat}      goal={fatGoal}       color="#ec4899"/>
          </div>
        </div>
      </div>

      {planNutrition && (
        <AdaptiveNutritionCard calorieLogs={logs} current={planNutrition} profile={profile} onApplied={setPlanNutrition} />
      )}

      {/* Tab switcher */}
      <div className="flex bg-[#111] border border-[#222] rounded-2xl p-1">
        {[['today','Today'],['log','Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === id ? 'bg-neon text-black' : 'text-gray-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' ? (
        <>
          {/* AI Scanner */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <div className="text-sm font-semibold text-gray-200 mb-3">AI food scanner</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); analyzeImage(e.dataTransfer.files[0]) }}
              className="border-2 border-dashed border-[#333] hover:border-neon hover:bg-[#0b0f00] rounded-xl p-6 text-center cursor-pointer transition-all"
            >
              <Icon icon="mdi:camera-outline" width={32} className="mx-auto mb-2 text-neon" />
              <div className="font-medium text-sm mb-1">Take or upload a photo of your meal</div>
              <div className="text-xs text-gray-400">AI will identify food and estimate macros</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files[0]) analyzeImage(e.target.files[0]) }} />
            </div>
            <button onClick={() => setScanning(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 border border-[#2a2a2a] hover:border-neon/40 text-gray-300 hover:text-neon font-semibold py-3 rounded-xl text-xs transition-all">
              <Icon icon="mdi:barcode-scan" width={18} /> Scan barcode
            </button>
            {scanning && (
              <BarcodeScanner meals={MEALS} defaultMeal={getCurrentMeal()} onClose={() => setScanning(false)}
                onAdd={food => { saveFoods([...foods, food]); setScanning(false) }} />
            )}

            {aiState === 'loading' && (
              <div className="mt-3 flex items-center gap-3 text-gray-400 text-sm p-3 bg-[#0d0d0d] rounded-xl">
                <span className="spin text-lg">⏳</span> Analyzing your meal with AI...
              </div>
            )}
            {aiState === 'error' && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-500/20 rounded-xl text-sm text-red-400">
                {aiError || 'Could not analyze image. Try again or add manually.'}
              </div>
            )}
            {aiState === 'result' && aiResult && (
              <div className="mt-3 p-4 bg-[#0b0f00] border border-neon/20 rounded-xl fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-neon">AI found {aiResult.foods?.length} item(s)</div>
                  <div className="text-xs text-gray-400">Confidence: {aiResult.confidence}</div>
                </div>

                {/* Meal picker */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {MEALS.map(m => (
                    <button key={m.id} onClick={() => setAiMeal(m.id)}
                      className={`py-2 rounded-xl text-center text-xs font-bold transition-all border ${
                        aiMeal === m.id ? 'border-transparent' : 'border-[#2a2a2a] text-gray-400 bg-[#1a1a1a]'
                      }`}
                      style={aiMeal === m.id ? { background: m.color, color: '#000' } : {}}>
                      <Icon icon={m.icon} width={20} className="mx-auto mb-0.5" style={{ color: m.color }} />
                      {m.label}
                    </button>
                  ))}
                </div>

                {aiResult.foods?.map((f, i) => (
                  <div key={i} className="py-2 border-b border-[#1a1a1a] last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{f.name}</div>
                        <div className="text-xs text-gray-400">{f.portion}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-neon">{f.kcal} kcal</div>
                        <div className="text-xs text-gray-400">P{f.protein} C{f.carbs} F{f.fat}</div>
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
                    className="flex-1 font-bold py-2 rounded-xl text-sm text-black"
                    style={{ background: MEALS.find(m => m.id === aiMeal)?.color }}>
                    + Add to {MEALS.find(m => m.id === aiMeal)?.label}
                  </button>
                  <button onClick={() => setAiState('idle')}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 px-4 py-2 rounded-xl text-sm">
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
            <div className="bg-[#111] border border-[#222] rounded-2xl p-4">
              <div className="text-sm font-semibold text-gray-200 mb-3">Other</div>
              {foods.map((f, idx) => !f.meal ? (
                <div key={idx} className="flex items-center justify-between py-2.5 border-b border-[#1a1a1a] last:border-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="flex gap-1.5 mt-0.5 flex-wrap">
                      <Tag color="#3B82F6">P {f.protein}g</Tag>
                      <Tag color="#f59e0b">C {f.carbs}g</Tag>
                      <Tag color="#ec4899">F {f.fat}g</Tag>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <div className="text-right">
                      <div className="font-bold text-sm text-neon">{f.kcal}</div>
                      <div className="text-sm font-semibold text-gray-200">kcal</div>
                    </div>
                    <button onClick={() => removeFood(idx)}
                      className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg px-2 py-1 text-xs">✕</button>
                  </div>
                </div>
              ) : null)}
            </div>
          )}
        </>
      ) : (
        /* Log tab */
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-200 mb-4">Food log</div>
          {logs.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-6">No logs yet</div>
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
                    className="w-full flex items-center justify-between py-3 px-3 rounded-xl hover:bg-[#1a1a1a] transition-colors text-left">
                    <div>
                      <div className="font-medium text-sm">{isToday ? 'Today' : log.date}</div>
                      <div className="flex gap-1.5 mt-1">
                        {mealCounts.length > 0
                          ? mealCounts.map(m => (
                              <span key={m.id} className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                style={{ background: `${m.color}20`, color: m.color }}>
                                <Icon icon={m.icon} width={12} className="inline -mt-0.5" /> {m.count}
                              </span>
                            ))
                          : <span className="text-xs text-gray-500">{displayFoods.length} items</span>
                        }
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-neon">{displayKcal} kcal</div>
                      <div className="text-sm font-semibold text-gray-200">tap to view</div>
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
    <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden transition-all"
      style={isCurrent ? { borderColor: `${meal.color}50` } : {}}>

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Icon icon={meal.icon} width={24} style={{ color: meal.color }} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{meal.label}</span>
              {isCurrent && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: `${meal.color}20`, color: meal.color }}>Now</span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {meal.hours ? `${meal.hours[0]}:00 – ${meal.hours[1]}:00` : 'Any time'}
              {mealKcal > 0 && (
                <span className="ml-2 font-bold" style={{ color: meal.color }}>{mealKcal} kcal</span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onToggleAdd}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
            isAdding
              ? 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'
              : 'border text-neon border-neon/40 hover:bg-neon hover:text-black'
          }`}>
          {isAdding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Food list */}
      {foods.length > 0 && (
        <div className="px-4">
          {foods.map(f => {
            const idx = allFoods.indexOf(f)
            return (
              <div key={idx} className="flex items-center justify-between py-2.5 border-t border-[#1a1a1a]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="flex gap-1.5 mt-0.5 flex-wrap">
                    <Tag color="#3B82F6">P {f.protein}g</Tag>
                    <Tag color="#f59e0b">C {f.carbs}g</Tag>
                    <Tag color="#ec4899">F {f.fat}g</Tag>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <div className="text-right">
                    <div className="font-bold text-sm" style={{ color: meal.color }}>{f.kcal}</div>
                    <div className="text-sm font-semibold text-gray-200">kcal</div>
                  </div>
                  <button onClick={() => onRemove(idx)}
                    className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg px-2 py-1 text-xs hover:bg-red-500/20 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {foods.length === 0 && !isAdding && (
        <div className="px-4 pb-4 pt-0 border-t border-[#1a1a1a] mt-0">
          <div className="text-xs text-gray-500 pt-3">Nothing logged yet</div>
        </div>
      )}

      {/* Inline add form */}
      {isAdding && (
        <div className="px-4 pb-4 pt-3 border-t border-[#1a1a1a]">
          <div className="grid grid-cols-2 gap-2">
            {[['name','Food name','text'],['kcal','Calories','number'],['protein','Protein (g)','number'],['carbs','Carbs (g)','number'],['fat','Fat (g)','number']].map(([k, ph, t]) => (
              <input key={k} type={t} placeholder={ph} value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />
            ))}
            <button onClick={onAdd}
              className="font-bold py-2.5 rounded-xl text-sm text-black"
              style={{ background: meal.color }}>
              + Add
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#111] border border-[#222] rounded-t-3xl p-6 pb-10 max-h-[85vh] overflow-y-auto slide-up"
        onClick={e => e.stopPropagation()}
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="font-bold text-lg">{log.date === todayKey() ? 'Today' : log.date}</div>
            <div className="text-xs text-gray-400 mt-0.5">{total} kcal total</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none mt-0.5">×</button>
        </div>

        {/* Macro summary */}
        <div className="flex gap-2 mt-4 mb-5">
          {[['Protein', macros.protein, '#3B82F6'], ['Carbs', macros.carbs, '#f59e0b'], ['Fat', macros.fat, '#ec4899']].map(([l, v, c]) => (
            <div key={l} className="flex-1 bg-[#0d0d0d] rounded-xl p-3 text-center">
              <div className="font-bold text-xl" style={{ color: c }}>{v}g</div>
              <div className="text-[11px] text-gray-400">{l}</div>
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
                  <Icon icon={meal.icon} width={20} style={{ color: meal.color }} />
                  <div className="font-semibold text-sm">{meal.label}</div>
                  <div className="text-xs font-bold ml-auto" style={{ color: meal.color }}>{mKcal} kcal</div>
                </div>
                <div className="bg-[#0d0d0d] rounded-xl overflow-hidden">
                  {meal.foods.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] last:border-0">
                      <div>
                        <div className="text-sm font-medium">{f.name}</div>
                        <div className="text-xs text-gray-400">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
                      </div>
                      <div className="font-bold text-sm" style={{ color: meal.color }}>{f.kcal} kcal</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {untagged.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-200 mb-2">Other</div>
              <div className="bg-[#0d0d0d] rounded-xl overflow-hidden">
                {untagged.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] last:border-0">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-gray-400">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
                    </div>
                    <div className="font-bold text-sm text-neon">{f.kcal} kcal</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byMeal.length === 0 && untagged.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4">No foods logged for this day</div>
          )}
        </div>
      </div>
    </div>
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
    { key: 'calories', label: 'Calories', unit: 'kcal/day', color: '#C8F135', calc: calculated.calories },
    { key: 'protein',  label: 'Protein',  unit: 'g / day',  color: '#3B82F6', calc: calculated.protein },
    { key: 'carbs',    label: 'Carbs',    unit: 'g / day',  color: '#f59e0b', calc: calculated.carbs },
  ]

  async function handleSave() {
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#111] border border-[#222] rounded-t-3xl p-6 pb-10 modal-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#2a2a2a] rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-lg">Daily targets</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors leading-none">×</button>
        </div>
        <div className="text-xs text-gray-400 mb-5 leading-relaxed">
          Calculated via Mifflin-St Jeor × 1.55 (moderate activity). Adjust to fit your goal.
        </div>

        <div className="space-y-4 mb-5">
          {FIELDS.map(({ key, label, unit, color, calc }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold" style={{ color }}>{label}</label>
                <span className="text-xs text-gray-400">Auto: {calc} {unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="flex-1 bg-[#161616] border border-[#262626] focus:border-neon text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors font-semibold"
                  style={{ '--tw-ring-color': color }}
                />
                <span className="text-xs text-gray-400 w-16 flex-shrink-0">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 mb-3 transition-all">
          {saving ? 'Saving...' : 'Save targets'}
        </button>
        <button onClick={onReset}
          className="w-full py-2 text-sm text-gray-400 hover:text-gray-400 transition-colors">
          Reset to calculated values
        </button>
      </div>
    </div>
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
        <span style={{ color }}>{label}</span>
        <span className="text-gray-400">{val}g/{goal}g</span>
      </div>
      <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ background: color, width: `${p}%` }}/>
      </div>
    </div>
  )
}

function Tag({ children, color }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: `${color}20`, color }}>
      {children}
    </span>
  )
}
