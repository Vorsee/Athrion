import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, Skeleton, Chip, Sheet, Segmented, InlineError, InfoButton, Fact } from '../components/ui/index.js'
import { EXERCISES, getTodaysExercises, todayKey, fmtTime, getExerciseIcon } from '../lib/data.js'
import { fetchWorkoutHistory, saveWorkoutEntry, fetchCustomWorkouts, saveCustomWorkout, deleteCustomWorkout } from '../lib/api.js'
import { fetchActivePlan } from '../lib/fitnessApi.js'
import { DemoButton, ExerciseDemoSheet } from '../components/ExerciseDemo.jsx'
import { buildExerciseHistory, getRecords, suggestNext, parseRepRange, findNewPRs } from '../lib/progress.js'
import { BADGES, computeEarnedBadges } from '../lib/badges.js'
import { fetchBadges, awardBadges } from '../lib/progressApi.js'
import { tok } from '../lib/tokens.js'
import { loadPending, queueWorkout, flushPending } from '../lib/pendingWorkouts.js'
import { useUnit } from '../lib/units.js'
import TrainingCalendar from '../components/TrainingCalendar.jsx'
import { useBackHandler, useFocusMode, notifySession, readSession, setSessionMinimised } from '../lib/shell.js'
import { HeaderBar } from '../components/Nav.jsx'

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

const SESSION_SCREENS = ['training', 'rest', 'exercise-picker']

