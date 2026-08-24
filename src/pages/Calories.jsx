import { useState, useEffect, useRef } from 'react'
import { todayKey } from '../lib/data.js'
import { fetchTodayCalorieLog, saveTodayCalorieLog, fetchCalorieLogs, saveGoals } from '../lib/api.js'
import { resolveGoals } from '../lib/goals.js'
import { fetchLatestNutritionTarget } from '../lib/fitnessApi.js'

const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅', hours: [5,  11], color: '#f59e0b' },
  { id: 'lunch',     label: 'Lunch',     icon: '☀️',  hours: [11, 16], color: '#3B82F6' },
  { id: 'dinner',    label: 'Dinner',    icon: '🌙',  hours: [16, 22], color: '#8B5CF6' },
  { id: 'snack',     label: 'Snacks',    icon: '🍎',  hours: null,     color: '#ec4899' },
]

function getCurrentMeal() {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 22) return 'dinner'
  return 'snack'
}

const EMPTY_FORM = { name: '', kcal: '', protein: '', carbs: '', fat: '' }

export default function Calories({ profile, isPro, onUpgrade, onGoToPlan }) {
  const [foods, setFoods]             = useState([])
  const [logId, setLogId]             = useState(null)
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
  const fileRef = useRef()

  // For Pro: use AI plan nutrition targets; for Free: use profile-based goals
  const baseGoals = localGoals ?? resolveGoals(profile)
  const activeGoals = (isPro && planNutrition)
    ? { calories: planNutrition.calorie_target, protein: planNutrition.protein_grams, carbs: planNutrition.carb_grams }
    : baseGoals
  const goals = activeGoals
  const fatGoal = (isPro && planNutrition?.fat_grams)
    ? planNutrition.fat_grams
    : Math.max(30, Math.round((goals.calories - goals.protein * 4 - goals.carbs * 4) / 9))

  useEffect(() => {
    fetchTodayCalorieLog(todayKey())
      .then(log => { if (log) { setFoods(log.foods || []); setLogId(log.id) } })
      .catch(() => {})
    fetchCalorieLogs()
      .then(l => setLogs(l || []))
      .catch(() => {})
    if (isPro) {
      fetchLatestNutritionTarget()
        .then(t => { if (t) setPlanNutrition(t) })
        .catch(() => {})
    }
  }, [])

  async function saveFoods(f) {
    setFoods(f)
    try {
      const saved = await saveTodayCalorieLog(todayKey(), f, logId)
      if (!logId && saved?.id) setLogId(saved.id)
    } catch {}
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
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-meal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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

  if (!isPro) return (
    <div className="relative select-none">
      {/* Blurred preview */}
      <div className="pointer-events-none blur-sm opacity-40 space-y-4 py-4">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 h-48" />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 h-24" />
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 h-24" />
        </div>
        <div className="bg-[#111] border border-[#222] rounded-2xl p-4 h-32" />
        <div className="bg-[#111] border border-[#222] rounded-2xl p-4 h-32" />
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-[#111]/95 border border-[#2a2a2a] rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon/25 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <div className="font-bebas text-3xl tracking-wide mb-2">PRO FEATURE</div>
          <p className="text-gray-400 text-sm leading-relaxed mb-5">
            Track calories, macros, and meals with the full nutrition tracker. Upgrade to unlock.
          </p>
          <button
            onClick={onUpgrade}
            className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest hover:shadow-[0_6px_24px_rgba(200,241,53,0.4)] transition-all">
            Upgrade Your Plan →
          </button>
          <div className="text-[10px] text-gray-700 mt-3">$5.99 / month · Cancel anytime</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 py-4 slide-up">

      {/* Ring + macros */}
      <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest">Today's Intake</div>
          {isPro && planNutrition ? (
            <button onClick={onGoToPlan}
              className="text-xs text-neon border border-neon/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
              From Plan →
            </button>
          ) : (
            <button onClick={() => setEditingGoals(true)}
              className="text-xs text-neon border border-neon/30 bg-neon/10 hover:bg-neon/20 px-2.5 py-1 rounded-lg font-semibold transition-all">
              Edit Targets
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
              <div className="font-bebas text-4xl leading-none" style={{color:ringColor}}>{totals.kcal}</div>
              <div className="text-[10px] text-gray-600 uppercase tracking-widest">kcal</div>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Goal</span>
                <span className="font-semibold">{goals.calories} kcal</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Remaining</span>
                <span style={{color:ringColor}} className="font-semibold">{remaining} kcal</span>
              </div>
            </div>
            <MacroBar label="Protein" val={totals.protein} goal={goals.protein} color="#3B82F6"/>
            <MacroBar label="Carbs"   val={totals.carbs}   goal={goals.carbs}   color="#f59e0b"/>
            <MacroBar label="Fat"     val={totals.fat}      goal={fatGoal}       color="#ec4899"/>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-[#111] border border-[#222] rounded-2xl p-1">
        {[['today','Today'],['log','Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              tab === id ? 'bg-neon text-black' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' ? (
        <>
          {/* AI Scanner */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">AI Food Scanner</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); analyzeImage(e.dataTransfer.files[0]) }}
              className="border-2 border-dashed border-[#333] hover:border-neon hover:bg-[#0b0f00] rounded-xl p-6 text-center cursor-pointer transition-all"
            >
              <div className="text-3xl mb-2">📸</div>
              <div className="font-medium text-sm mb-1">Take or upload a photo of your meal</div>
              <div className="text-xs text-gray-500">AI will identify food and estimate macros</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files[0]) analyzeImage(e.target.files[0]) }} />
            </div>

            {aiState === 'loading' && (
              <div className="mt-3 flex items-center gap-3 text-gray-400 text-sm p-3 bg-[#0d0d0d] rounded-xl">
                <span className="spin text-lg">⏳</span> Analyzing your meal with AI...
              </div>
            )}
            {aiState === 'error' && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-500/20 rounded-xl text-sm text-red-400">
                ⚠ {aiError || 'Could not analyze image. Try again or add manually.'}
              </div>
            )}
            {aiState === 'result' && aiResult && (
              <div className="mt-3 p-4 bg-[#0b0f00] border border-neon/20 rounded-xl fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-neon">🤖 AI found {aiResult.foods?.length} item(s)</div>
                  <div className="text-xs text-gray-600">Confidence: {aiResult.confidence}</div>
                </div>

                {/* Meal picker */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {MEALS.map(m => (
                    <button key={m.id} onClick={() => setAiMeal(m.id)}
                      className={`py-2 rounded-xl text-center text-[10px] font-bold transition-all border ${
                        aiMeal === m.id ? 'border-transparent' : 'border-[#2a2a2a] text-gray-500 bg-[#1a1a1a]'
                      }`}
                      style={aiMeal === m.id ? { background: m.color, color: '#000' } : {}}>
                      <div className="text-lg mb-0.5">{m.icon}</div>
                      {m.label}
                    </button>
                  ))}
                </div>

                {aiResult.foods?.map((f, i) => (
                  <div key={i} className="py-2 border-b border-[#1a1a1a] last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{f.name}</div>
                        <div className="text-xs text-gray-500">{f.portion}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-neon">{f.kcal} kcal</div>
                        <div className="text-xs text-gray-600">P{f.protein} C{f.carbs} F{f.fat}</div>
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
                    className="flex-1 font-bold py-2 rounded-xl text-sm uppercase tracking-widest text-black"
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
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Other</div>
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
                      <div className="text-xs text-gray-600">kcal</div>
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
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-4">Food Log</div>
          {logs.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">No logs yet</div>
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
                                {m.icon} {m.count}
                              </span>
                            ))
                          : <span className="text-xs text-gray-700">{displayFoods.length} items</span>
                        }
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-neon">{displayKcal} kcal</div>
                      <div className="text-xs text-gray-600">tap to view</div>
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

      {editingGoals && !isPro && (
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
          <span className="text-2xl">{meal.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{meal.label}</span>
              {isCurrent && (
                <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold"
                  style={{ background: `${meal.color}20`, color: meal.color }}>Now</span>
              )}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
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
              ? 'bg-[#1a1a1a] text-gray-500 border border-[#2a2a2a]'
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
                    <div className="text-xs text-gray-600">kcal</div>
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
          <div className="text-xs text-gray-700 pt-3">Nothing logged yet</div>
        </div>
      )}

      {/* Inline add form */}
      {isAdding && (
        <div className="px-4 pb-4 pt-3 border-t border-[#1a1a1a]">
          <div className="grid grid-cols-2 gap-2">
            {[['name','Food name','text'],['kcal','Calories','number'],['protein','Protein (g)','number'],['carbs','Carbs (g)','number'],['fat','Fat (g)','number']].map(([k, ph, t]) => (
              <input key={k} type={t} placeholder={ph} value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />
            ))}
            <button onClick={onAdd}
              className="font-bold py-2.5 rounded-xl text-sm uppercase tracking-widest text-black"
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
            <div className="text-xs text-gray-500 mt-0.5">{total} kcal total</div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors text-xl leading-none mt-0.5">×</button>
        </div>

        {/* Macro summary */}
        <div className="flex gap-2 mt-4 mb-5">
          {[['Protein', macros.protein, '#3B82F6'], ['Carbs', macros.carbs, '#f59e0b'], ['Fat', macros.fat, '#ec4899']].map(([l, v, c]) => (
            <div key={l} className="flex-1 bg-[#0d0d0d] rounded-xl p-3 text-center">
              <div className="font-bebas text-2xl" style={{ color: c }}>{v}g</div>
              <div className="text-[9px] text-gray-600 uppercase tracking-widest">{l}</div>
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
                  <span className="text-xl">{meal.icon}</span>
                  <div className="font-semibold text-sm">{meal.label}</div>
                  <div className="text-xs font-bold ml-auto" style={{ color: meal.color }}>{mKcal} kcal</div>
                </div>
                <div className="bg-[#0d0d0d] rounded-xl overflow-hidden">
                  {meal.foods.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] last:border-0">
                      <div>
                        <div className="text-sm font-medium">{f.name}</div>
                        <div className="text-xs text-gray-600">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
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
              <div className="text-xs text-gray-600 mb-2">Other</div>
              <div className="bg-[#0d0d0d] rounded-xl overflow-hidden">
                {untagged.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] last:border-0">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-gray-600">P{f.protein}g · C{f.carbs}g · F{f.fat}g</div>
                    </div>
                    <div className="font-bold text-sm text-neon">{f.kcal} kcal</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byMeal.length === 0 && untagged.length === 0 && (
            <div className="text-xs text-gray-600 text-center py-4">No foods logged for this day</div>
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
          <div className="font-bold text-lg">Daily Targets</div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xl transition-colors leading-none">×</button>
        </div>
        <div className="text-xs text-gray-600 mb-5 leading-relaxed">
          Calculated via Mifflin-St Jeor × 1.55 (moderate activity). Adjust to fit your goal.
        </div>

        <div className="space-y-4 mb-5">
          {FIELDS.map(({ key, label, unit, color, calc }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{label}</label>
                <span className="text-[10px] text-gray-600">Auto: {calc} {unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="flex-1 bg-[#161616] border border-[#262626] focus:border-neon text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors font-semibold"
                  style={{ '--tw-ring-color': color }}
                />
                <span className="text-xs text-gray-600 w-16 flex-shrink-0">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest disabled:opacity-50 mb-3 transition-all hover:shadow-[0_6px_24px_rgba(200,241,53,0.35)]">
          {saving ? 'Saving...' : 'Save Targets'}
        </button>
        <button onClick={onReset}
          className="w-full py-2 text-sm text-gray-600 hover:text-gray-400 transition-colors">
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
        <span className="text-gray-500">{val}g/{goal}g</span>
      </div>
      <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ background: color, width: `${p}%` }}/>
      </div>
    </div>
  )
}

function Tag({ children, color }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${color}20`, color }}>
      {children}
    </span>
  )
}
