import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Segmented, Chip, Sheet, EmptyState } from '../components/ui/index.js'
import { EXERCISES, MUSCLES, getExerciseIcon } from '../lib/data.js'
import { WORKOUT_LIBRARY } from '../lib/library.js'
import { saveCustomWorkout } from '../lib/api.js'
import { tok } from '../lib/tokens.js'

const diffStyle = c => ({ background: tok(c, 0.12), color: tok(c) })
const DIFF_COLORS = {
  Beginner:     diffStyle('info'),
  Intermediate: diffStyle('warn'),
  Advanced:     diffStyle('danger'),
}

const PAGE_SIZE = 20

export default function Library({ onStartWorkout }) {
  const [tab, setTab]                   = useState('routines')
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const [selectedEx, setSelectedEx]     = useState(null)
  useBackHandler(!!selectedRoutine, () => setSelectedRoutine(null), 'Library', selectedRoutine?.name)
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
        <div className="text-muted text-sm">
          {tab === 'routines'
            ? `${WORKOUT_LIBRARY.length} pre-built routines`
            : `${EXERCISES.length} exercises · ${filtered.length} shown`}
        </div>
      </div>

      {/* Tab switcher */}
      <Segmented options={[['routines', 'Full routines'], ['exercises', 'Exercises']]} value={tab} onChange={setTab} label="Library view" />

      {tab === 'routines' ? (
        <>
          {/* Tag filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {tags.map(t => (
              <Chip key={t} selected={routineTag === t} onClick={() => setRoutineTag(t)}>{t}</Chip>
            ))}
          </div>

          {/* Routines grid */}
          <div className="grid grid-cols-2 gap-3">
            {visibleRoutines.map(w => (
              <button key={w.id} onClick={() => setSelectedRoutine(w)}
                className="bg-surface border border-line rounded-2xl p-4 text-left hover:border-line-strong hover:-translate-y-0.5 transition-all duration-200">
                <Icon icon={w.icon} width={28} className="mb-2 text-ink-2" />
                <div className="font-bold text-sm mb-1.5 leading-tight">{w.name}</div>
                <span className="text-2xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: tok(w.color, 0.12), color: tok(w.color) }}>
                  {w.tag}
                </span>
                <div className="mt-2 space-y-0.5">
                  <div className="text-xs text-muted">{w.exercises.length} exercises</div>
                  <div className="text-xs text-muted flex items-center gap-1"><Icon icon="mdi:clock-outline" width={14} aria-hidden="true" />{w.duration}</div>
                  <div className="text-xs text-muted">{w.difficulty}</div>
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
            className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors" />

          {/* Muscle filter */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {MUSCLES.map(m => (
              <Chip key={m} selected={filter === m} onClick={() => setFilterReset(m)}>{m}</Chip>
            ))}
          </div>

          {/* Exercises grid */}
          <div className="grid grid-cols-2 gap-3">
            {paginated.map((ex, i) => {
              const dc = DIFF_COLORS[ex.difficulty]
              return (
                <button key={i} onClick={() => setSelectedEx(ex)}
                  className="bg-surface border border-line hover:border-line-strong hover:-translate-y-0.5 rounded-2xl p-4 text-left transition-all duration-200">
                  <div className="mb-2"><Icon icon={getExerciseIcon(ex)} width={32} className="text-muted" /></div>
                  <div className="font-bold text-sm mb-0.5">{ex.name}</div>
                  <div className="text-xs text-muted mb-2">{ex.muscle}</div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={dc}>
                    {ex.difficulty}
                  </span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <EmptyState icon="mdi:magnify" title="No exercises found" action="Clear search" actionIcon="mdi:close"
              onAction={() => { setSearchReset(''); setFilterReset('All') }}>
              Try another name, or a different muscle.
            </EmptyState>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1 pb-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0} aria-label="Previous page"
                className="press w-9 h-9 rounded-full bg-raised border border-line-strong text-muted hover:text-ink disabled:opacity-40 transition-all flex items-center justify-center">
                <Icon icon="mdi:chevron-left" width={20} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className={`press w-9 h-9 rounded-full text-xs font-bold tabular-nums transition-all ${
                    i === page
                      ? 'bg-neon text-on-neon'
                      : 'bg-raised border border-line-strong text-muted hover:border-line-strong hover:text-ink'
                  }`}>
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1} aria-label="Next page"
                className="press w-9 h-9 rounded-full bg-raised border border-line-strong text-muted hover:text-ink disabled:opacity-40 transition-all flex items-center justify-center">
                <Icon icon="mdi:chevron-right" width={20} />
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
        <div className="flex items-start gap-3">
          <Icon icon={workout.icon} width={44} className="text-ink-2" />
          <div className="flex-1">
            <div className="font-bold text-2xl leading-tight">{workout.name}</div>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1 inline-block"
              style={{ background: tok(workout.color, 0.12), color: tok(workout.color) }}>
              {workout.tag}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted mt-3 leading-relaxed">{workout.description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[['Difficulty', workout.difficulty], ['Duration', workout.duration], ['Exercises', `${workout.exercises.length} moves`]].map(([l, v]) => (
          <div key={l} className="bg-surface border border-line rounded-2xl p-3 text-center">
            <div className="font-bold text-lg" style={{ color: tok(workout.color) }}>{v}</div>
            <div className="text-2xs text-muted">{l}</div>
          </div>
        ))}
      </div>

      {/* Exercise list */}
      <div className="space-y-2">
        <div className="text-lg leading-[1.3] font-semibold text-ink">Exercises</div>
        {workout.exercises.map((libEx, i) => {
          const ex = EXERCISES.find(e => e.name === libEx.name)
          const isOpen = expanded === i
          return (
            <div key={i} className="bg-surface border border-line rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: tok(workout.color, 0.12), color: tok(workout.color) }}>
                  {i + 1}
                </div>
                <Icon icon={getExerciseIcon(ex)} width={24} className="flex-shrink-0 text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{libEx.name}</div>
                  <div className="text-xs text-muted">{ex?.muscle} · {ex?.equipment}</div>
                </div>
                <div className="text-right flex-shrink-0 mr-1">
                  <div className="text-xs font-bold" style={{ color: tok(workout.color) }}>{libEx.sets} × {libEx.reps}</div>
                  <div className="text-xs text-muted">Rest {libEx.rest}</div>
                </div>
                <Icon icon={isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={18} className="text-muted flex-shrink-0" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-line">
                  {ex?.steps && (
                    <div className="mt-3 mb-3">
                      <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">How to do it</div>
                      <div className="space-y-1.5">
                        {ex.steps.map((step, si) => (
                          <div key={si} className="flex gap-2 text-xs text-ink-2 leading-relaxed">
                            <span className="flex-shrink-0 w-4 h-4 rounded-full text-2xs font-bold flex items-center justify-center mt-0.5"
                              style={{ background: tok(workout.color, 0.2), color: tok(workout.color) }}>
                              {si + 1}
                            </span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ex?.tips && (
                    <div className="p-2.5 bg-inset rounded-xl mb-2">
                      <div className="text-xs text-muted mb-1">Form tip</div>
                      <div className="text-xs text-muted">{ex.tips}</div>
                    </div>
                  )}
                  <div className="p-2.5 rounded-xl" style={{ background: tok(workout.color, 0.06), border: `1px solid ${tok(workout.color, 0.25)}` }}>
                    <div className="text-xs mb-1 font-bold" style={{ color: tok(workout.color) }}>In this workout</div>
                    <div className="text-xs text-ink-2">{libEx.note}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-6">
        <Button className="flex-1" onClick={handleStart}>Start now</Button>
        <button onClick={handleSave} disabled={saving || saved}
          className={`flex-1 font-bold py-3.5 rounded-xl text-sm transition-all border ${
            saved
              ? 'border-neon-stroke/40 text-neon-ink bg-neon/10'
              : 'border-neon-stroke/40 text-neon-ink hover:bg-neon/10 disabled:opacity-50'
          }`}>
          <span className="inline-flex items-center justify-center gap-1.5">
            {saved ? <><Icon icon="mdi:check" width={16} />Saved</> : saving ? 'Saving…' : <><Icon icon="mdi:plus" width={16} />Save</>}
          </span>
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
    <Sheet ariaLabel={ex.name} onClose={onClose} bodyClassName="">
        <div className="mb-4">
          <div>
            <div className="mb-2"><Icon icon={getExerciseIcon(ex)} width={40} className="text-muted" /></div>
            <h2 className="font-bold text-[1.625rem] leading-[1.15] text-ink">{ex.name}</h2>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <span className="bg-neon/10 text-neon-ink text-xs font-bold px-2.5 py-0.5 rounded-full">{ex.muscle}</span>
              {ex.secondary?.map(s => (
                <span key={s} className="bg-raised text-muted text-xs font-semibold px-2.5 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {[['Sets', ex.sets], ['Reps', ex.reps], ['Equipment', ex.equipment]].map(([l, v]) => (
            <div key={l} className="bg-inset border border-line rounded-xl p-3 text-center">
              <div className="text-xs text-muted">{l}</div>
              <div className="font-bold text-xs text-neon-ink mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-bold mb-4 inline-block" style={dc}>
          {ex.difficulty}
        </span>

        <p className="text-muted text-sm leading-relaxed mb-5">{ex.desc}</p>

        <div className="mb-5">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">How to</div>
          <div className="space-y-2">
            {ex.steps.map((s, i) => (
              <div key={i} className="flex gap-3 bg-inset border border-line rounded-xl p-3">
                <div className="w-5 h-5 bg-neon text-on-neon rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                <div className="text-sm text-ink-2">{s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-neon-tint border border-neon-stroke/20 rounded-xl p-4">
          <div className="text-xs text-neon-ink font-bold mb-1">Pro tip</div>
          <div className="text-sm text-ink-2">{ex.tips}</div>
        </div>
    </Sheet>
  )
}