export default function Workout({ pendingWorkout, onClearPending, isPro, onUpgrade, onOpenPage, resumeTick = 0 }) {
  const { unit, toLb } = useUnit()
  const [screen, setScreen]                   = useState('home')
  const [activeExercises, setActiveExercises] = useState([])
  const [activeWorkoutName, setActiveWorkoutName] = useState('')
  const [totalSets, setTotalSets]             = useState(3)
  const [setCounts, setSetCounts]             = useState([]) // per-exercise overrides of totalSets (sets added or skipped)
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
  const [lastSave, setLastSave]               = useState('saving') // saving | saved | queued, for the done screen
  const [pendingCount, setPendingCount]       = useState(() => loadPending().length)
  const [confirmEnd, setConfirmEnd]           = useState(false)

  // Training, rest and the free-workout picker are the session: focus mode hides the
  // tabs, and back (gesture or Minimise) drops to the Train tab with the session bar
  const inSession = SESSION_SCREENS.includes(screen)
  useFocusMode(inSession)
  useBackHandler(inSession, minimise)
  useBackHandler(screen === 'builder' || screen === 'config', () => setScreen('home'), 'Train')

  function minimise() {
    setConfirmEnd(false)
    setSessionMinimised(true)
    setScreen('home')
  }

  const exerciseHistory = useMemo(() => buildExerciseHistory(history), [history])

  // ── localStorage helpers ───────────────────────────────────────────────────
  function persistWorkout(overrides = {}) {
    const state = {
      screen: overrides.screen ?? screen,
      name: activeWorkoutName,
      exerciseNames: overrides.exerciseNames ?? activeExercises.map(e => e.name),
      exercises: overrides.exercises ?? activeExercises, // full objects: plan exercises aren't all in the library
      totalSets,
      restDuration,
      restPerExercise,
      exIdx: overrides.exIdx ?? exIdx,
      setIdx: overrides.setIdx ?? setIdx,
      loggedSets: overrides.loggedSets ?? loggedSets,
      setCounts: overrides.setCounts ?? setCounts,
      startTime,
      freeWorkout,
    }
    localStorage.setItem('athrion_workout', JSON.stringify(state))
  }
  function clearPersistedWorkout() {
    localStorage.removeItem('athrion_workout')
    localStorage.removeItem('athrion_rest_end')
    notifySession()
  }

  // The plan is Pro: a lapsed member's old plan would contradict the locked Plan tab.
  // isPro arrives after mount, so this follows it rather than reading it once.
  const [fetchedPlan, setFetchedPlan] = useState(null)
  useEffect(() => {
    const schedule = isPro ? fetchedPlan?.plan_data?.weeklySchedule : null
    setPlanSchedule(schedule ?? null)
    const todayDay = schedule?.find(d => d.day === TODAY_FULL)
    setPlanWorkout(todayDay?.type === 'workout' && todayDay.workout?.exercises?.length ? todayDay : null) // full dayData, same shape Plan.jsx uses
  }, [isPro, fetchedPlan])

  useEffect(() => {
    fetchBadges().then(b => setEarnedBadgeIds(new Set(b.map(x => x.badge_id)))).catch(() => {})

    // Today's workout depends on all three, so reveal it once they've all settled
    Promise.allSettled([
      fetchWorkoutHistory().then(h => setHistory([...loadPending().map(asPending), ...h])),
      fetchCustomWorkouts().then(w => setCustomWorkouts(w)),
      fetchActivePlan().then(plan => setFetchedPlan(plan ?? null)),
    ]).then(() => { setHomeReady(true); retryPending() })

    // Restore in-progress workout
    try {
      const raw = localStorage.getItem('athrion_workout')
      if (!raw) return
      const s = JSON.parse(raw)
      if (!s.startTime) return
      // Older saves only have names; a name the library doesn't know still comes back
      const exercises = s.exercises?.length
        ? s.exercises
        : (s.exerciseNames || []).map(n => EXERCISES.find(e => e.name === n) ?? { name: n, muscle: '', icon: 'mdi:dumbbell' })
      if (!s.freeWorkout && !exercises.length) return
      setActiveExercises(exercises)
      setActiveWorkoutName(s.name || '')
      setTotalSets(s.totalSets || 3)
      setRestDuration(s.restDuration || 60)
      setRestPerExercise(s.restPerExercise || [])
      setExIdx(s.exIdx || 0)
      setSetIdx(s.setIdx || 0)
      setLoggedSets(s.loggedSets || [])
      setSetCounts(s.setCounts || [])
      setStartTime(s.startTime)
      setFreeWorkout(s.freeWorkout || false)
      // A minimised session stays minimised: the session bar brings it back
      if (!s.minimised) setScreen(resumeScreen(s))
    } catch {}
  }, [])

  // Session bar tapped
  useEffect(() => {
    if (!resumeTick) return
    const s = readSession()
    if (s) setScreen(resumeScreen(s))
  }, [resumeTick])

  useEffect(() => {
    if (pendingWorkout?.planExercises?.length) {
      // From Plan: sets and rest come from the plan, so skip the config screen
      const pe = pendingWorkout.planExercises
      startPlanWorkout(matchPlanExercises(pe), pendingWorkout.name, pe[0]?.sets ?? 3, pe.map(e => e.restSeconds ?? 60))
      onClearPending?.()
    } else if (pendingWorkout?.exercises?.length) {
      startWorkout(pendingWorkout.exercises, pendingWorkout.name)
      onClearPending?.()
    }
  }, [pendingWorkout])

  function startWorkout(exercises, name) {
    setActiveExercises(exercises)
    setActiveWorkoutName(name)
    setRestPerExercise([])
    setExIdx(0); setSetIdx(0); setLoggedSets([]); setSetCounts([])
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
    setExIdx(0); setSetIdx(0); setLoggedSets([]); setSetCounts([])
    setWeight(''); setReps('')
    setStartTime(t)
    localStorage.setItem('athrion_workout', JSON.stringify({
      screen: 'training', name,
      exerciseNames: exercises.map(e => e.name),
      exercises,
      totalSets: sets, restDuration: perExRest[0] ?? 60, restPerExercise: perExRest,
      exIdx: 0, setIdx: 0, loggedSets: [], startTime: t, freeWorkout: false,
    }))
    notifySession()
    setScreen('training')
  }

  function startFreeWorkout() {
    setActiveExercises([])
    setActiveWorkoutName('Free workout')
    setExIdx(0); setSetIdx(0); setLoggedSets([]); setSetCounts([])
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

  // Retry when the connection comes back
  useEffect(() => {
    const onOnline = () => retryPending()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // history is newest-first; a workout that fails to save is queued on this device, never dropped
  async function saveHistory(entry) {
    setLastSave('saving')
    try {
      const saved = await saveWorkoutEntry(entry)
      setHistory(prev => [saved, ...prev])
      setLastSave('saved')
    } catch {
      const queued = { ...entry, created_at: new Date().toISOString() }
      queueWorkout(queued)
      setHistory(prev => [asPending(queued), ...prev])
      setPendingCount(loadPending().length)
      setLastSave('queued')
    }
  }

  async function retryPending() {
    if (!loadPending().length) return
    const { saved, left } = await flushPending(saveWorkoutEntry)
    setPendingCount(left)
    if (saved.length) setHistory(prev => [...loadPending().map(asPending), ...saved, ...prev.filter(h => !h.pending)])
    setLastSave(left ? 'queued' : 'saved')
  }

  async function handleSaveAsWorkout(name, exerciseNames) {
    if (!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT) {
      onUpgrade?.(); return
    }
    const saved = await saveCustomWorkout(name, exerciseNames, null)
    setCustomWorkouts(prev => [saved, ...prev])
  }

  function handleEndWorkout() {
    setConfirmEnd(false)
    clearPersistedWorkout()
    const duration = Math.round((Date.now() - startTime) / 60000)
    const volume = loggedSets.reduce((a, s) => a + s.weight * s.reps, 0)
    // Compare against history before this session is added to it
    setSessionPRs(findNewPRs(loggedSets, history, unit))
    setSessionBadges([])
    // Nothing worth saving (no sets, or a few seconds): no "Workout complete", just back home
    if (!(loggedSets.length > 0 && (duration >= 2 || volume >= 10))) {
      setScreen('home')
      return
    }
    {
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

  // ── Set and exercise controls ─────────────────────────────────────────────
  const setsFor = i => setCounts[i] ?? totalSets

  function goToNextExercise(counts = setCounts) {
    localStorage.removeItem('athrion_rest_end')
    setSetIdx(0); setWeight(''); setReps('')
    if (freeWorkout) {
      persistWorkout({ screen: 'exercise-picker', setIdx: 0, setCounts: counts })
      setScreen('exercise-picker')
      return
    }
    const nextEx = exIdx + 1
    if (nextEx >= activeExercises.length) return handleEndWorkout()
    setExIdx(nextEx)
    persistWorkout({ screen: 'training', exIdx: nextEx, setIdx: 0, setCounts: counts })
    setScreen('training')
  }

  function changeSetCount(next) {
    const counts = [...setCounts]
    counts[exIdx] = next
    setSetCounts(counts)
    return counts
  }

  function handleAddSet() {
    persistWorkout({ setCounts: changeSetCount(setsFor(exIdx) + 1) })
  }

  // Stop this exercise now: what was logged counts as done, the rest are skipped
  function handleFinishExercise() {
    const done = loggedSets.filter(s => s.ex === activeExercises[exIdx]?.name).length
    goToNextExercise(changeSetCount(done))
  }

  // i indexes loggedSets; weight comes in the person's unit
  function handleEditSet(i, { weight: w, reps: r }) {
    const next = loggedSets.map((s, j) => (j === i ? { ...s, weight: toLb(parseFloat(w) || 0), reps: parseInt(r) || 0 } : s))
    setLoggedSets(next)
    persistWorkout({ loggedSets: next })
  }

  function handleDeleteSet(i) {
    const ex = loggedSets[i].ex
    let n = 0
    const next = loggedSets.filter((_, j) => j !== i).map(s => (s.ex === ex ? { ...s, set: ++n } : s))
    setLoggedSets(next)
    const curName = activeExercises[exIdx]?.name
    const nextSetIdx = ex === curName ? n : setIdx
    setSetIdx(nextSetIdx)
    persistWorkout({ loggedSets: next, setIdx: nextSetIdx })
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
      pendingCount={pendingCount}
      onRetryPending={retryPending}
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
        setExIdx(0); setSetIdx(0); setLoggedSets([]); setSetCounts([])
        setWeight(''); setReps('')
        setStartTime(t)
        const nextScreen = freeWorkout ? 'exercise-picker' : 'training'
        localStorage.setItem('athrion_workout', JSON.stringify({
          screen: nextScreen,
          name: activeWorkoutName,
          exerciseNames: activeExercises.map(e => e.name),
          exercises: activeExercises,
          totalSets, restDuration,
          exIdx: 0, setIdx: 0, loggedSets: [], startTime: t,
          freeWorkout,
        }))
        notifySession()
        setScreen(nextScreen)
      }}
    />
  )

  const session = node => (
    <>
      <ActiveHeader startTime={startTime} onMinimise={minimise} onEnd={() => setConfirmEnd(true)} />
      {node}
      {confirmEnd && (
        <Sheet title="End workout?" onClose={() => setConfirmEnd(false)}>
          <p className="text-sm text-ink-2">
            {loggedSets.length ? `${loggedSets.length} ${loggedSets.length === 1 ? 'set' : 'sets'} logged so far. They'll be saved.` : 'No sets logged yet, so nothing will be saved.'}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmEnd(false)}>Keep going</Button>
            <Button variant="danger" className="flex-1" onClick={handleEndWorkout}>End workout</Button>
          </div>
        </Sheet>
      )}
    </>
  )

  if (screen === 'exercise-picker') return session(
    <ExercisePickerScreen
      activeExercises={activeExercises}
      loggedSets={loggedSets}
      onPick={ex => {
        const newExercises = [...activeExercises, ex]
        setActiveExercises(newExercises)
        const nextIdx = newExercises.length - 1
        setExIdx(nextIdx); setSetIdx(0); setWeight(''); setReps('')
        persistWorkout({ screen: 'training', exIdx: nextIdx, setIdx: 0, exerciseNames: newExercises.map(e => e.name), exercises: newExercises })
        setScreen('training')
      }}
      onEnd={handleEndWorkout}
    />
  )

  if (screen === 'training') return session(
    <TrainingScreen
      exerciseHistory={exerciseHistory}
      exercises={activeExercises}
      exIdx={exIdx} setIdx={setIdx} setsFor={setsFor}
      loggedSets={loggedSets} weight={weight} setWeight={setWeight}
      onAddSet={handleAddSet} onFinishExercise={handleFinishExercise}
      onEditSet={handleEditSet} onDeleteSet={handleDeleteSet}
      reps={reps} setReps={setReps}
      freeWorkout={freeWorkout}
      onLog={() => {
        const w = toLb(parseFloat(weight) || 0) // typed in the person's unit, stored in lb
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

  if (screen === 'rest') return session(
    <RestScreen
      exercises={activeExercises}
      restDuration={currentRest} exIdx={exIdx} setIdx={setIdx} totalSets={setsFor(exIdx)}
      freeWorkout={freeWorkout}
      onAdvance={() => {
        localStorage.removeItem('athrion_rest_end')
        const nextSet = setIdx + 1
        if (nextSet >= setsFor(exIdx)) {
          goToNextExercise()
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
      saveStatus={lastSave}
      onRetrySave={retryPending}
      onHome={() => { clearPersistedWorkout(); setScreen('home') }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────
// Plan workout days, starting with the next one after today
function resumeScreen(s) {
  return ['rest', 'exercise-picker'].includes(s.screen) ? s.screen : 'training'
}

// Session header: Minimise on the left, elapsed time in the middle, End on the right
function ActiveHeader({ startTime, onMinimise, onEnd }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const sec = startTime ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0
  const h = Math.floor(sec / 3600)
  const elapsed = h ? `${h}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : fmtTime(sec)
  return (
    <HeaderBar label="Workout">
      <div className="flex-1 flex">
        <button onClick={onMinimise}
          className="press flex items-center gap-1 min-h-[44px] pl-1 pr-3 rounded-xl text-sm font-medium text-ink-2 hover:text-ink transition-colors">
          <Icon icon="mdi:chevron-down" width={24} aria-hidden="true" />Minimise
        </button>
      </div>
      <div className="text-center">
        <div className="text-lg leading-none font-semibold text-ink tabular-nums" role="timer" aria-label={`Elapsed ${elapsed}`}>{elapsed}</div>
      </div>
      <div className="flex-1 flex justify-end">
        <Button variant="ghost" onClick={onEnd} className="px-4">End</Button>
      </div>
    </HeaderBar>
  )
}

function upcomingWorkoutDays(schedule) {
  const order = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return (schedule ?? [])
    .filter(d => d.type === 'workout' && d.workout?.exercises?.length)
    .sort((a, b) => ((order.indexOf(a.day) - dayIdx + 7) % 7) - ((order.indexOf(b.day) - dayIdx + 7) % 7))
}

function HomeScreen({ ready, history, customWorkouts, planWorkout, planSchedule, onStart, onPlanStart, onFreeStart, onCreateNew, onEdit, onDelete, isPro, onUpgrade, onOpenPage, pendingCount = 0, onRetryPending }) {
  const { fmtVolume } = useUnit()
  const [selectedSession, setSelectedSession] = useState(null)

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

      {pendingCount > 0 && (
        <InlineError onRetry={onRetryPending}>
          {pendingCount === 1 ? "1 workout isn't" : `${pendingCount} workouts aren't`} saved to your account yet. They're kept on this phone and will save when you're back online.
        </InlineError>
      )}

      {/* ── Today's Training — neon border, plan data straight from AI ── */}
      {!ready ? (
        <Card pad="lg" role="status" aria-label="Loading today's training" className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          <Skeleton className="h-12 rounded-xl" />
        </Card>
      ) : (
      <Card hero>

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neon-ink mb-1">Today's training</div>
              <div className="font-bold text-2xl text-ink leading-tight break-words">{isRestDay ? todayPlan.title : planWorkout ? planName : fallbackName}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {isRestDay
                  ? <Fact icon="mdi:sleep">{todayPlan.type.replace('_', ' ')}</Fact>
                  : <>
                      {planWorkout?.durationMinutes && <Fact icon="mdi:clock-outline">{planWorkout.durationMinutes} min</Fact>}
                      <Fact icon="mdi:dumbbell">{(shownWorkout ? planExercises : fallbackExs).length} exercises</Fact>
                    </>}
              </div>
            </div>
            {isRestDay && todayPlan.recoveryNotes && (
              <InfoButton title="Recovery"><p className="text-sm text-ink-2">{todayPlan.recoveryNotes}</p></InfoButton>
            )}
          </div>

          {isRestDay && (
            <div className="mb-4">
              {otherDays.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {otherDays.map(d => (
                      <button key={d.day} onClick={() => setPickedDay(d)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all text-left ${shownWorkout === d ? 'bg-neon/15 text-neon-ink border-neon-stroke/30' : 'bg-raised text-muted border-line-strong hover:text-ink'}`}>
                        <span className="font-semibold">{d.day.slice(0, 3)}</span> · {d.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Exercise list */}
          {shownWorkout ? (
            <div className="space-y-2 mb-5">
              {planExercises.map((ex, i) => (
                <div key={i} className="flex items-center gap-3 bg-raised rounded-xl px-3 py-2.5">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-neon-ink" aria-hidden="true" />
                  <div className="flex-1 min-w-0 text-sm font-semibold text-ink leading-snug break-words">{ex.name}</div>
                  <span className="text-sm font-bold text-neon-ink tabular-nums flex-shrink-0">{ex.sets > 1 ? `${ex.sets} × ${ex.reps}` : ex.reps}</span>
                  <DemoButton name={ex.name} />
                </div>
              ))}
            </div>
          ) : !isRestDay && (
            <div className="space-y-2 mb-5">
              {fallbackExs.map((ex, i) => (
                <div key={i} className="flex items-center gap-3 bg-raised rounded-xl px-3 py-2.5">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-neon-ink" aria-hidden="true" />
                  <div className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{ex.name}</div>
                  <DemoButton name={ex.name} />
                </div>
              ))}
            </div>
          )}

          {(!isRestDay || shownWorkout) && (
            <Button full onClick={shownWorkout ? handlePlanStart : () => onStart(fallbackExs, fallbackName)}>
              {isRestDay ? 'Train anyway' : 'Start workout'}
            </Button>
          )}
          <Button variant="ghost" full icon="mdi:plus" onClick={onFreeStart} className="mt-2">Free workout</Button>
      </Card>
      )}

      <TrainingCalendar history={history} planSchedule={planSchedule} onOpenSession={setSelectedSession} />

      {/* ── More ways to train (live inside this tab) ── */}
      {onOpenPage && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'library', icon: 'mdi:book-open-variant', title: 'Exercise library' },
            { id: 'group', icon: 'mdi:account-group-outline', title: 'Train together' },
          ].map(l => (
            <button key={l.id} onClick={() => onOpenPage(l.id)}
              className="text-left bg-surface border border-line hover:border-neon-stroke/30 rounded-2xl p-4 transition-colors">
              <Icon icon={l.icon} width={24} className="text-neon-ink mb-2" />
              <div className="text-sm font-semibold text-ink">{l.title}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── My Workouts ── */}
      <Card pad="lg">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg leading-[1.3] font-semibold text-ink">My workouts</div>
          <div className="flex items-center gap-2">
            {!isPro && (
              <span className="text-xs text-muted font-semibold">{customWorkouts.length}/{FREE_WORKOUT_LIMIT}</span>
            )}
            <button
              onClick={!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT ? onUpgrade : onCreateNew}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                !isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT
                  ? 'text-muted border border-line-strong bg-raised hover:border-neon-stroke/30 hover:text-neon-ink'
                  : 'text-neon-ink border border-neon-stroke/30 bg-neon/10 hover:bg-neon/20'
              }`}
            >
              {!isPro && customWorkouts.length >= FREE_WORKOUT_LIMIT ? 'Get Pro' : <span className="inline-flex items-center gap-1"><Icon icon="mdi:plus" width={14} />New</span>}
            </button>
          </div>
        </div>

        {customWorkouts.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-muted text-sm mb-3">No custom workouts yet</div>
            <button onClick={onCreateNew} className="text-xs text-neon-ink hover:text-ink transition-colors">
              Create your first workout
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {customWorkouts.map(w => {
              const exs = (w.exercises || []).map(n => EXERCISES.find(e => e.name === n)).filter(Boolean)
              return (
                <div key={w.id} className="flex items-center gap-3 bg-inset rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs truncate">{w.name}</div>
                    <div className="text-xs text-muted">{exs.length} exercises</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => onEdit(w)} className="press min-h-[36px] px-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors">Edit</button>
                    <button onClick={() => onDelete(w.id)} className="press min-h-[36px] px-1.5 text-xs font-semibold text-danger hover:underline transition-colors">Del</button>
                    <Button size="sm" onClick={() => onStart(exs, w.name)}>Start</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Recent Sessions ── */}
      {history.length > 0 && (
        <Card pad="md">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">Recent sessions</div>
          <div>
            {[...history].slice(0, 3).map((h, i) => (
              <button
                key={i}
                onClick={() => setSelectedSession(h)}
                className="w-full grid grid-cols-[1fr_4rem_4rem] gap-2 items-center px-2 py-1.5 hover:bg-raised rounded-lg transition-colors text-left border-b border-line last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium text-xs truncate">{h.name}</div>
                  <div className="text-xs text-muted">{fmtDay(h.date)}</div>
                </div>
                <div className="text-right font-bold text-xs text-neon-ink">{h.volume ? fmtVolume(h.volume) : '—'}</div>
                <div className="text-right text-xs text-muted">{h.duration}</div>
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
        <input
          className="w-full bg-transparent border-b border-line-strong focus:border-neon-stroke text-ink text-2xl font-bold outline-none pb-1 placeholder:text-placeholder transition-colors"
          placeholder="Workout name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {/* Selected exercises */}
      {selected.length > 0 && (
        <Card pad="md">
          <div className="text-xs text-muted mb-3">
            Your workout · {selected.length} exercise{selected.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {selected.map((exName, i) => {
              const ex = EXERCISES.find(e => e.name === exName)
              return (
                <div key={i} className="flex items-center gap-2 bg-inset rounded-xl p-3">
                  <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{exName}</div>
                    <div className="text-xs text-muted">{ex?.muscle}</div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveUp(i)} disabled={i === 0} aria-label={`Move ${exName} up`}
                      className="press w-9 h-9 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    ><Icon icon="mdi:chevron-up" width={20} /></button>
                    <button
                      onClick={() => moveDown(i)} disabled={i === selected.length - 1} aria-label={`Move ${exName} down`}
                      className="press w-9 h-9 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    ><Icon icon="mdi:chevron-down" width={20} /></button>
                    <button
                      onClick={() => remove(i)} aria-label={`Remove ${exName}`}
                      className="press w-9 h-9 rounded-md flex items-center justify-center text-danger hover:bg-danger/12 transition-colors"
                    ><Icon icon="mdi:close" width={18} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Save button */}
      {selected.length > 0 && name.trim() && (
        <Button full onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : workout.id ? 'Save changes' : 'Create workout'}
        </Button>
      )}

      {/* Exercise library */}
      <Card pad="md">
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Exercise library</div>
        <input
          className="w-full bg-inset border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search by name or muscle..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {/* Muscle filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {muscles.map(m => (
            <Chip key={m} selected={filter === m} onClick={() => setFilter(m)}>{m}</Chip>
          ))}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const added = selected.includes(ex.name)
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-inset">
                <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-muted">{ex.muscle} · {ex.equipment}</div>
                </div>
                <button
                  onClick={() => add(ex.name)}
                  disabled={added}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    added
                      ? 'bg-raised text-muted border border-line-strong cursor-default'
                      : 'bg-neon text-on-neon'
                  }`}
                >
                  {added
                    ? <Icon icon="mdi:check" width={16} aria-label="Added" />
                    : <span className="inline-flex items-center gap-1"><Icon icon="mdi:plus" width={14} />Add</span>}
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
        <div className="font-bold text-3xl">{free ? 'Free workout' : 'Configure workout'}</div>
        {free && <div className="text-sm text-muted mt-1">Pick exercises as you go</div>}
      </div>

      <Card pad="lg">
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-4">Sets per exercise</div>
        <Segmented options={[2, 3, 4, 5].map(n => [n, String(n)])} value={totalSets} onChange={setTotalSets} label="Sets per exercise" kind="choice" scroll={false} />
      </Card>

      <Card pad="lg">
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-4">Rest duration</div>
        <Segmented options={[30, 60, 90, 120].map(s => [s, `${s}s`])} value={restDuration} onChange={setRestDuration} label="Rest duration" kind="choice" scroll={false} />
      </Card>

      {!free && exercises.length > 0 && (
        <Card pad="lg">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Exercises</div>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 bg-inset rounded-xl p-3">
                <Icon icon={getExerciseIcon(ex)} width={24} className="flex-shrink-0 text-muted" />
                <div>
                  <div className="font-medium text-sm">{ex.name}</div>
                  <div className="text-xs text-muted">{ex.muscle} · {totalSets} sets</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Button full onClick={onBegin}>{free ? 'Pick first exercise' : 'Begin training'}</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────
function TrainingScreen({ exerciseHistory, exercises, exIdx, setIdx, setsFor, loggedSets, weight, setWeight, reps, setReps, onLog, freeWorkout, onAddSet, onFinishExercise, onEditSet, onDeleteSet }) {
  const [showDemo, setShowDemo]     = useState(false)
  const { unit, fromLb, fmt } = useUnit()
  const ex = exercises[exIdx]
  const setsDone = freeWorkout
    ? loggedSets.length
    : exercises.slice(0, exIdx).reduce((a, _, i) => a + setsFor(i), 0) + setIdx
  const setsTotal = freeWorkout ? null : exercises.reduce((a, _, i) => a + setsFor(i), 0)
  const totalSets = setsFor(exIdx)
  const thisExSets = loggedSets.map((s, i) => ({ ...s, i })).filter(s => s.ex === ex.name)
  const progress = freeWorkout ? null : (setsDone / setsTotal) * 100
  const prev = loggedSets.filter(s => s.ex === ex.name).slice(-1)[0]
  const pastSessions = exerciseHistory?.[ex.name] ?? []
  const lastSession = pastSessions[pastSessions.length - 1]
  const records = pastSessions.length ? getRecords(pastSessions) : null
  const suggestion = suggestNext(pastSessions, { ...parseRepRange(ex.reps), unit })

  return (
    <div className="space-y-4 py-4 slide-in">
      {freeWorkout ? (
        <div className="flex justify-between text-xs text-muted">
          <span>Free workout</span>
          <span>{setsDone} sets logged</span>
        </div>
      ) : (
        <div>
          <div className="flex justify-between text-xs text-muted mb-2">
            <span>Exercise {exIdx + 1}/{exercises.length}</span>
            <span>{Math.round(progress)}% done</span>
          </div>
          <div className="h-1 bg-raised rounded-full overflow-hidden">
            <div className="h-full bg-neon rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="bg-neon-tint border border-neon-stroke/30 rounded-2xl p-6 text-center">
        <div className="flex justify-center mb-3">
          <Icon icon={getExerciseIcon(ex)} width={56} className="text-neon-ink/80" />
        </div>
        <div className="font-bold text-3xl mb-1">{ex.name}</div>
        <div className="text-muted text-sm mb-1">{ex.muscle}</div>
        <button onClick={() => setShowDemo(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-neon-ink border border-neon-stroke/30 px-3 py-1.5 rounded-lg hover:bg-neon/10">
          <Icon icon="mdi:play-circle-outline" width={16} /> How to
        </button>
        {showDemo && <ExerciseDemoSheet name={ex.name} onClose={() => setShowDemo(false)} />}
      </div>

      <Card pad="md">
        <div className="text-xs text-muted mb-3">Set {setIdx + 1} of {totalSets}</div>
        <div className="flex gap-2">
          {Array.from({ length: totalSets }, (_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-all duration-300 ${i < setIdx ? 'bg-neon' : i === setIdx ? 'bg-neon ring-2 ring-inset ring-ink' : 'bg-line'}`} />
          ))}
        </div>
      </Card>

      <Card pad="lg">
        <div className="text-xs text-muted mb-3">Log set {setIdx + 1}</div>
        {!prev && suggestion && (
          <div className="mb-4 bg-neon/5 border border-neon-stroke/20 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-2">Try today</div>
                <div className="font-bold text-xl text-neon-ink leading-tight">
                  {suggestion.weight > 0 ? `${fmt(suggestion.weight)} × ${suggestion.reps}` : `${suggestion.reps} reps`}
                </div>
              </div>
              <button onClick={() => { setWeight(String(fromLb(suggestion.weight))); setReps(String(suggestion.reps)) }}
                className="flex-shrink-0 text-xs font-semibold text-on-neon bg-neon px-3 py-1.5 rounded-lg">
                Use
              </button>
            </div>
            <div className="text-xs text-muted mt-1">{suggestion.reason}</div>
            <div className="text-xs text-muted mt-1.5 flex flex-wrap gap-x-3">
              {lastSession && <span>Last: {lastSession.sets.map(st => `${fromLb(st.weight)}×${st.reps}`).join(', ')}</span>}
              {records?.maxWeight > 0 && <span>PR: {fmt(records.maxWeight)} × {records.maxWeightReps}</span>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted block mb-1">Weight ({unit})</label>
            <input type="number" placeholder="0" aria-label={`Weight in ${unit}`} value={weight} onChange={e => setWeight(e.target.value)} min="0" step={unit === 'kg' ? 0.25 : 0.5}
              className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Reps</label>
            <input type="number" placeholder="0" aria-label="Reps" value={reps} onChange={e => setReps(e.target.value)} min="1"
              className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          </div>
        </div>
        <Button full onClick={onLog}>Log set</Button>
        <div className="flex gap-2 mt-3">
          <Button variant="secondary" size="sm" icon="mdi:plus" className="flex-1" onClick={onAddSet}>Add a set</Button>
          <Button variant="secondary" size="sm" iconRight="mdi:skip-next" className="flex-1" onClick={onFinishExercise}>
            {thisExSets.length ? (freeWorkout ? 'Next exercise' : 'Finish exercise') : 'Skip exercise'}
          </Button>
        </div>
      </Card>

      {thisExSets.length > 0 && (
        <LoggedSets sets={thisExSets} onEdit={onEditSet} onDelete={onDeleteSet} />
      )}

      {!freeWorkout && (
        <Card pad="md">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Queue</div>
          <div className="space-y-2">
            {exercises.map((e, i) => (
              <div key={i} className={`flex items-center gap-2 ${i < exIdx ? 'opacity-30' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i < exIdx ? 'bg-neon text-on-neon' : i === exIdx ? 'border-2 border-neon-stroke text-neon-ink' : 'border border-line-strong text-muted'
                }`}>
                  {i < exIdx ? <Icon icon="mdi:check" width={14} aria-label="Done" /> : i + 1}
                </div>
                <span className={`text-sm ${i === exIdx ? 'text-ink font-medium' : 'text-muted'}`}>{e.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// Sets logged for the current exercise; each can be corrected or removed
function LoggedSets({ sets, onEdit, onDelete }) {
  const { unit, fromLb, fmt } = useUnit()
  const [editing, setEditing] = useState(null) // index into loggedSets
  const [draft, setDraft] = useState({ weight: '', reps: '' })
  const field = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink rounded-lg px-3 py-2 text-sm outline-none'

  return (
    <Card pad="md">
      <div className="text-sm font-semibold text-ink-2 mb-2">Logged this exercise</div>
      <ul className="divide-y divide-line">
        {sets.map(s => (
          <li key={s.i} className="py-2">
            {editing === s.i ? (
              <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); onEdit(s.i, draft); setEditing(null) }}>
                <label className="flex-1 text-xs text-muted">Weight ({unit})
                  <input type="number" min="0" step={unit === 'kg' ? 0.25 : 0.5} value={draft.weight} autoFocus
                    onChange={e => setDraft(d => ({ ...d, weight: e.target.value }))} className={`${field} mt-1`} />
                </label>
                <label className="flex-1 text-xs text-muted">Reps
                  <input type="number" min="1" value={draft.reps}
                    onChange={e => setDraft(d => ({ ...d, reps: e.target.value }))} className={`${field} mt-1`} />
                </label>
                <Button size="sm" type="submit">Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted w-12 flex-shrink-0">Set {s.set}</span>
                <span className="flex-1 text-sm font-semibold text-ink">{s.weight > 0 ? `${fmt(s.weight)} × ${s.reps}` : `${s.reps} reps`}</span>
                <button aria-label={`Edit set ${s.set}`} onClick={() => { setDraft({ weight: String(fromLb(s.weight)), reps: String(s.reps) }); setEditing(s.i) }}
                  className="press w-11 h-11 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-raised">
                  <Icon icon="mdi:pencil-outline" width={18} />
                </button>
                <button aria-label={`Delete set ${s.set}`} onClick={() => onDelete(s.i)}
                  className="press w-11 h-11 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-raised">
                  <Icon icon="mdi:trash-can-outline" width={18} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
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
        <div className="text-sm text-muted mt-1">
          {activeExercises.length === 0 ? 'Pick your first exercise' : `${loggedSets.length} sets logged · pick what's next`}
        </div>
      </div>

      {loggedSets.length > 0 && (
        <Button full onClick={onEnd}>Finish workout</Button>
      )}

      <Card pad="md">
        <input
          className="w-full bg-inset border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search exercises..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {muscles.map(m => (
            <Chip key={m} selected={filter === m} onClick={() => setFilter(m)}>{m}</Chip>
          ))}
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const already = doneNames.has(ex.name)
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-inset">
                <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-muted">{ex.muscle} · {ex.equipment}</div>
                </div>
                {already && (
                  <span className="text-xs text-neon-ink/50 flex-shrink-0">done</span>
                )}
                <Button
                  onClick={() => onPick(ex)}>
                  Go
                </Button>
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
function RestScreen({ exercises, restDuration, exIdx, setIdx, totalSets, onAdvance, freeWorkout }) {
  const [restLeft, setRestLeft] = useState(() => {
    const end = parseInt(localStorage.getItem('athrion_rest_end') || '0')
    return end ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : restDuration
  })

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
        <div className="text-sm font-semibold text-ink-2 mb-1">Rest</div>
        <div className="text-ink font-medium flex items-center justify-center gap-1.5">
          <Icon icon="mdi:check-circle-outline" width={18} className="text-neon-ink flex-shrink-0" />
          {exercises[exIdx].name}, set {setIdx + 1} done
        </div>
      </div>

      <div className="relative w-40 h-40">
        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} fill="none" className="stroke-line" strokeWidth="8"/>
          <circle cx="80" cy="80" r={r} fill="none" className="stroke-neon-stroke" strokeWidth="8"
            strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s linear' }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-bold text-4xl text-neon-ink leading-none tabular-nums">{fmtTime(restLeft)}</div>
          <div className="text-xs font-medium text-muted">rest</div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-sm font-semibold text-ink-2 mb-1">Up next</div>
        <div className="font-bold text-lg">{nextLabel}</div>
      </div>

      <Button variant="secondary" onClick={onAdvance}>Skip rest</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────────
function DoneScreen({ prs = [], badges = [], loggedSets, startTime, onHome, freeWorkout, activeExercises, onSaveWorkout, saveStatus, onRetrySave }) {
  const { fmt, fmtVolume } = useUnit()
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
      <Icon icon="mdi:trophy-outline" width={56} className="mx-auto text-neon-ink" />
      <div>
        <div className="font-bold text-3xl text-neon-ink">Workout complete</div>
      </div>

      {saveStatus === 'queued' && (
        <InlineError onRetry={onRetrySave} className="w-full text-left">
          This workout isn't saved to your account yet. It's kept on this phone and will save when you're back online.
        </InlineError>
      )}

      <div className="grid grid-cols-3 gap-3 w-full">
        {[['Duration', `${duration}m`], ['Volume', fmtVolume(volume)], ['Sets', loggedSets.length]].map(([l, v]) => (
          <Card key={l}>
            <div className="text-xs text-muted mb-1">{l}</div>
            <div className="font-bold text-xl">{v}</div>
          </Card>
        ))}
      </div>

      {badges.length > 0 && (
        <Card pad="lg" tone="neon" className="w-full text-left">
          <div className="text-xs text-neon-ink mb-3">Badge unlocked</div>
          <div className="space-y-3">
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-3">
                <Icon icon={b.icon} width={32} className="text-neon-ink flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-ink">{b.name}</div>
                  <div className="text-xs text-muted">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {prs.length > 0 && (
        <Card pad="lg" tone="neon" className="w-full text-left">
          <div className="text-xs text-neon-ink mb-3">New personal records</div>
          <div className="space-y-2">
            {prs.map((pr, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink break-words">{pr.name}</div>
                  <div className="text-xs text-muted">{pr.type}</div>
                </div>
                <div className="font-bold text-lg text-neon-ink flex-shrink-0">{pr.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Save as custom workout — only for free workouts with exercises */}
      {freeWorkout && uniqueExNames.length > 0 && (
        <Card pad="lg" className="w-full text-left">
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Save as workout</div>

          {saveState === 'saved' ? (
            <div className="flex items-center gap-2 py-2 text-neon-ink text-sm font-semibold">
              <Icon icon="mdi:check-circle-outline" width={18} />
              <span>"{workoutName}" saved to My workouts</span>
            </div>
          ) : (
            <>
              <input
                className="w-full bg-transparent border-b border-line-strong focus:border-neon-stroke text-ink font-bold text-xl outline-none pb-1 placeholder:text-placeholder transition-colors mb-4"
                placeholder="Workout name"
                value={workoutName}
                onChange={e => setWorkoutName(e.target.value)}
              />
              <div className="space-y-1.5 mb-4">
                {uniqueExNames.map((name, i) => {
                  const ex = EXERCISES.find(e => e.name === name)
                  return (
                    <div key={i} className="flex items-center gap-2.5 py-1 border-b border-line last:border-0">
                      <span className="text-xs text-muted w-4 flex-shrink-0">{i + 1}</span>
                      <Icon icon={getExerciseIcon(ex)} width={18} className="flex-shrink-0 text-muted" />
                      <span className="text-sm text-ink-2">{name}</span>
                      <span className="text-xs text-muted ml-auto">{ex?.muscle}</span>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={handleSave}
                disabled={saveState === 'saving' || !workoutName.trim()}
                className="w-full py-3 rounded-xl border border-neon-stroke/30 bg-neon/8 text-neon-ink font-semibold text-sm hover:bg-neon/15 transition-all disabled:opacity-40">
                {saveState === 'saving' ? 'Saving...' : `Save "${workoutName || '...'}"`}
              </button>
            </>
          )}
        </Card>
      )}

      <Card pad="lg" className="w-full text-left">
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Set log</div>
        <div className="space-y-1">
          {loggedSets.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-line last:border-0">
              <div>
                <span className="font-medium text-sm">{s.ex}</span>
                <span className="text-muted text-xs ml-2">Set {s.set}</span>
              </div>
              <div className="text-sm font-bold text-neon-ink">{fmt(s.weight)} × {s.reps}</div>
            </div>
          ))}
        </div>
      </Card>

      <Button full onClick={onHome}>Back to home</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function generateAdvice(comparisons, unit) {
  const withPrev = comparisons.filter(c => c.pct !== null)
  if (!withPrev.length) return null

  const improved = withPrev.filter(c => c.pct > 0).sort((a, b) => b.pct - a.pct)
  const declined = withPrev.filter(c => c.pct < 0).sort((a, b) => a.pct - b.pct)
  const overallPct = Math.round(withPrev.reduce((a, c) => a + c.pct, 0) / withPrev.length)

  const parts = []

  if (improved.length === withPrev.length) {
    parts.push(overallPct > 10
      ? `You lifted heavier on every exercise — ${overallPct}% more weight on average. Strong session.`
      : `Weights up across every exercise. Consistent strength progression.`)
  } else if (declined.length === withPrev.length) {
    parts.push('Weights were lighter across the board — normal after a hard week. Focus on sleep and nutrition.')
  } else {
    if (improved[0]) parts.push(`${improved[0].name} avg weight up ${improved[0].pct}% — ${improved[0].pct >= 15 ? 'a real strength gain.' : 'keep building.'}`)
    if (declined[0]) parts.push(`${declined[0].name} weights were down — hit it first next session when you're freshest.`)
  }

  if (overallPct > 15) {
    parts.push('Big load jump — prioritize 8h sleep and 30g+ protein tonight to lock in the gains.')
  } else if (overallPct < -10) {
    parts.push(`Drop ${unit === 'kg' ? '2.5–5 kg' : '5–10 lb'} on lagging exercises and focus on clean reps before adding weight back.`)
  } else if (improved.length > 0 && overallPct >= 0) {
    parts.push(`To keep progressing, try adding ${unit === 'kg' ? '2.5 kg' : '5 lb'} to your best exercise next session.`)
  }

  return parts.slice(0, 2).join(' ')
}

function SessionModal({ session, onClose, history }) {
  const { unit, fromLb, fmt, fmtVolume } = useUnit()
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

  const advice = generateAdvice(comparisons, unit)

  return (
    <Sheet title={session.name} onClose={onClose} bodyClassName="">
        <div className="text-xs text-muted -mt-1">{session.date} · {session.duration}</div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4 mb-5">
          {[
            ['Volume', fmtVolume(totalVolume)],
            ['Sets', sets.length],
            ['Exercises', Object.keys(byExercise).length],
          ].map(([label, val]) => (
            <div key={label} className="flex-1 bg-inset rounded-xl p-3 text-center">
              <div className="font-bold text-xl text-neon-ink">{val}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress vs previous session */}
        {prevSession ? (
          <div className="mb-6">
            <div className="text-xs text-muted mb-3">
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
                  <div key={c.name} className="bg-inset rounded-xl overflow-hidden">
                    {/* Exercise header + bar */}
                    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                      <Icon icon={getExerciseIcon(ex)} width={15} className="flex-shrink-0 text-muted" />
                      <div className="font-semibold text-xs flex-1 truncate">{c.name}</div>
                      {c.pct !== null ? (
                        <div className={`text-xs font-bold flex-shrink-0 ${c.pct > 0 ? 'text-neon-ink' : c.pct < 0 ? 'text-danger' : 'text-muted'}`}>
                          {c.pct > 0 ? '+' : ''}{c.pct}%
                        </div>
                      ) : (
                        <div className="text-2xs text-muted flex-shrink-0">new</div>
                      )}
                    </div>
                    <div className="h-1 bg-raised mx-3 rounded-full overflow-hidden relative mb-1.5">
                      <div className="h-full rounded-full" style={{ width: `${curBarPct}%`, background: isUp ? tok('neon-stroke') : tok('danger') }} />
                      {prevBarPct != null && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-ink/40" style={{ left: `${prevBarPct}%` }} />
                      )}
                    </div>
                    {/* Per-set rows */}
                    <div className="grid grid-cols-[1.8rem_1fr_3rem] gap-1 px-3 pb-1 border-t border-line">
                      <span className="text-2xs text-muted pt-1.5">#</span>
                      <span className="text-2xs text-muted pt-1.5 flex items-center gap-0.5">Prev <Icon icon="mdi:arrow-right" width={11} aria-hidden="true" /> now</span>
                      <span className="text-2xs text-muted pt-1.5 text-right">Change</span>
                    </div>
                    {c.setRows.map(row => (
                      <div key={row.set} className="grid grid-cols-[1.8rem_1fr_3rem] gap-1 items-center px-3 py-1 border-t border-line last:pb-2">
                        <span className="text-2xs text-muted">{row.set}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted">{row.prevWeight != null ? `${fromLb(row.prevWeight)}` : '—'}</span>
                          <Icon icon="mdi:arrow-right" width={12} className="text-muted" aria-label="to" />
                          <span className="text-xs font-bold text-ink">{fmt(row.curWeight)}</span>
                          <span className="text-2xs text-muted">×{row.curReps}</span>
                        </div>
                        <div className={`text-xs font-bold text-right ${row.delta > 0 ? 'text-neon-ink' : row.delta < 0 ? 'text-danger' : 'text-muted'}`}>
                          {row.delta == null ? '' : row.delta === 0 ? '=' : `${row.delta > 0 ? '+' : ''}${fromLb(row.delta)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {advice && (
              <div className="mt-3 p-3 bg-canvas border border-neon-stroke/20 rounded-xl">
                <div className="text-xs text-neon-ink mb-1.5">Coach's tip</div>
                <div className="text-xs text-ink-2 leading-relaxed">{advice}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-5 p-3 bg-inset rounded-xl text-center">
            <div className="text-xs text-muted">First time doing this workout.</div>
          </div>
        )}

        {/* Set Details */}
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">Set log</div>
        <div className="bg-inset rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_3.5rem_3rem_3rem] gap-1 px-3 py-1.5 border-b border-line">
            <span className="text-2xs text-muted">Exercise</span>
            <span className="text-2xs text-muted text-center">Set</span>
            <span className="text-2xs text-muted text-right">lbs</span>
            <span className="text-2xs text-muted text-right">Reps</span>
          </div>
          {Object.entries(byExercise).map(([exName, exSets]) => (
            exSets.map((s, i) => (
              <div key={`${exName}-${i}`} className="grid grid-cols-[1fr_3.5rem_3rem_3rem] gap-1 items-center px-3 py-1.5 border-b border-line last:border-0">
                <span className="text-xs text-muted truncate">{i === 0 ? exName : ''}</span>
                <span className="text-xs text-muted text-center">{i + 1}</span>
                <span className="text-xs font-bold text-right">{s.weight}</span>
                <span className="text-xs font-bold text-neon-ink text-right">{s.reps}</span>
              </div>
            ))
          ))}
        </div>
    </Sheet>
  )
}

function asPending(entry) {
  return { ...entry, pending: true }
}

// 'YYYY-MM-DD' -> "Today", "Yesterday" or "Tue, Oct 20"
function fmtDay(key) {
  if (key === todayKey()) return 'Today'
  const d = new Date(`${key}T12:00:00`)
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (key === `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
