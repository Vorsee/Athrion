import { useState } from 'react'
import { Icon } from '@iconify/react'
import { EXERCISES, MUSCLES, getExerciseIcon } from '../lib/data.js'
import { WORKOUT_LIBRARY } from '../lib/library.js'
import { saveCustomWorkout } from '../lib/api.js'

const DIFF_COLORS = {
  Beginner:     { bg: '#3B82F620', text: '#3B82F6' },
  Intermediate: { bg: '#f59e0b20', text: '#f59e0b' },
  Advanced:     { bg: '#ef444420', text: '#ef4444' },
}

const PAGE_SIZE = 20

export default function Library({ onStartWorkout }) {
  const [tab, setTab]                   = useState('routines')
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const [selectedEx, setSelectedEx]     = useState(null)
  const [filter, setFilter]             = useState('All')
  const [routineTag, setRoutineTag]     = useState('All')
  const [search, setSearch]             = useState('')
  const [page, setPage]                 = useState(0)

  const tags = ['All', ...new Set(WORKOUT_LIBRARY.map(w => w.tag))]
  const visibleRoutines = routineTag === 'All'
    ? WORKOUT_LIBRARY
    : WORKOUT_LIBRARY.filter(w => w.tag === routineTag)

  const filtered = EXERCISES.filter(ex => {
    const matchMuscle = filter === 'All' || ex.muscle === filter || ex.secondary?.includes(filter)
    const q = search.toLowerCase()
    const matchSearch = !q || ex.name.toLowerCase().includes(q) || ex.muscle.toLowerCase().includes(q)
    return matchMuscle && matchSearch
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function setFilterReset(val)  { setFilter(val);  setPage(0) }
  function setSearchReset(val)  { setSearch(val);  setPage(0) }

  if (selectedRoutine) return (
    <RoutineDetail
      workout={selectedRoutine}
      onBack={() => setSelectedRoutine(null)}
      onStartWorkout={onStartWorkout}
    />
  )

  return (
    <div className="space-y-4 py-4 slide-up">
      {/* Header */}
      <div>
        <div className="font-bold text-2xl">Library</div>
        <div className="text-gray-400 text-sm">
          {tab === 'routines'
            ? `${WORKOUT_LIBRARY.length} pre-built routines`
            : `${EXERCISES.length} exercises · ${filtered.length} shown`}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-[#111] border border-[#222] rounded-2xl p-1">
        {[['routines', 'Full routines'], ['exercises', 'Exercises']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === id ? 'bg-neon text-black' : 'text-gray-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'routines' ? (
        <>
          {/* Tag filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {tags.map(t => (
              <button key={t} onClick={() => setRoutineTag(t)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  routineTag === t ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* Routines grid */}
          <div className="grid grid-cols-2 gap-3">
            {visibleRoutines.map(w => (
              <button key={w.id} onClick={() => setSelectedRoutine(w)}
                className="bg-[#111] border border-[#222] rounded-2xl p-4 text-left hover:border-[#333] hover:-translate-y-0.5 transition-all duration-200">
                <Icon icon={w.icon} width={28} className="mb-2 text-neon" />
                <div className="font-bold text-sm mb-1.5 leading-tight">{w.name}</div>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: `${w.color}20`, color: w.color }}>
                  {w.tag}
                </span>
                <div className="mt-2 space-y-0.5">
                  <div className="text-xs text-gray-400">{w.exercises.length} exercises</div>
                  <div className="text-xs text-gray-400">⏱ {w.duration}</div>
                  <div className="text-xs text-gray-500">{w.difficulty}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Search */}
          <input type="text" placeholder="Search exercises"
            value={search} onChange={e => setSearchReset(e.target.value)}
            className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />

          {/* Muscle filter */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {MUSCLES.map(m => (
              <button key={m} onClick={() => setFilterReset(m)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filter === m ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-[#666] border border-[#2a2a2a] hover:border-[#444]'
                }`}>
                {m}
              </button>
            ))}
          </div>

          {/* Exercises grid */}
          <div className="grid grid-cols-2 gap-3">
            {paginated.map((ex, i) => {
              const dc = DIFF_COLORS[ex.difficulty]
              return (
                <button key={i} onClick={() => setSelectedEx(ex)}
                  className="bg-[#111] border border-[#222] hover:border-[#444] hover:-translate-y-0.5 rounded-2xl p-4 text-left transition-all duration-200">
                  <div className="mb-2"><Icon icon={getExerciseIcon(ex)} width={32} className="text-gray-400" /></div>
                  <div className="font-bold text-sm mb-0.5">{ex.name}</div>
                  <div className="text-xs text-gray-400 mb-2">{ex.muscle}</div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: dc.bg, color: dc.text }}>
                    {ex.difficulty}
                  </span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-8">No exercises found</div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1 pb-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#444] disabled:opacity-30 transition-all text-sm">
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                    i === page
                      ? 'bg-neon text-black'
                      : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:border-[#444] hover:text-white'
                  }`}>
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#444] disabled:opacity-30 transition-all text-sm">
                ›
              </button>
            </div>
          )}
        </>
      )}

      {selectedEx && <ExerciseModal ex={selectedEx} onClose={() => setSelectedEx(null)} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Routine Detail
// ─────────────────────────────────────────────────────────────────────────────
function RoutineDetail({ workout, onBack, onStartWorkout }) {
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  async function handleSave() {
    if (saved) return
    setSaving(true)
    try {
      await saveCustomWorkout(workout.name, workout.exercises.map(e => e.name), null)
      setSaved(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function handleStart() {
    const exs = workout.exercises
      .map(e => EXERCISES.find(ex => ex.name === e.name))
      .filter(Boolean)
    onStartWorkout?.(exs, workout.name)
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3">← Library</button>
        <div className="flex items-start gap-3">
          <Icon icon={workout.icon} width={44} className="text-neon" />
          <div className="flex-1">
            <div className="font-bold text-2xl leading-tight">{workout.name}</div>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1 inline-block"
              style={{ background: `${workout.color}20`, color: workout.color }}>
              {workout.tag}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-3 leading-relaxed">{workout.description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[['Difficulty', workout.difficulty], ['Duration', workout.duration], ['Exercises', `${workout.exercises.length} moves`]].map(([l, v]) => (
          <div key={l} className="bg-[#111] border border-[#222] rounded-2xl p-3 text-center">
            <div className="font-bold text-lg" style={{ color: workout.color }}>{v}</div>
            <div className="text-[11px] text-gray-400">{l}</div>
          </div>
        ))}
      </div>

      {/* Exercise list */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-200">Exercises</div>
        {workout.exercises.map((libEx, i) => {
          const ex = EXERCISES.find(e => e.name === libEx.name)
          const isOpen = expanded === i
          return (
            <div key={i} className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${workout.color}20`, color: workout.color }}>
                  {i + 1}
                </div>
                <Icon icon={getExerciseIcon(ex)} width={24} className="flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{libEx.name}</div>
                  <div className="text-xs text-gray-400">{ex?.muscle} · {ex?.equipment}</div>
                </div>
                <div className="text-right flex-shrink-0 mr-1">
                  <div className="text-xs font-bold" style={{ color: workout.color }}>{libEx.sets} × {libEx.reps}</div>
                  <div className="text-xs text-gray-400">Rest {libEx.rest}</div>
                </div>
                <div className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-[#1a1a1a]">
                  {ex?.steps && (
                    <div className="mt-3 mb-3">
                      <div className="text-sm font-semibold text-gray-200 mb-2">How to do it</div>
                      <div className="space-y-1.5">
                        {ex.steps.map((step, si) => (
                          <div key={si} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                            <span className="flex-shrink-0 w-4 h-4 rounded-full text-[11px] font-bold flex items-center justify-center mt-0.5"
                              style={{ background: `${workout.color}30`, color: workout.color }}>
                              {si + 1}
                            </span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ex?.tips && (
                    <div className="p-2.5 bg-[#0d0d0d] rounded-xl mb-2">
                      <div className="text-[11px] text-gray-400 mb-1">Form tip</div>
                      <div className="text-xs text-gray-400">{ex.tips}</div>
                    </div>
                  )}
                  <div className="p-2.5 rounded-xl" style={{ background: `${workout.color}10`, border: `1px solid ${workout.color}25` }}>
                    <div className="text-[11px] mb-1 font-bold" style={{ color: workout.color }}>In this workout</div>
                    <div className="text-xs text-gray-300">{libEx.note}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-6">
        <button onClick={handleStart}
          className="flex-1 bg-neon text-black font-bold py-3.5 rounded-xl text-sm transition-all">
          Start now
        </button>
        <button onClick={handleSave} disabled={saving || saved}
          className={`flex-1 font-bold py-3.5 rounded-xl text-sm transition-all border ${
            saved
              ? 'border-neon/40 text-neon bg-neon/10'
              : 'border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50'
          }`}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : '+ Save'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise Modal
// ─────────────────────────────────────────────────────────────────────────────
function ExerciseModal({ ex, onClose }) {
  const dc = DIFF_COLORS[ex.difficulty]
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm fade-in px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#111] border border-[#222] rounded-3xl p-7 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="mb-2"><Icon icon={getExerciseIcon(ex)} width={40} className="text-gray-400" /></div>
            <div className="font-bold text-2xl">{ex.name}</div>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <span className="bg-neon/10 text-neon text-xs font-bold px-2.5 py-0.5 rounded-full">{ex.muscle}</span>
              {ex.secondary?.map(s => (
                <span key={s} className="bg-white/5 text-gray-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose}
            className="bg-[#1e1e1e] text-gray-400 hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {[['Sets', ex.sets], ['Reps', ex.reps], ['Equipment', ex.equipment]].map(([l, v]) => (
            <div key={l} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-3 text-center">
              <div className="text-xs text-gray-400">{l}</div>
              <div className="font-bold text-xs text-neon mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-bold mb-4 inline-block" style={{ background: dc.bg, color: dc.text }}>
          {ex.difficulty}
        </span>

        <p className="text-gray-400 text-sm leading-relaxed mb-5">{ex.desc}</p>

        <div className="mb-5">
          <div className="text-sm font-semibold text-gray-200 mb-3">How to</div>
          <div className="space-y-2">
            {ex.steps.map((s, i) => (
              <div key={i} className="flex gap-3 bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-3">
                <div className="w-5 h-5 bg-neon text-black rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">{i + 1}</div>
                <div className="text-sm text-gray-300">{s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-neon/10 border border-neon/20 rounded-xl p-4">
          <div className="text-xs text-neon font-bold mb-1">Pro tip</div>
          <div className="text-sm text-gray-300">{ex.tips}</div>
        </div>
      </div>
    </div>
  )
}
