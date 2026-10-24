import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { EXERCISES, getTodaysExercises, todayKey, fmtTime, getExerciseIcon } from '../lib/data.js'
import { fetchWorkoutHistory, saveWorkoutEntry, fetchCustomWorkouts, saveCustomWorkout, deleteCustomWorkout } from '../lib/api.js'
import { fetchActivePlan } from '../lib/fitnessApi.js'
import { DemoButton, ExerciseDemoSheet } from '../components/ExerciseDemo.jsx'
import { buildExerciseHistory, getRecords, suggestNext, parseRepRange, findNewPRs } from '../lib/progress.js'
import { BADGES, computeEarnedBadges } from '../lib/badges.js'
import { fetchBadges, awardBadges } from '../lib/progressApi.js'

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const dayIdx = new Date().getDay()
const TODAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayIdx]

function matchPlanExercises(planExercises) {
  return planExercises.map(pe => {
    const found = EXERCISES.find(e => e.name.toLowerCase() === pe.name.toLowerCase())
    // Keep the plan's rep target so progression suggestions use the right range
    if (found) return { ...found, reps: pe.reps }
    return { name: pe.name, muscle: '', icon: 'mdi:dumbbell', sets: pe.sets, reps: pe.reps, restSeconds: pe.restSeconds }
  })
}

const FREE_WORKOUT_LIMIT = 3

export default function Workout({ pendingWorkout, onClearPending, isPro, onUpgrade, onOpenPage }) {
  const [screen, setScreen]                   = useState('home')
  const [activeExercises, setActiveExercises] = useState([])
  const [activeWorkoutName, setActiveWorkoutName] = useState('')
  const [totalSets, setTotalSets]             = useState(3)
  const [restDuration, setRestDuration]       = useState(60)
  const [restPerExercise, setRestPerExercise] = useState([]) // per-exercise overrides from AI plan
  const [exIdx, setExIdx]                     = useState(0)
  const [setIdx, setSetIdx]                   = useState(0)
  const [loggedSets, setLoggedSets]           = useState([])
  const [weight, setWeight]                   = useState('')
  const [reps, setReps]                       = useState('')
  const [startTime, setStartTime]             = useState(null)
  const [history, setHistory]                 = useState([])
  const [customWorkouts, setCustomWorkouts]   = useState([])
  const [editingWorkout, setEditingWorkout]   = useState(null)
  const [freeWorkout, setFreeWorkout]         = useState(false)
  const [planWorkout, setPlanWorkout]         = useState(null)
  const [planSchedule, setPlanSchedule]       = useState(null) // full week, so rest days match the Plan tab
  const [homeReady, setHomeReady]             = useState(false) // today's workout data loaded
  const [sessionPRs, setSessionPRs]           = useState([])
  const [earnedBadgeIds, setEarnedBadgeIds]   = useState(null)
  const [sessionBadges, setSessionBadges]     = useState([])

  const exerciseHistory = useMemo(() => buildExerciseHistory(history), [history])

  // ── localStorage helpers ───────────────────────────────────────────────────
  function persistWorkout(overrides = {}) {
    const state = {
      screen: overrides.screen ?? screen,
      name: activeWorkoutName,
      exerciseNames: overrides.exerciseNames ?? activeExercises.map(e => e.name),
      totalSets,
      restDuration,
      restPerExercise,
      exIdx: overrides.exIdx ?? exIdx,
      setIdx: overrides.setIdx ?? setIdx,
      loggedSets: overrides.loggedSets ?? loggedSets,
      startTime,
      freeWorkout,
    }
    localStorage.setItem('athrion_workout', JSON.stringify(state))
  }
  function clearPersistedWorkout() {
    localStorage.removeItem('athrion_workout')
    localStorage.removeItem('athrion_rest_end')
  }

  useEffect(() => {
    fetchBadges().then(b => setEarnedBadgeIds(new Set(b.map(x => x.badge_id)))).catch(() => {})

    // Today's workout depends on all three, so reveal it once they've all settled
    Promise.allSettled([
      fetchWorkoutHistory().then(h => setHistory(h)),
      fetchCustomWorkouts().then(w => setCustomWorkouts(w)),
      fetchActivePlan().then(plan => {
        if (!plan?.plan_data?.weeklySchedule) return
        setPlanSchedule(plan.plan_data.weeklySchedule)
        const todayDay = plan.plan_data.weeklySchedule.find(d => d.day === TODAY_FULL)
        if (todayDay?.type === 'workout' && todayDay.workout?.exercises?.length) {
          setPlanWorkout(todayDay)  // store full dayData, same shape Plan.jsx uses
        }
      }),
    ]).then(() => setHomeReady(true))

    // Restore in-progress workout
    try {
      const raw = localStorage.getItem('athrion_workout')
      if (!raw) return
      const s = JSON.parse(raw)
      if (!s.startTime) return
      const exercises = (s.exerciseNames || []).map(n => EXERCISES.find(e => e.name === n)).filter(Boolean)
      if (!s.freeWorkout && !exercises.length) return
      setActiveExercises(exercises)
      setActiveWorkoutName(s.name || '')
      setTotalSets(s.totalSets || 3)
      setRestDuration(s.restDuration || 60)
      setRestPerExercise(s.restPerExercise || [])
      setExIdx(s.exIdx || 0)
      setSetIdx(s.setIdx || 0)
      setLoggedSets(s.loggedSets || [])
      setStartTime(s.startTime)
      setFreeWorkout(s.freeWorkout || false)
      const validScreens = ['rest', 'exercise-picker']
      setScreen(validScreens.includes(s.screen) ? s.screen : 'training')
    } catch {}
  }, [])

  useEffect(() => {
    if (pendingWorkout?.exercises?.length) {
      startWorkout(pendingWorkout.exercises, pendingWorkout.name)
      onClearPending?.()
    }
  }, [pendingWorkout])

  function startWorkout(exercises, name) {
    setActiveExercises(exercises)
    setActiveWorkoutName(name)
    setRestPerExercise([])
    setExIdx(0); setSetIdx(0); setLoggedSets([])
    setWeight(''); setReps('')
    setFreeWorkout(false)
    setScreen('config')
  }

  // Skips config screen — sets/rest per exercise pre-determined by AI plan
  function startPlanWorkout(exercises, name, sets, perExRest) {
    setActiveExercises(exercises)
    setActiveWorkoutName(name)
    setTotalSets(sets)
    setRestDuration(perExRest[0] ?? 60)
    setRestPerExercise(perExRest)
    setFreeWorkout(false)
    const t = Date.now()
    setExIdx(0); setSetIdx(0); setLoggedSets([])
    setWeight(''); setReps('')
    setStartTime(t)
    localStorage.setItem('athrion_workout', JSON.stringify({
      screen: 'training', name,
      exerciseNames: exercises.map(e => e.name),
      totalSets: sets, restDuration: perExRest[0] ?? 60, restPerExercise: perExRest,
      exIdx: 0, setIdx: 0, loggedSets: [], startTime: t, freeWorkout: false,
    }))
    setScreen('training')
  }

  function startFreeWorkout() {
    setActiveExercises([])
    setActiveWorkoutName('Free workout')
    setExIdx(0); setSetIdx(0); setLoggedSets([])
    setWeight(''); setReps('')
    setFreeWorkout(true)
    setScreen('config')
  }

  function openBuilder(workout = null) {
    const isNew = !workout
    if (isNew && !isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT) {
      onUpgrade?.(); return
    }
    setEditingWorkout(workout ? { ...workout } : { id: null, name: '', exercises: [] })
    setScreen('builder')
  }

  async function handleSaveWorkout(name, exerciseNames) {
    const saved = await saveCustomWorkout(name, exerciseNames, editingWorkout?.id || null)
    setCustomWorkouts(prev =>
      editingWorkout?.id
        ? prev.map(w => w.id === saved.id ? saved : w)
        : [saved, ...prev]
    )
    setScreen('home')
  }

  async function handleDeleteWorkout(id) {
    await deleteCustomWorkout(id)
    setCustomWorkouts(prev => prev.filter(w => w.id !== id))
  }

  async function saveHistory(entry) {
    let saved = { ...entry, created_at: new Date().toISOString() }
    try { saved = await saveWorkoutEntry(entry) } catch {}
    setHistory(prev => [saved, ...prev]) // history is newest-first
  }

  async function handleSaveAsWorkout(name, exerciseNames) {
    if (!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT) {
      onUpgrade?.(); return
    }
    const saved = await saveCustomWorkout(name, exerciseNames, null)
    setCustomWorkouts(prev => [saved, ...prev])
  }

  function handleEndWorkout() {
    clearPersistedWorkout()
    const duration = Math.round((Date.now() - startTime) / 60000)
    const volume = loggedSets.reduce((a, s) => a + s.weight * s.reps, 0)
    // Compare against history before this session is added to it
    setSessionPRs(findNewPRs(loggedSets, history))
    setSessionBadges([])
    if (loggedSets.length > 0 && (duration >= 2 || volume >= 10)) {
      const entry = { date: todayKey(), name: activeWorkoutName, duration: `${duration}min`, volume, sets: loggedSets }
      saveHistory(entry)
      // Workout-based badges unlocked by this session (body/photo badges are awarded in Progress)
      if (earnedBadgeIds) {
        const now = computeEarnedBadges({ history: [{ ...entry, created_at: new Date().toISOString() }, ...history] })
        const fresh = [...now].filter(id => !earnedBadgeIds.has(id))
        if (fresh.length) {
          setSessionBadges(BADGES.filter(b => fresh.includes(b.id)))
          setEarnedBadgeIds(new Set([...earnedBadgeIds, ...fresh]))
          awardBadges(fresh).catch(() => {})
        }
      }
    }
    setScreen('done')
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  if (screen === 'home') return (
    <HomeScreen
      ready={homeReady}
      history={history}
      customWorkouts={customWorkouts}
      planWorkout={planWorkout}
      planSchedule={planSchedule}
      onStart={startWorkout}
      onPlanStart={startPlanWorkout}
      onFreeStart={startFreeWorkout}
      onCreateNew={() => openBuilder()}
      onEdit={openBuilder}
      onDelete={handleDeleteWorkout}
      isPro={isPro}
      onUpgrade={onUpgrade}
      onOpenPage={onOpenPage}
    />
  )

  if (screen === 'builder') return (
    <BuilderScreen
      workout={editingWorkout}
      onSave={handleSaveWorkout}
      onBack={() => setScreen('home')}
    />
  )

  if (screen === 'config') return (
    <ConfigScreen
      exercises={activeExercises}
      free={freeWorkout}
      totalSets={totalSets} setTotalSets={setTotalSets}
      restDuration={restDuration} setRestDuration={setRestDuration}
      onBack={() => setScreen('home')}
      onBegin={() => {
        const t = Date.now()
        setExIdx(0); setSetIdx(0); setLoggedSets([])
        setWeight(''); setReps('')
        setStartTime(t)
        const nextScreen = freeWorkout ? 'exercise-picker' : 'training'
        localStorage.setItem('athrion_workout', JSON.stringify({
          screen: nextScreen,
          name: activeWorkoutName,
          exerciseNames: activeExercises.map(e => e.name),
          totalSets, restDuration,
          exIdx: 0, setIdx: 0, loggedSets: [], startTime: t,
          freeWorkout,
        }))
        setScreen(nextScreen)
      }}
    />
  )

  if (screen === 'exercise-picker') return (
    <ExercisePickerScreen
      activeExercises={activeExercises}
      loggedSets={loggedSets}
      onPick={ex => {
        const newExercises = [...activeExercises, ex]
        setActiveExercises(newExercises)
        const nextIdx = newExercises.length - 1
        setExIdx(nextIdx); setSetIdx(0); setWeight(''); setReps('')
        persistWorkout({ screen: 'training', exIdx: nextIdx, setIdx: 0, exerciseNames: newExercises.map(e => e.name) })
        setScreen('training')
      }}
      onEnd={handleEndWorkout}
    />
  )

  if (screen === 'training') return (
    <TrainingScreen
      exerciseHistory={exerciseHistory}
      exercises={activeExercises}
      exIdx={exIdx} setIdx={setIdx} totalSets={totalSets}
      loggedSets={loggedSets} weight={weight} setWeight={setWeight}
      reps={reps} setReps={setReps}
      freeWorkout={freeWorkout}
      onEnd={handleEndWorkout}
      onLog={() => {
        const w = parseFloat(weight) || 0
        const r = parseInt(reps) || 0
        const newLog = [...loggedSets, { ex: activeExercises[exIdx].name, set: setIdx + 1, weight: w, reps: r }]
        setLoggedSets(newLog)
        const thisRest = restPerExercise[exIdx] ?? restDuration
        localStorage.setItem('athrion_rest_end', String(Date.now() + thisRest * 1000))
        persistWorkout({ screen: 'rest', loggedSets: newLog })
        setScreen('rest')
      }}
    />
  )

  const currentRest = restPerExercise[exIdx] ?? restDuration

  if (screen === 'rest') return (
    <RestScreen
      exercises={activeExercises}
      restDuration={currentRest} exIdx={exIdx} setIdx={setIdx} totalSets={totalSets}
      freeWorkout={freeWorkout}
      onEnd={handleEndWorkout}
      onAdvance={() => {
        localStorage.removeItem('athrion_rest_end')
        const nextSet = setIdx + 1
        if (nextSet >= totalSets) {
          if (freeWorkout) {
            setSetIdx(0); setWeight(''); setReps('')
            persistWorkout({ screen: 'exercise-picker', setIdx: 0 })
            setScreen('exercise-picker')
          } else {
            const nextEx = exIdx + 1
            if (nextEx >= activeExercises.length) {
              handleEndWorkout()
            } else {
              setExIdx(nextEx); setSetIdx(0); setWeight(''); setReps('')
              persistWorkout({ screen: 'training', exIdx: nextEx, setIdx: 0 })
              setScreen('training')
            }
          }
        } else {
          setSetIdx(nextSet); setWeight(''); setReps('')
          persistWorkout({ screen: 'training', setIdx: nextSet })
          setScreen('training')
        }
      }}
    />
  )

  if (screen === 'done') return (
    <DoneScreen
      prs={sessionPRs}
      badges={sessionBadges}
      loggedSets={loggedSets}
      startTime={startTime}
      freeWorkout={freeWorkout}
      activeExercises={activeExercises}
      onSaveWorkout={handleSaveAsWorkout}
      onHome={() => { clearPersistedWorkout(); setScreen('home') }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────
// Plan workout days, starting with the next one after today
function upcomingWorkoutDays(schedule) {
  const order = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return (schedule ?? [])
    .filter(d => d.type === 'workout' && d.workout?.exercises?.length)
    .sort((a, b) => ((order.indexOf(a.day) - dayIdx + 7) % 7) - ((order.indexOf(b.day) - dayIdx + 7) % 7))
}

function HomeScreen({ ready, history, customWorkouts, planWorkout, planSchedule, onStart, onPlanStart, onFreeStart, onCreateNew, onEdit, onDelete, isPro, onUpgrade, onOpenPage }) {
  const [selectedSession, setSelectedSession] = useState(null)
  const weekSessions = history.filter(h => (Date.now() - new Date(h.date)) < 7 * 86400000).length
  const totalMins = history.reduce((a, h) => a + (parseInt(h.duration) || 0), 0)

  // AI plan (full dayData) takes priority; fall back to custom rotation, then default
  const rotation = [...customWorkouts].reverse()
  const rotationIdx = rotation.length > 0 ? history.length % rotation.length : 0
  const todayCustom = rotation.length > 0 ? rotation[rotationIdx] : null
  const fallbackExs = todayCustom
    ? (todayCustom.exercises || []).map(n => EXERCISES.find(e => e.name === n)).filter(Boolean)
    : getTodaysExercises()
  const fallbackName = todayCustom ? todayCustom.name : `${DAY_NAMES[dayIdx]} Workout`

  // A plan rest day stays a rest day here too; the person can still pick a plan workout
  const todayPlan = planSchedule?.find(d => d.day === TODAY_FULL) ?? null
  const isRestDay = !!todayPlan && todayPlan.type !== 'workout'
  const otherDays = isRestDay ? upcomingWorkoutDays(planSchedule) : []
  const [pickedDay, setPickedDay] = useState(null)
  const shownWorkout = isRestDay ? (pickedDay ?? otherDays[0] ?? null) : planWorkout

  const planExercises = shownWorkout?.workout?.exercises ?? []
  const planName = shownWorkout?.title ?? fallbackName

  const planSets = planExercises[0]?.sets ?? 3

  function handlePlanStart() {
    const mapped = matchPlanExercises(planExercises)
    const perExRest = planExercises.map(e => e.restSeconds ?? 60)
    onPlanStart(mapped, planName, planSets, perExRest)
  }

  return (
    <div className="space-y-4 py-4 slide-up">

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-200 mb-1">This week</div>
          <div className="font-bold text-3xl text-white">{weekSessions} <span className="text-base text-gray-400">sessions</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-200 mb-1">Total time</div>
          <div className="font-bold text-3xl text-white">{(totalMins / 60).toFixed(1)}<span className="text-base text-gray-400">h</span></div>
        </Card>
      </div>

      {/* ── Today's Training — neon border, plan data straight from AI ── */}
      {!ready ? (
        <div className="rounded-2xl border border-[#1e1e1e] bg-[#111] p-5 space-y-3 animate-pulse">
          <div className="h-3 w-24 bg-[#1e1e1e] rounded" />
          <div className="h-4 w-40 bg-[#1e1e1e] rounded" />
          {[0, 1, 2, 3].map(i => <div key={i} className="h-12 bg-[#1a1a1a] rounded-xl" />)}
          <div className="h-12 bg-[#1a1a1a] rounded-xl" />
        </div>
      ) : (
      <div className="rounded-2xl border border-neon/30">
        <div className="bg-[#111] rounded-2xl p-5">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-gray-200 mb-0.5">Today's training</div>
              <div className="font-bold text-base text-white">{isRestDay ? todayPlan.title : planWorkout ? planName : fallbackName}</div>
              {!isRestDay && planWorkout?.durationMinutes && (
                <div className="text-xs text-gray-400 mt-0.5">{planWorkout.durationMinutes} min · {planExercises.length} exercises</div>
              )}
            </div>
            {isRestDay && <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#222] text-gray-300 capitalize">{todayPlan.type.replace('_', ' ')}</span>}
          </div>

          {isRestDay && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 leading-relaxed">{todayPlan.recoveryNotes || 'Recovery is part of the plan. Your muscles grow while you rest.'}</p>
              {otherDays.length > 0 && (
                <>
                  <div className="text-xs text-gray-400 mt-4 mb-2">Want to train anyway?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {otherDays.map(d => (
                      <button key={d.day} onClick={() => setPickedDay(d)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all text-left ${shownWorkout === d ? 'bg-neon/15 text-neon border-neon/30' : 'bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:text-white'}`}>
                        <span className="font-semibold">{d.day.slice(0, 3)}</span> · {d.title}
                      </button>
                    ))}
                  </div>
                  {shownWorkout?.durationMinutes && (
                    <div className="text-xs text-gray-400 mt-2">{shownWorkout.durationMinutes} min · {planExercises.length} exercises</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Exercise list */}
          {shownWorkout ? (
            <div className="space-y-2 mb-5">
              {planExercises.map((ex, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#1a1a1a] rounded-xl px-3 py-2.5">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-gray-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white leading-snug break-words">{ex.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {[ex.sets > 1 ? `${ex.sets} sets × ${ex.reps}` : ex.reps,
                        ex.restSeconds > 0 && `${ex.restSeconds}s rest`,
                        ex.equipment].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <DemoButton name={ex.name} />
                </div>
              ))}
            </div>
          ) : !isRestDay && (
            <div className="space-y-1 mb-5">
              {fallbackExs.map((ex, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-[#1a1a1a] last:border-0">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{ex.name}</div>
                    <div className="text-xs text-gray-400">{ex.muscle}</div>
                  </div>
                  <DemoButton name={ex.name} />
                </div>
              ))}
            </div>
          )}

          {(!isRestDay || shownWorkout) && (
            <NeonBtn onClick={shownWorkout ? handlePlanStart : () => onStart(fallbackExs, fallbackName)} className="w-full">
              {isRestDay ? 'Train anyway' : 'Start workout'}
            </NeonBtn>
          )}
          <button
            onClick={onFreeStart}
            className="w-full mt-2.5 py-3 rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] text-gray-400 hover:text-white hover:border-[#444] text-sm font-semibold transition-all"
          >
            + Free workout
          </button>
        </div>
      </div>
      )}

      {/* ── More ways to train (live inside this tab) ── */}
      {onOpenPage && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'library', icon: 'mdi:book-open-variant', title: 'Exercise library', sub: 'Exercises and ready-made workouts' },
            { id: 'group', icon: 'mdi:account-group-outline', title: 'Train together', sub: 'Live session with friends' },
          ].map(l => (
            <button key={l.id} onClick={() => onOpenPage(l.id)}
              className="text-left bg-[#111] border border-[#222] hover:border-neon/30 rounded-2xl p-4 transition-colors">
              <Icon icon={l.icon} width={24} className="text-neon mb-2" />
              <div className="text-sm font-semibold text-white">{l.title}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-snug">{l.sub}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── My Workouts ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-200">My workouts</div>
          <div className="flex items-center gap-2">
            {!isPro && (
              <span className="text-xs text-gray-400 font-semibold">{customWorkouts.length}/{FREE_WORKOUT_LIMIT}</span>
            )}
            <button
              onClick={!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT ? onUpgrade : onCreateNew}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                !isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT
                  ? 'text-gray-400 border border-[#2a2a2a] bg-[#1a1a1a] hover:border-neon/30 hover:text-neon'
                  : 'text-neon border border-neon/30 bg-neon/10 hover:bg-neon/20'
              }`}
            >
              {!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT ? 'Upgrade' : '+ New'}
            </button>
          </div>
        </div>

        {customWorkouts.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-gray-400 text-sm mb-3">No custom workouts yet</div>
            <button onClick={onCreateNew} className="text-xs text-neon hover:text-white transition-colors">
              Create your first workout →
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {customWorkouts.map(w => {
              const exs = (w.exercises || []).map(n => EXERCISES.find(e => e.name === n)).filter(Boolean)
              return (
                <div key={w.id} className="flex items-center gap-3 bg-[#0d0d0d] rounded-xl px-3 py-2.5">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {exs.slice(0, 4).map((ex, i) => (
                      <Icon key={i} icon={getExerciseIcon(ex)} width={16} className="text-gray-400" />
                    ))}
                    {exs.length > 4 && <span className="text-[11px] text-gray-400 self-center ml-0.5">+{exs.length - 4}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs truncate">{w.name}</div>
                    <div className="text-xs text-gray-400">{exs.length} exercises</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => onEdit(w)} className="text-xs text-gray-400 hover:text-white transition-colors">Edit</button>
                    <button onClick={() => onDelete(w.id)} className="text-xs text-red-600 hover:text-red-400 transition-colors">Del</button>
                    <button
                      onClick={() => onStart(exs, w.name)}
                      className="bg-neon text-black font-bold py-1 px-3 rounded-lg text-xs transition-all"
                    >
                      Start
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Recent Sessions ── */}
      {history.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-200 mb-2">Recent sessions</div>
          <div className="grid grid-cols-[1fr_4rem_4rem] gap-2 px-2 pb-1 border-b border-[#1a1a1a]">
            <span className="text-[11px] text-gray-500">Workout</span>
            <span className="text-[11px] text-gray-500 text-right">Volume</span>
            <span className="text-[11px] text-gray-500 text-right">Time</span>
          </div>
          <div>
            {[...history].slice(0, 7).map((h, i) => (
              <button
                key={i}
                onClick={() => setSelectedSession(h)}
                className="w-full grid grid-cols-[1fr_4rem_4rem] gap-2 items-center px-2 py-1.5 hover:bg-[#1a1a1a] rounded-lg transition-colors text-left border-b border-[#111] last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium text-xs truncate">{h.name}</div>
                  <div className="text-xs text-gray-400">{h.date}</div>
                </div>
                <div className="text-right font-bold text-xs text-neon">{h.volume ? `${h.volume}lb` : '—'}</div>
                <div className="text-right text-xs text-gray-400">{h.duration}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {selectedSession && (
        <SessionModal session={selectedSession} onClose={() => setSelectedSession(null)} history={history} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Workout Builder
// ─────────────────────────────────────────────────────────────────────────────
function BuilderScreen({ workout, onSave, onBack }) {
  const [name, setName]       = useState(workout.name)
  const [selected, setSelected] = useState(workout.exercises || [])
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('All')
  const [saving, setSaving]   = useState(false)

  const muscles = ['All', ...new Set(EXERCISES.map(e => e.muscle))]
  const filtered = EXERCISES.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.muscle.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = filter === 'All' || e.muscle === filter
    return matchSearch && matchMuscle
  })

  function add(exName) {
    if (!selected.includes(exName)) setSelected(p => [...p, exName])
  }
  function remove(i) { setSelected(p => p.filter((_, idx) => idx !== i)) }
  function moveUp(i) {
    if (i === 0) return
    setSelected(p => { const a = [...p]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  }
  function moveDown(i) {
    setSelected(p => {
      if (i === p.length - 1) return p
      const a = [...p]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a
    })
  }

  async function handleSave() {
    if (!name.trim() || selected.length === 0) return
    setSaving(true)
    try { await onSave(name.trim(), selected) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3">← Back</button>
        <input
          className="w-full bg-transparent border-b border-[#333] focus:border-neon text-white text-2xl font-bold outline-none pb-1 placeholder-[#333] transition-colors"
          placeholder="WORKOUT NAME"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {/* Selected exercises */}
      {selected.length > 0 && (
        <Card className="p-4">
          <div className="text-xs text-gray-400 mb-3">
            Your Workout · {selected.length} exercise{selected.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {selected.map((exName, i) => {
              const ex = EXERCISES.find(e => e.name === exName)
              return (
                <div key={i} className="flex items-center gap-2 bg-[#0d0d0d] rounded-xl p-3">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{exName}</div>
                    <div className="text-xs text-gray-400">{ex?.muscle}</div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveUp(i)} disabled={i === 0}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-20 transition-colors text-sm"
                    >↑</button>
                    <button
                      onClick={() => moveDown(i)} disabled={i === selected.length - 1}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-20 transition-colors text-sm"
                    >↓</button>
                    <button
                      onClick={() => remove(i)}
                      className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors text-base"
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Save button */}
      {selected.length > 0 && name.trim() && (
        <NeonBtn onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : workout.id ? 'Save changes' : 'Create workout'}
        </NeonBtn>
      )}

      {/* Exercise library */}
      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-200 mb-3">Exercise library</div>
        <input
          className="w-full bg-[#0d0d0d] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search by name or muscle..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {/* Muscle filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {muscles.map(m => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                filter === m ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const added = selected.includes(ex.name)
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0d0d]">
                <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-gray-400">{ex.muscle} · {ex.equipment}</div>
                </div>
                <button
                  onClick={() => add(ex.name)}
                  disabled={added}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    added
                      ? 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] cursor-default'
                      : 'bg-neon text-black'
                  }`}
                >
                  {added ? '✓' : '+ Add'}
                </button>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
function ConfigScreen({ exercises, free, totalSets, setTotalSets, restDuration, setRestDuration, onBack, onBegin }) {
  return (
    <div className="space-y-4 py-4 slide-up">
      <div>
        <button onClick={onBack} className="text-gray-400 text-sm hover:text-white transition-colors mb-3">← Back</button>
        <div className="font-bold text-3xl">{free ? 'Free workout' : 'Configure workout'}</div>
        {free && <div className="text-sm text-gray-400 mt-1">Pick exercises as you go</div>}
      </div>

      <Card className="p-5">
        <div className="text-sm font-semibold text-gray-200 mb-4">Sets per Exercise</div>
        <div className="flex gap-2">
          {[2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setTotalSets(n)}
              className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${totalSets === n ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'}`}>
              {n}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-semibold text-gray-200 mb-4">Rest duration</div>
        <div className="flex gap-2">
          {[30, 60, 90, 120].map(s => (
            <button key={s} onClick={() => setRestDuration(s)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${restDuration === s ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'}`}>
              {s}s
            </button>
          ))}
        </div>
      </Card>

      {!free && exercises.length > 0 && (
        <Card className="p-5">
          <div className="text-sm font-semibold text-gray-200 mb-3">Exercises</div>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#0d0d0d] rounded-xl p-3">
                <Icon icon={getExerciseIcon(ex)} width={24} className="flex-shrink-0 text-gray-400" />
                <div>
                  <div className="font-medium text-sm">{ex.name}</div>
                  <div className="text-xs text-gray-400">{ex.muscle} · {totalSets} sets</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <NeonBtn onClick={onBegin} className="w-full">{free ? 'Pick first exercise →' : 'Begin training →'}</NeonBtn>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────
function TrainingScreen({ exerciseHistory, exercises, exIdx, setIdx, totalSets, loggedSets, weight, setWeight, reps, setReps, onLog, onEnd, freeWorkout }) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showDemo, setShowDemo]     = useState(false)
  const ex = exercises[exIdx]
  const setsDone = freeWorkout
    ? loggedSets.length
    : (exIdx * totalSets + setIdx)
  const setsTotal = freeWorkout ? null : exercises.length * totalSets
  const progress = freeWorkout ? null : (setsDone / setsTotal) * 100
  const prev = loggedSets.filter(s => s.ex === ex.name).slice(-1)[0]
  const pastSessions = exerciseHistory?.[ex.name] ?? []
  const lastSession = pastSessions[pastSessions.length - 1]
  const records = pastSessions.length ? getRecords(pastSessions) : null
  const suggestion = suggestNext(pastSessions, parseRepRange(ex.reps))

  return (
    <div className="space-y-4 py-4 slide-in">
      {freeWorkout ? (
        <div className="flex justify-between text-xs text-gray-400">
          <span>Free workout</span>
          <span>{setsDone} sets logged</span>
        </div>
      ) : (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Exercise {exIdx + 1}/{exercises.length}</span>
            <span>{Math.round(progress)}% done</span>
          </div>
          <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
            <div className="h-full bg-neon rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="bg-[#0b0f00] border border-neon/30 rounded-2xl p-6 text-center">
        <div className="flex justify-center mb-3">
          <Icon icon={getExerciseIcon(ex)} width={56} className="text-neon/80" />
        </div>
        <div className="font-bold text-3xl mb-1">{ex.name}</div>
        <div className="text-gray-400 text-sm mb-1">{ex.muscle}</div>
        <div className="text-xs text-gray-400 italic">{ex.tips}</div>
        <button onClick={() => setShowDemo(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-neon border border-neon/30 px-3 py-1.5 rounded-lg hover:bg-neon/10">
          <Icon icon="mdi:play-circle-outline" width={16} /> How to
        </button>
        {showDemo && <ExerciseDemoSheet name={ex.name} onClose={() => setShowDemo(false)} />}
      </div>

      <Card className="p-4">
        <div className="text-xs text-gray-400 mb-3">Set {setIdx + 1} of {totalSets}</div>
        <div className="flex gap-2">
          {Array.from({ length: totalSets }, (_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-all duration-300 ${i < setIdx ? 'bg-neon' : i === setIdx ? 'bg-neon ring-pulse' : 'bg-[#222]'}`} />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-xs text-gray-400 mb-3">Log Set {setIdx + 1}</div>
        {prev && <div className="text-xs text-gray-400 mb-3">Previous set: {prev.weight}lb × {prev.reps} reps</div>}
        {!prev && suggestion && (
          <div className="mb-4 bg-neon/5 border border-neon/20 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-200">Try today</div>
                <div className="font-bold text-xl text-neon leading-tight">
                  {suggestion.weight > 0 ? `${suggestion.weight} lb × ${suggestion.reps}` : `${suggestion.reps} reps`}
                </div>
              </div>
              <button onClick={() => { setWeight(String(suggestion.weight)); setReps(String(suggestion.reps)) }}
                className="flex-shrink-0 text-xs font-semibold text-black bg-neon px-3 py-1.5 rounded-lg">
                Use
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1">{suggestion.reason}</div>
            <div className="text-xs text-gray-400 mt-1.5 flex flex-wrap gap-x-3">
              {lastSession && <span>Last: {lastSession.sets.map(st => `${st.weight}×${st.reps}`).join(', ')}</span>}
              {records?.maxWeight > 0 && <span>PR: {records.maxWeight} lb × {records.maxWeightReps}</span>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Weight (lb)</label>
            <input type="number" placeholder="0" value={weight} onChange={e => setWeight(e.target.value)} min="0" step="0.5"
              className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Reps</label>
            <input type="number" placeholder="0" value={reps} onChange={e => setReps(e.target.value)} min="1"
              className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          </div>
        </div>
        <NeonBtn onClick={onLog} className="w-full">Log set</NeonBtn>
      </Card>

      {confirmEnd ? (
        <div className="flex gap-3">
          <button onClick={() => setConfirmEnd(false)}
            className="flex-1 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 font-semibold text-sm transition-all hover:border-[#444]">
            Keep going
          </button>
          <button onClick={onEnd}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm transition-all hover:bg-red-500/30">
            End workout
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-400 py-2 transition-colors">
          End workout early
        </button>
      )}

      {!freeWorkout && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-200 mb-3">Queue</div>
          <div className="space-y-2">
            {exercises.map((e, i) => (
              <div key={i} className={`flex items-center gap-2 ${i < exIdx ? 'opacity-30' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i < exIdx ? 'bg-neon text-black' : i === exIdx ? 'border-2 border-neon text-neon' : 'border border-[#333] text-gray-400'
                }`}>
                  {i < exIdx ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${i === exIdx ? 'text-white font-medium' : 'text-gray-400'}`}>{e.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise Picker (free workout)
// ─────────────────────────────────────────────────────────────────────────────
function ExercisePickerScreen({ activeExercises, loggedSets, onPick, onEnd }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  const doneNames = new Set(activeExercises.map(e => e.name))
  const muscles   = ['All', ...new Set(EXERCISES.map(e => e.muscle))]
  const filtered  = EXERCISES.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.muscle.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = filter === 'All' || e.muscle === filter
    return matchSearch && matchMuscle
  })

  return (
    <div className="space-y-4 py-4 slide-up">
      <div>
        <div className="font-bold text-3xl">Choose exercise</div>
        <div className="text-sm text-gray-400 mt-1">
          {activeExercises.length === 0 ? 'Pick your first exercise' : `${loggedSets.length} sets logged · pick what's next`}
        </div>
      </div>

      {loggedSets.length > 0 && (
        <NeonBtn onClick={onEnd} className="w-full">Finish workout →</NeonBtn>
      )}

      <Card className="p-4">
        <input
          className="w-full bg-[#0d0d0d] border border-[#222] focus:border-neon text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search exercises..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {muscles.map(m => (
            <button key={m} onClick={() => setFilter(m)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                filter === m ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'
              }`}>
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const already = doneNames.has(ex.name)
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0d0d]">
                <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-gray-400">{ex.muscle} · {ex.equipment}</div>
                </div>
                {already && (
                  <span className="text-xs text-neon/50 flex-shrink-0">done</span>
                )}
                <button
                  onClick={() => onPick(ex)}
                  className="flex-shrink-0 bg-neon text-black font-bold px-3 py-1.5 rounded-lg text-xs transition-all">
                  Go →
                </button>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest
// ─────────────────────────────────────────────────────────────────────────────
function RestScreen({ exercises, restDuration, exIdx, setIdx, totalSets, onAdvance, onEnd, freeWorkout }) {
  const [restLeft, setRestLeft] = useState(() => {
    const end = parseInt(localStorage.getItem('athrion_rest_end') || '0')
    return end ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : restDuration
  })
  const [confirmEnd, setConfirmEnd] = useState(false)

  useEffect(() => {
    function tick() {
      const end = parseInt(localStorage.getItem('athrion_rest_end') || '0')
      if (!end) { onAdvance(); return }
      const left = Math.ceil((end - Date.now()) / 1000)
      if (left <= 0) { onAdvance(); return }
      setRestLeft(left)
    }
    const interval = setInterval(tick, 500)
    function handleVisibility() { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const nextSetIdx = setIdx + 1
  const isLastSet = nextSetIdx >= totalSets
  const isLastEx  = exIdx >= exercises.length - 1
  const nextLabel = freeWorkout
    ? (isLastSet ? 'Pick next exercise' : `Set ${nextSetIdx + 1} of ${totalSets}`)
    : isLastSet
      ? (isLastEx ? 'Finish workout' : `Next: ${exercises[exIdx + 1]?.name}`)
      : `Set ${nextSetIdx + 1} of ${totalSets}`
  const pct = Math.min(1, restLeft / restDuration) * 100
  const r = 68; const circ = 2 * Math.PI * r

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 fade-in">
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-200 mb-1">Rest</div>
        <div className="text-white font-medium">{exercises[exIdx].name} — Set {setIdx + 1} done ✓</div>
      </div>

      <div className="relative w-40 h-40">
        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} fill="none" stroke="#1e1e1e" strokeWidth="8"/>
          <circle cx="80" cy="80" r={r} fill="none" stroke="#C8F135" strokeWidth="8"
            strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s linear' }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-bold text-4xl text-neon leading-none">{fmtTime(restLeft)}</div>
          <div className="text-sm font-semibold text-gray-200">rest</div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-sm font-semibold text-gray-200 mb-1">Up next</div>
        <div className="font-bold text-lg">{nextLabel}</div>
      </div>

      <button onClick={onAdvance}
        className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#444] transition-all px-6 py-2.5 rounded-xl text-sm font-medium">
        Skip rest →
      </button>

      {confirmEnd ? (
        <div className="flex gap-3 w-full max-w-xs">
          <button onClick={() => setConfirmEnd(false)}
            className="flex-1 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 font-semibold text-sm transition-all hover:border-[#444]">
            Keep going
          </button>
          <button onClick={onEnd}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm transition-all hover:bg-red-500/30">
            End workout
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="text-xs text-gray-400 hover:text-gray-400 transition-colors">
          End workout early
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────────
function DoneScreen({ prs = [], badges = [], loggedSets, startTime, onHome, freeWorkout, activeExercises, onSaveWorkout }) {
  const duration = Math.round((Date.now() - startTime) / 60000)
  const volume   = loggedSets.reduce((a, s) => a + s.weight * s.reps, 0)

  // Unique exercises in the exact order they were first performed
  const uniqueExNames = []
  const seen = new Set()
  for (const s of loggedSets) {
    if (!seen.has(s.ex)) { seen.add(s.ex); uniqueExNames.push(s.ex) }
  }

  const [workoutName, setWorkoutName] = useState('My free workout')
  const [saveState, setSaveState]     = useState('idle') // idle | saving | saved

  async function handleSave() {
    if (!workoutName.trim()) return
    setSaveState('saving')
    try {
      await onSaveWorkout(workoutName.trim(), uniqueExNames)
      setSaveState('saved')
    } catch {
      setSaveState('idle')
    }
  }

  return (
    <div className="flex flex-col items-center text-center space-y-5 py-6 slide-up">
      <Icon icon="mdi:trophy-outline" width={56} className="mx-auto text-neon" />
      <div>
        <div className="font-bold text-3xl text-neon">Workout complete</div>
        <div className="text-gray-400 mt-1">Great session, keep it up!</div>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        {[['Duration', `${duration}m`], ['Volume', `${volume}lb`], ['Sets', loggedSets.length]].map(([l, v]) => (
          <Card key={l} className="p-4">
            <div className="text-xs text-gray-400 mb-1">{l}</div>
            <div className="font-bold text-xl">{v}</div>
          </Card>
        ))}
      </div>

      {badges.length > 0 && (
        <Card className="p-5 w-full text-left border-neon/30">
          <div className="text-xs text-neon mb-3">Badge unlocked</div>
          <div className="space-y-3">
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-3">
                <Icon icon={b.icon} width={32} className="text-neon flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-white">{b.name}</div>
                  <div className="text-xs text-gray-400">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {prs.length > 0 && (
        <Card className="p-5 w-full text-left border-neon/30">
          <div className="text-xs text-neon mb-3">New personal records</div>
          <div className="space-y-2">
            {prs.map((pr, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white break-words">{pr.name}</div>
                  <div className="text-xs text-gray-400">{pr.type}</div>
                </div>
                <div className="font-bold text-lg text-neon flex-shrink-0">{pr.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Save as custom workout — only for free workouts with exercises */}
      {freeWorkout && uniqueExNames.length > 0 && (
        <Card className="p-5 w-full text-left">
          <div className="text-sm font-semibold text-gray-200 mb-3">Save as Workout</div>

          {saveState === 'saved' ? (
            <div className="flex items-center gap-2 py-2 text-neon text-sm font-semibold">
              <span>✓</span>
              <span>"{workoutName}" saved to My Workouts</span>
            </div>
          ) : (
            <>
              <input
                className="w-full bg-transparent border-b border-[#333] focus:border-neon text-white font-bold text-xl outline-none pb-1 placeholder-[#333] transition-colors mb-4"
                placeholder="WORKOUT NAME"
                value={workoutName}
                onChange={e => setWorkoutName(e.target.value)}
              />
              <div className="space-y-1.5 mb-4">
                {uniqueExNames.map((name, i) => {
                  const ex = EXERCISES.find(e => e.name === name)
                  return (
                    <div key={i} className="flex items-center gap-2.5 py-1 border-b border-[#1a1a1a] last:border-0">
                      <span className="text-xs text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                      <Icon icon={getExerciseIcon(ex)} width={18} className="flex-shrink-0 text-gray-400" />
                      <span className="text-sm text-gray-300">{name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{ex?.muscle}</span>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={handleSave}
                disabled={saveState === 'saving' || !workoutName.trim()}
                className="w-full py-3 rounded-xl border border-neon/30 bg-neon/8 text-neon font-semibold text-sm hover:bg-neon/15 transition-all disabled:opacity-40">
                {saveState === 'saving' ? 'Saving...' : `Save "${workoutName || '...'}" →`}
              </button>
            </>
          )}
        </Card>
      )}

      <Card className="p-5 w-full text-left">
        <div className="text-sm font-semibold text-gray-200 mb-3">Set log</div>
        <div className="space-y-1">
          {loggedSets.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-[#1a1a1a] last:border-0">
              <div>
                <span className="font-medium text-sm">{s.ex}</span>
                <span className="text-gray-400 text-xs ml-2">Set {s.set}</span>
              </div>
              <div className="text-sm font-bold text-neon">{s.weight}lb × {s.reps}</div>
            </div>
          ))}
        </div>
      </Card>

      <NeonBtn onClick={onHome} className="w-full">Back to home</NeonBtn>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function generateAdvice(comparisons) {
  const withPrev = comparisons.filter(c => c.pct !== null)
  if (!withPrev.length) return null

  const improved = withPrev.filter(c => c.pct > 0).sort((a, b) => b.pct - a.pct)
  const declined = withPrev.filter(c => c.pct < 0).sort((a, b) => a.pct - b.pct)
  const overallPct = Math.round(withPrev.reduce((a, c) => a + c.pct, 0) / withPrev.length)

  const parts = []

  if (improved.length === withPrev.length) {
    parts.push(overallPct > 10
      ? `You lifted heavier on every exercise — ${overallPct}% more weight on average. Outstanding!`
      : `Weights up across every exercise. Consistent strength progression.`)
  } else if (declined.length === withPrev.length) {
    parts.push('Weights were lighter across the board — normal after a hard week. Focus on sleep and nutrition.')
  } else {
    if (improved[0]) parts.push(`${improved[0].name} avg weight up ${improved[0].pct}% — ${improved[0].pct >= 15 ? 'excellent strength gain!' : 'keep building.'}`)
    if (declined[0]) parts.push(`${declined[0].name} weights were down — hit it first next session when you're freshest.`)
  }

  if (overallPct > 15) {
    parts.push('Big load jump — prioritize 8h sleep and 30g+ protein tonight to lock in the gains.')
  } else if (overallPct < -10) {
    parts.push('Drop 5–10 lb on lagging exercises and focus on clean reps before adding weight back.')
  } else if (improved.length > 0 && overallPct >= 0) {
    parts.push('To keep progressing, try adding 5 lb to your best exercise next session.')
  }

  return parts.slice(0, 2).join(' ')
}

function SessionModal({ session, onClose, history }) {
  const sets = session.sets || []

  const byExercise = sets.reduce((acc, s) => {
    if (!acc[s.ex]) acc[s.ex] = []
    acc[s.ex].push(s)
    return acc
  }, {})

  const totalVolume = sets.reduce((a, s) => a + s.weight * s.reps, 0)

  // Find previous session with the same workout name (history is newest-first)
  const sameWorkouts = (history || []).filter(h => h.name === session.name)
  const currentIdx = sameWorkouts.findIndex(h => h.id === session.id)
  const prevSession = currentIdx !== -1 ? sameWorkouts[currentIdx + 1] : null

  const prevByEx = prevSession
    ? (prevSession.sets || []).reduce((acc, s) => {
        if (!acc[s.ex]) acc[s.ex] = []
        acc[s.ex].push(s)
        return acc
      }, {})
    : null

  // Per-exercise comparison: avg weight per set + set-by-set rows
  const comparisons = Object.entries(byExercise).map(([name, exSets]) => {
    const prevSets = prevByEx?.[name] ?? null
    const curAvg = exSets.reduce((a, s) => a + s.weight, 0) / exSets.length
    const prevAvg = prevSets ? prevSets.reduce((a, s) => a + s.weight, 0) / prevSets.length : null
    const pct = prevAvg != null && prevAvg > 0 ? Math.round(((curAvg - prevAvg) / prevAvg) * 100) : null
    const setRows = exSets.map((s, i) => {
      const p = prevSets?.[i] ?? null
      return { set: i + 1, curWeight: s.weight, curReps: s.reps, prevWeight: p?.weight ?? null, prevReps: p?.reps ?? null, delta: p != null ? s.weight - p.weight : null }
    })
    return { name, curAvg, prevAvg, pct, setRows }
  })

  const advice = generateAdvice(comparisons)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-[#111] border border-[#222] rounded-t-3xl p-6 pb-10 max-h-[85vh] overflow-y-auto slide-up"
        onClick={e => e.stopPropagation()}
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="font-bold text-lg">{session.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{session.date} · {session.duration}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none mt-0.5"
          >×</button>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4 mb-5">
          {[
            ['Volume', `${totalVolume} lb`],
            ['Sets', sets.length],
            ['Exercises', Object.keys(byExercise).length],
          ].map(([label, val]) => (
            <div key={label} className="flex-1 bg-[#0d0d0d] rounded-xl p-3 text-center">
              <div className="font-bold text-xl text-neon">{val}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress vs previous session */}
        {prevSession ? (
          <div className="mb-6">
            <div className="text-xs text-gray-400 mb-3">
              vs {prevSession.date}
            </div>
            <div className="space-y-3">
              {comparisons.map(c => {
                const maxAvg = Math.max(c.curAvg, c.prevAvg ?? c.curAvg, 1)
                const curBarPct = Math.round((c.curAvg / maxAvg) * 100)
                const prevBarPct = c.prevAvg != null ? Math.round((c.prevAvg / maxAvg) * 100) : null
                const isUp = (c.pct ?? 0) >= 0
                const ex = EXERCISES.find(e => e.name === c.name)
                return (
                  <div key={c.name} className="bg-[#0d0d0d] rounded-xl overflow-hidden">
                    {/* Exercise header + bar */}
                    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                      <Icon icon={getExerciseIcon(ex)} width={15} className="flex-shrink-0 text-gray-400" />
                      <div className="font-semibold text-xs flex-1 truncate">{c.name}</div>
                      {c.pct !== null ? (
                        <div className={`text-xs font-bold flex-shrink-0 ${c.pct > 0 ? 'text-neon' : c.pct < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {c.pct > 0 ? '+' : ''}{c.pct}%
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-400 flex-shrink-0">new</div>
                      )}
                    </div>
                    <div className="h-1 bg-[#1a1a1a] mx-3 rounded-full overflow-hidden relative mb-1.5">
                      <div className="h-full rounded-full" style={{ width: `${curBarPct}%`, background: isUp ? '#C8F135' : '#ef4444' }} />
                      {prevBarPct != null && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white/40" style={{ left: `${prevBarPct}%` }} />
                      )}
                    </div>
                    {/* Per-set rows */}
                    <div className="grid grid-cols-[1.8rem_1fr_3rem] gap-1 px-3 pb-1 border-t border-[#1a1a1a]">
                      <span className="text-[11px] text-gray-500 pt-1.5">#</span>
                      <span className="text-[11px] text-gray-500 pt-1.5">Prev → Now</span>
                      <span className="text-[11px] text-gray-500 pt-1.5 text-right">Δ</span>
                    </div>
                    {c.setRows.map(row => (
                      <div key={row.set} className="grid grid-cols-[1.8rem_1fr_3rem] gap-1 items-center px-3 py-1 border-t border-[#141414] last:pb-2">
                        <span className="text-[11px] text-gray-400">{row.set}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">{row.prevWeight != null ? `${row.prevWeight}` : '—'}</span>
                          <span className="text-[11px] text-gray-500">→</span>
                          <span className="text-xs font-bold text-white">{row.curWeight}lb</span>
                          <span className="text-[11px] text-gray-400">×{row.curReps}</span>
                        </div>
                        <div className={`text-xs font-bold text-right ${row.delta > 0 ? 'text-neon' : row.delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {row.delta == null ? '' : row.delta === 0 ? '=' : `${row.delta > 0 ? '+' : ''}${row.delta}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {advice && (
              <div className="mt-3 p-3 bg-[#0a0a0a] border border-neon/20 rounded-xl">
                <div className="text-xs text-neon mb-1.5">Coach's tip</div>
                <div className="text-xs text-gray-300 leading-relaxed">{advice}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-5 p-3 bg-[#0d0d0d] rounded-xl text-center">
            <div className="text-xs text-gray-400">No previous session to compare — complete this workout again to see progress.</div>
          </div>
        )}

        {/* Set Details */}
        <div className="text-sm font-semibold text-gray-200 mb-2">Set log</div>
        <div className="bg-[#0d0d0d] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_3.5rem_3rem_3rem] gap-1 px-3 py-1.5 border-b border-[#1a1a1a]">
            <span className="text-[11px] text-gray-500">Exercise</span>
            <span className="text-[11px] text-gray-500 text-center">Set</span>
            <span className="text-[11px] text-gray-500 text-right">lbs</span>
            <span className="text-[11px] text-gray-500 text-right">Reps</span>
          </div>
          {Object.entries(byExercise).map(([exName, exSets]) => (
            exSets.map((s, i) => (
              <div key={`${exName}-${i}`} className="grid grid-cols-[1fr_3.5rem_3rem_3rem] gap-1 items-center px-3 py-1.5 border-b border-[#1a1a1a] last:border-0">
                <span className="text-xs text-gray-400 truncate">{i === 0 ? exName : ''}</span>
                <span className="text-xs text-gray-400 text-center">{i + 1}</span>
                <span className="text-xs font-bold text-right">{s.weight}</span>
                <span className="text-xs font-bold text-neon text-right">{s.reps}</span>
              </div>
            ))
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return <div className={`bg-[#111] border border-[#222] rounded-2xl ${className}`}>{children}</div>
}
function NeonBtn({ children, onClick, disabled = false, className = '' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`bg-neon text-black font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  )
}
