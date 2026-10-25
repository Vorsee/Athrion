import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, Chip, Segmented, PageHeader, SectionTitle, Fact, IconButton, ExerciseRow, RankChip, SkeletonRows } from '../components/ui/index.js'
import { NicknameCard, LeaderboardTab, FriendsTab } from '../components/Social.jsx'
import { fetchMySocial, clearInvite } from '../lib/socialApi.js'
import { tok } from '../lib/tokens.js'
import { EXERCISES, MUSCLES, getExerciseIcon, todayKey } from '../lib/data.js'
import {
  createGroupSession,
  joinGroupSession,
  updateSessionExercises,
  updateExercisesOnly,
  fetchGroupSession,
  startGroupSession,
  endGroupSession,
  fetchParticipants,
  fetchGroupSets,
  logGroupSet,
  subscribeToGroupSession,
} from '../lib/groupApi.js'
import { saveWorkoutEntry } from '../lib/api.js'
import { useUnit } from '../lib/units.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildExerciseLeaderboard(allSets, exerciseName) {
  const byName = {}
  for (const s of allSets) {
    if (s.exercise !== exerciseName) continue
    if (!byName[s.display_name]) byName[s.display_name] = { name: s.display_name, volume: 0, sets: 0, latestSet: null }
    byName[s.display_name].volume += (s.weight || 0) * (s.reps || 0)
    byName[s.display_name].sets += 1
    byName[s.display_name].latestSet = s
  }
  return Object.values(byName).sort((a, b) => b.volume - a.volume)
}

function buildOverallLeaderboard(allSets) {
  const byName = {}
  for (const s of allSets) {
    if (!byName[s.display_name]) byName[s.display_name] = { name: s.display_name, volume: 0, setCount: 0 }
    byName[s.display_name].volume += (s.weight || 0) * (s.reps || 0)
    byName[s.display_name].setCount += 1
  }
  return Object.values(byName).sort((a, b) => b.volume - a.volume)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [['rooms', 'Rooms'], ['ranks', 'Leaderboard'], ['friends', 'Friends']]

// intent: { tab, invite } from App, e.g. after opening an athrion.app/add/<nickname> link
export default function Group({ session, intent, onIntentDone }) {
  const { toLb } = useUnit()
  const [screen, setScreen] = useState('home')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [loading, setLoading] = useState(false)
  const [groupSession, setGroupSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [allSets, setAllSets] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [exercises, setExercises] = useState([])
  const [totalSets, setTotalSets] = useState(3)
  const [restSecs, setRestSecs] = useState(60)
  const [exIdx, setExIdx] = useState(0)
  const [setIdx, setSetIdx] = useState(0)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [startTime, setStartTime] = useState(null)
  const [restLeft, setRestLeft] = useState(60)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [tab, setTab] = useState(intent?.tab || 'rooms')
  const [me, setMe] = useState(undefined) // undefined = loading, null = no nickname yet
  const [editingNick, setEditingNick] = useState(false)
  const [invite, setInvite] = useState(intent?.invite || null)
  // The name a room was joined with stays fixed for that room, even if the nickname changes
  const [roomName, setRoomName] = useState(null)

  useEffect(() => { fetchMySocial().then(setMe).catch(() => setMe(null)) }, [])
  useEffect(() => {
    if (intent?.tab) setTab(intent.tab)
    if (intent?.invite) setInvite(intent.invite)
  }, [intent])

  const displayName = roomName || me?.nickname || session?.name || 'You'
  // Ref so callbacks always see the current screen without stale closure
  const screenRef = useRef('home')

  function goScreen(s) { screenRef.current = s; setScreen(s) }
  // Back from the lobby leaves the room, as its Back button did
  useBackHandler(screen === 'lobby', () => handleHome(), 'Train together')

  function exNamesToObjs(names) {
    return (names || []).map(n => EXERCISES.find(e => e.name === n)).filter(Boolean)
  }

  const SESSION_PERSIST_KEY = 'athrion_group_session_state'

  // Restore session on mount (handles screen-off / phone locked / refresh)
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_PERSIST_KEY)
    if (!saved) return
    let state
    try { state = JSON.parse(saved) } catch { return }
    if (!state?.sessionId) return

    fetchGroupSession(state.sessionId).then(sess => {
      if (!sess || (sess.status !== 'active' && sess.status !== 'lobby')) {
        localStorage.removeItem(SESSION_PERSIST_KEY)
        return
      }
      setGroupSession(sess)
      if (state.name) setRoomName(state.name)
      setIsHost(state.isHost || false)
      setExIdx(state.exIdx || 0)
      setSetIdx(state.setIdx || 0)
      setStartTime(state.startTime || null)
      setExercises(exNamesToObjs(sess.exercises))
      setTotalSets(sess.total_sets || 3)
      setRestSecs(sess.rest_secs || 60)
      const target = state.screen && state.screen !== 'done' ? state.screen : (sess.status === 'lobby' ? 'lobby' : 'training')
      goScreen(target)
    }).catch(() => {
      localStorage.removeItem(SESSION_PERSIST_KEY)
    })
  }, [])

  // Persist session state so it survives screen-off / backgrounding
  useEffect(() => {
    if (!groupSession?.id || screen === 'home' || screen === 'done') return
    localStorage.setItem(SESSION_PERSIST_KEY, JSON.stringify({
      sessionId: groupSession.id,
      screen,
      isHost,
      exIdx,
      setIdx,
      startTime,
      name: displayName,
    }))
  }, [groupSession?.id, screen, isHost, exIdx, setIdx, startTime, displayName])

  // Realtime subscription
  useEffect(() => {
    if (!groupSession?.id) return

    fetchParticipants(groupSession.id).then(setParticipants).catch(() => {})
    fetchGroupSets(groupSession.id).then(setAllSets).catch(() => {})

    const unsub = subscribeToGroupSession(groupSession.id, {
      onSet: (row) => setAllSets(prev => [...prev, row]),
      onParticipant: (row) => {
        setParticipants(prev =>
          prev.some(p => p.user_id === row.user_id) ? prev : [...prev, row]
        )
      },
      onSessionUpdate: (updated) => {
        setGroupSession(updated)
        // Update exercises shown in lobby for all participants
        if (updated.exercises) setExercises(exNamesToObjs(updated.exercises))
        // Transition everyone from lobby → training when host starts
        if (updated.status === 'active' && screenRef.current === 'lobby') {
          setExercises(exNamesToObjs(updated.exercises))
          setTotalSets(updated.total_sets || 3)
          setRestSecs(updated.rest_secs || 60)
          setStartTime(Date.now())
          goScreen('training')
        }
      },
    })

    return unsub
  }, [groupSession?.id])

  // Polling fallback — covers when Realtime tables aren't enabled in Supabase dashboard
  useEffect(() => {
    if (!groupSession?.id || screen !== 'lobby') return

    const poll = setInterval(async () => {
      try {
        const [parts, sess] = await Promise.all([
          fetchParticipants(groupSession.id),
          fetchGroupSession(groupSession.id),
        ])
        if (parts) setParticipants(parts)
        if (sess) {
          setGroupSession(sess)
          if (sess.exercises) setExercises(exNamesToObjs(sess.exercises))
          if (sess.status === 'active' && screenRef.current === 'lobby') {
            setExercises(exNamesToObjs(sess.exercises))
            setTotalSets(sess.total_sets || 3)
            setRestSecs(sess.rest_secs || 60)
            setStartTime(Date.now())
            goScreen('training')
          }
        }
      } catch {}
    }, 2500)

    return () => clearInterval(poll)
  }, [groupSession?.id, screen])

  // Rest timer
  useEffect(() => {
    if (screen !== 'rest') return

    const endKey = 'athrion_group_rest_end'
    if (!localStorage.getItem(endKey)) {
      localStorage.setItem(endKey, String(Date.now() + restSecs * 1000))
    }

    function tick() {
      const end = parseInt(localStorage.getItem(endKey) || '0')
      if (!end) { advanceAfterRest(); return }
      const left = Math.ceil((end - Date.now()) / 1000)
      if (left <= 0) { advanceAfterRest(); return }
      setRestLeft(left)
    }

    const interval = setInterval(tick, 500)
    function handleVisibility() { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [screen])

  function advanceAfterRest() {
    localStorage.removeItem('athrion_group_rest_end')
    const nextSet = setIdx + 1
    if (nextSet >= totalSets) {
      const nextEx = exIdx + 1
      if (nextEx >= exercises.length) {
        saveGroupWorkoutToHistory()
        goScreen('done')
        return
      }
      setExIdx(nextEx); setSetIdx(0)
    } else {
      setSetIdx(nextSet)
    }
    setWeight(''); setReps('')
    goScreen('training')
  }

  async function handleAddExercise(ex) {
    if (exercises.find(e => e.name === ex.name)) return
    const next = [...exercises, ex]
    setExercises(next)
    try { await updateExercisesOnly(groupSession.id, next.map(e => e.name)) } catch {}
  }

  async function handleRemoveExercise(idx) {
    const next = exercises.filter((_, i) => i !== idx)
    setExercises(next)
    try { await updateExercisesOnly(groupSession.id, next.map(e => e.name)) } catch {}
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const sess = await createGroupSession({ exercises: [], totalSets: 3, restSecs: 60, displayName })
      setRoomName(displayName)
      setGroupSession(sess)
      setIsHost(true)
      setExercises([])
      setTotalSets(3)
      setRestSecs(60)
      goScreen('lobby')
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setLoading(true); setJoinError('')
    try {
      const sess = await joinGroupSession(joinCode.trim(), displayName)
      setRoomName(displayName)
      setGroupSession(sess)
      setIsHost(false)
      setExercises(exNamesToObjs(sess.exercises))
      setTotalSets(sess.total_sets || 3)
      setRestSecs(sess.rest_secs || 60)
      goScreen('lobby')
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartWorkout() {
    if (!groupSession?.id || exercises.length === 0) return
    try {
      await updateSessionExercises(groupSession.id, exercises.map(e => e.name), totalSets, restSecs)
      await startGroupSession(groupSession.id)
      setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
      setStartTime(Date.now())
      goScreen('training')
    } catch (err) { console.error(err) }
  }

  async function handleLogSet() {
    const w = toLb(parseFloat(weight)) // typed in the person's unit, stored in lb
    const r = parseInt(reps)
    if (!w || !r || w < 0 || r < 1) return
    try {
      await logGroupSet({ sessionId: groupSession.id, displayName, exercise: exercises[exIdx]?.name, setNum: setIdx + 1, weight: w, reps: r })
      setRestLeft(restSecs)
      localStorage.setItem('athrion_group_rest_end', String(Date.now() + restSecs * 1000))
      goScreen('rest')
    } catch (err) { console.error(err) }
  }

  async function saveGroupWorkoutToHistory(setsSnapshot) {
    const mySets = (setsSnapshot ?? allSets).filter(s => s.display_name === displayName)
    if (!mySets.length) return
    const volume   = mySets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0)
    const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0
    const name     = exercises.length > 0
      ? `Group: ${exercises.slice(0, 2).map(e => e.name).join(', ')}${exercises.length > 2 ? '…' : ''}`
      : 'Group workout'
    const formattedSets = mySets.map(s => ({ ex: s.exercise, set: s.set_num, weight: s.weight, reps: s.reps }))
    try {
      await saveWorkoutEntry({
        date:     todayKey(),
        name,
        duration: `${duration}min`,
        volume,
        sets:     formattedSets,
      })
    } catch (err) {
      console.error('Failed to save group workout to history:', err)
    }
  }

  async function handleEnd() {
    await saveGroupWorkoutToHistory()
    try { if (isHost && groupSession?.id) await endGroupSession(groupSession.id) } catch {}
    localStorage.removeItem(SESSION_PERSIST_KEY)
    goScreen('done')
  }

  function handleHome() {
    goScreen('home')
    setGroupSession(null); setParticipants([]); setAllSets([]); setIsHost(false)
    setExercises([]); setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
    setJoinCode(''); setJoinError(''); setConfirmEnd(false); setRoomName(null)
    localStorage.removeItem('athrion_group_rest_end')
    localStorage.removeItem(SESSION_PERSIST_KEY)
  }

  function inviteDone() {
    setInvite(null)
    clearInvite()
    onIntentDone?.()
  }

  if (screen === 'home') return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:account-group-outline" title="Train together"
        facts={<>
          <Fact icon="mdi:lightning-bolt">Live rooms</Fact>
          <Fact icon="mdi:trophy-outline">Monthly leaderboard</Fact>
        </>} />
      <Segmented label="Train together" options={TABS} value={tab} onChange={t => { setTab(t); setEditingNick(false) }} />

      {tab === 'rooms' ? (
        <HomeScreen
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          joinError={joinError}
          loading={loading}
          onCreate={handleCreate}
          onJoin={handleJoin}
        />
      ) : me === undefined ? (
        <SkeletonRows rows={3} />
      ) : me === null || editingNick ? (
        <NicknameCard current={me?.nickname} onSaved={m => { setMe(m); setEditingNick(false) }}
          onCancel={me ? () => setEditingNick(false) : null} />
      ) : tab === 'ranks' ? (
        <LeaderboardTab me={me} onMeChange={setMe} onAddFriends={() => setTab('friends')} />
      ) : (
        <FriendsTab me={me} invite={invite} onInviteDone={inviteDone} onEditNickname={() => setEditingNick(true)} />
      )}
    </div>
  )

  if (screen === 'lobby') return (
    <LobbyScreen
      groupSession={groupSession}
      participants={participants}
      isHost={isHost}
      exercises={exercises}
      onAddExercise={handleAddExercise}
      onRemoveExercise={handleRemoveExercise}
      totalSets={totalSets}
      setTotalSets={setTotalSets}
      restSecs={restSecs}
      setRestSecs={setRestSecs}
      onStart={handleStartWorkout}
      onBack={handleHome}
    />
  )

  if (screen === 'training') return (
    <TrainingScreen
      exercises={exercises}
      exIdx={exIdx}
      setIdx={setIdx}
      totalSets={totalSets}
      participants={participants}
      allSets={allSets}
      displayName={displayName}
      weight={weight}
      setWeight={setWeight}
      reps={reps}
      setReps={setReps}
      onLog={handleLogSet}
      onEnd={handleEnd}
      confirmEnd={confirmEnd}
      setConfirmEnd={setConfirmEnd}
    />
  )

  if (screen === 'rest') return (
    <RestScreen
      exercises={exercises}
      exIdx={exIdx}
      setIdx={setIdx}
      totalSets={totalSets}
      restLeft={restLeft}
      restSecs={restSecs}
      allSets={allSets}
      participants={participants}
      displayName={displayName}
      onSkip={advanceAfterRest}
      onEnd={handleEnd}
    />
  )

  if (screen === 'done') return (
    <DoneScreen
      allSets={allSets}
      exercises={exercises}
      participants={participants}
      displayName={displayName}
      startTime={startTime}
      onHome={handleHome}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────

function HomeScreen({ joinCode, setJoinCode, joinError, loading, onCreate, onJoin }) {
  return (
    <div className="space-y-4">
      <Card hero className="space-y-3">
        <div>
          <SectionTitle className="mb-0">Host a room</SectionTitle>
          <p className="text-sm text-ink-2 mt-1">Pick the exercises, share the code, and see everyone's sets as they happen.</p>
        </div>
        <Button full icon="mdi:plus" onClick={onCreate} disabled={loading}>
          {loading ? 'Creating...' : 'Create a room'}
        </Button>
      </Card>

      <Card className="space-y-3">
        <SectionTitle className="mb-0">Join a room</SectionTitle>
        <input
          className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors font-bold text-lg text-center"
          placeholder="ABC123"
          maxLength={6}
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && onJoin()}
        />
        {joinError && (
          <div className="text-danger text-xs text-center">{joinError}</div>
        )}
        <Button variant="secondary" full onClick={onJoin} disabled={loading || joinCode.length < 2}>
          {loading ? 'Joining...' : 'Join'}
        </Button>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────────────────────────────────────

function LobbyScreen({ groupSession, participants, isHost, exercises, onAddExercise, onRemoveExercise, totalSets, setTotalSets, restSecs, setRestSecs, onStart, onBack }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState(false)

  const filtered = EXERCISES.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.muscle.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = filter === 'All' || e.muscle === filter
    return matchSearch && matchMuscle
  })

  function copyCode() {
    navigator.clipboard.writeText(groupSession?.code || '').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4 py-4 slide-up">

      {/* Room code */}
      <Card hero className="text-center">
        <div className="text-xs font-semibold text-neon-ink mb-2">Room code</div>
        <div className="font-bold text-5xl text-neon-ink mb-3 tracking-[0.15em] tabular-nums">{groupSession?.code}</div>
        <button onClick={copyCode}
          className="press text-xs font-semibold text-ink-2 hover:text-ink border border-line-strong px-4 min-h-[36px] rounded-md transition-all">
          {copied ? <span className="inline-flex items-center gap-1"><Icon icon="mdi:check" width={14} />Copied</span> : <span className="inline-flex items-center gap-1"><Icon icon="mdi:content-copy" width={14} />Copy code</span>}
        </button>
      </Card>

      {/* Participants */}
      <Card>
        <SectionTitle action={<Fact icon="mdi:account-multiple">{participants.length}</Fact>}>Participants</SectionTitle>
        <div className="space-y-2">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-raised rounded-xl px-3 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-neon/15 border border-neon-stroke/20 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-xs text-neon-ink leading-none">{(p.display_name || '?')[0].toUpperCase()}</span>
              </div>
              <span className="text-sm font-semibold text-ink flex-1">{p.display_name}</span>
              {p.user_id === groupSession?.host_id && <Fact>Host</Fact>}
            </div>
          ))}
          {participants.length === 0 && (
            <div className="text-xs text-muted text-center py-2">Waiting for participants...</div>
          )}
        </div>
      </Card>

      {/* Host-only config */}
      {isHost && (
        <Card>
          <SectionTitle>Sets per exercise</SectionTitle>
          <Segmented options={[1,2,3,4,5].map(n => [n, String(n)])} value={totalSets} onChange={setTotalSets} label="Sets per exercise" kind="choice" className="mb-4" scroll={false} />
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Rest</div>
          <Segmented options={[30,45,60,90,120].map(s => [s, `${s}s`])} value={restSecs} onChange={setRestSecs} label="Rest duration" kind="choice" scroll={false} />
        </Card>
      )}

      {/* Exercise list — all participants can edit */}
      {exercises.length > 0 && (
        <Card>
          <SectionTitle action={<Fact icon="mdi:dumbbell">{exercises.length}</Fact>}>Workout</SectionTitle>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <ExerciseRow key={i} icon={getExerciseIcon(ex)} name={ex.name} value={`${totalSets} sets`}>
                <IconButton icon="mdi:close" label={`Remove ${ex.name}`} tone="danger" onClick={() => onRemoveExercise(i)} className="w-9 h-9" />
              </ExerciseRow>
            ))}
          </div>
        </Card>
      )}

      {/* Exercise picker — open to everyone */}
      <Card>
        <SectionTitle>Add exercises</SectionTitle>
        <input
          className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search exercises"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {['All', ...MUSCLES.filter(m => m !== 'All')].map(m => (
            <Chip key={m} selected={filter === m} onClick={() => setFilter(m)}>{m}</Chip>
          ))}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const added = exercises.some(e => e.name === ex.name)
            return (
              <ExerciseRow key={i} icon={getExerciseIcon(ex)} name={ex.name} meta={ex.muscle}>
                {added
                  ? <span className="w-9 h-9 flex items-center justify-center text-neon-ink"><Icon icon="mdi:check" width={20} aria-label="Added" /></span>
                  : <Button size="sm" icon="mdi:plus" onClick={() => onAddExercise(ex)}>Add</Button>}
              </ExerciseRow>
            )
          })}
        </div>
      </Card>

      {/* Host starts; participants wait */}
      {isHost ? (
        <>
          <Button full icon="mdi:play" onClick={onStart} disabled={exercises.length === 0}>
            Start workout
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="text-sm text-muted">Waiting for host to start...</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────

function TrainingScreen({ exercises, exIdx, setIdx, totalSets, participants, allSets, displayName, weight, setWeight, reps, setReps, onLog, onEnd, confirmEnd, setConfirmEnd }) {
  const { unit } = useUnit()
  const ex = exercises[exIdx]
  if (!ex) return null

  const setsForThisExByPerson = (name) =>
    allSets.filter(s => s.exercise === ex.name && s.display_name === name).length

  return (
    <div className="space-y-4 py-4 slide-in">
      {/* Progress header */}
      <div>
        <div className="flex justify-between text-xs mb-2">
          <span className="font-semibold text-ink-2">Exercise {exIdx + 1} of {exercises.length}</span>
          <span className="font-semibold text-neon-ink tabular-nums">{Math.round(((exIdx * totalSets + setIdx) / (exercises.length * totalSets)) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-neon rounded-full transition-all duration-500"
            style={{ width: `${((exIdx * totalSets + setIdx) / (exercises.length * totalSets)) * 100}%` }}
          />
        </div>
      </div>

      {/* Participants strip */}
      {participants.length > 0 && (
        <Card pad="sm">
          <SectionTitle className="mb-2">Participants</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {participants.map((p, i) => {
              const done = setsForThisExByPerson(p.display_name)
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${p.display_name === displayName ? 'text-ink' : 'text-muted'}`}>
                    {p.display_name.split(' ')[0]}
                  </span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: totalSets }, (_, si) => (
                      <div key={si} className={`w-2 h-2 rounded-full ${si < done ? 'bg-neon' : 'bg-line-strong'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Exercise card */}
      <Card hero>
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon icon={getExerciseIcon(ex)} width={30} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
          <div className="font-bold text-2xl text-ink leading-tight break-words">{ex.name}</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Fact icon="mdi:repeat">Set {setIdx + 1} of {totalSets}</Fact>
        </div>
        <div className="flex gap-1.5 mt-4" aria-hidden="true">
          {Array.from({ length: totalSets }, (_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-colors duration-300 ${i < setIdx ? 'bg-neon' : i === setIdx ? 'bg-neon/40' : 'bg-line'}`} />
          ))}
        </div>
      </Card>

      {/* Set log */}
      <Card>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm font-semibold text-ink-2 block mb-1">Weight ({unit})</label>
            <input
              type="number" placeholder="0" aria-label={`Weight in ${unit}`} value={weight}
              onChange={e => setWeight(e.target.value)} min="0" step={unit === 'kg' ? 0.25 : 0.5} inputMode="decimal"
              className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-2xl font-bold tabular-nums text-center outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-ink-2 block mb-1">Reps</label>
            <input
              type="number" placeholder="0" aria-label="Reps" value={reps}
              onChange={e => setReps(e.target.value)} min="1" inputMode="numeric"
              className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-2xl font-bold tabular-nums text-center outline-none transition-colors"
            />
          </div>
        </div>
        <Button full icon="mdi:check" onClick={onLog}>Log set {setIdx + 1}</Button>
      </Card>

      {confirmEnd ? (
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmEnd(false)}>Keep going</Button>
          <Button variant="danger" className="flex-1" onClick={onEnd}>End workout</Button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="w-full text-center text-xs text-muted hover:text-ink-2 py-2 min-h-[44px] transition-colors">
          End workout early
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest (competitive leaderboard)
// ─────────────────────────────────────────────────────────────────────────────

function RestScreen({ exercises, exIdx, setIdx, totalSets, restLeft, restSecs, allSets, participants, displayName, onSkip, onEnd }) {
  const { fmt, fmtVolume } = useUnit()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const ex = exercises[exIdx]
  const leaderboard = buildExerciseLeaderboard(allSets, ex?.name || '')
  const maxVolume = leaderboard[0]?.volume || 1
  const myEntry = leaderboard.find(e => e.name === displayName)

  const pct = Math.min(1, restLeft / restSecs) * 100
  const r = 70
  const circ = 2 * Math.PI * r


  function fmtTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6 py-4 fade-in">
      {/* Timer */}
      <div className="flex flex-col items-center">
        <div className="text-xs text-muted mb-1">
          <span className="inline-flex items-center gap-1.5"><Icon icon="mdi:check-circle-outline" width={16} className="text-neon-ink" />{ex?.name}, set {setIdx + 1} done</span>
        </div>
        <div className="relative w-44 h-44 my-2">
          <svg className="w-44 h-44 -rotate-90" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={r} fill="none" className="stroke-line" strokeWidth="8" />
            <circle
              cx="90" cy="90" r={r} fill="none" className="stroke-neon-stroke" strokeWidth="8"
              strokeDasharray={`${circ * pct / 100} ${circ}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-bold text-4xl text-neon-ink leading-none tabular-nums">{fmtTime(restLeft)}</div>
            <div className="text-xs font-medium text-muted">rest</div>
          </div>
        </div>
        <Button variant="secondary" onClick={onSkip}>Skip rest</Button>
      </div>

      {/* Live Leaderboard */}
      <Card pad="lg">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-neon-ink text-sm font-bold">Live standings</span>
          <div className="flex-1 h-px bg-neon/20" />
          <span className="text-xs text-muted">{ex?.name}</span>
        </div>

        {leaderboard.length === 0 ? (
          <div className="text-center py-4 text-muted text-sm">No sets logged yet. Yours could be first.</div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry, i) => {
              const barWidth = maxVolume > 0 ? (entry.volume / maxVolume) * 100 : 0
              const barColor = i === 0 ? tok('neon-stroke') : i === 1 ? tok('ink-2') : i === 2 ? tok('ember') : tok('line-strong')
              const textColor = i === 0 ? 'text-neon-ink' : i === 1 ? 'text-ink-2' : i === 2 ? 'text-ember' : 'text-muted'
              const isMe = entry.name === displayName
              return (
                <div key={i} className="bg-inset rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <RankChip rank={i + 1} />
                    <span className={`text-sm flex-1 ${isMe ? 'font-bold text-ink' : 'font-medium text-ink-2'}`}>
                      {entry.name}{isMe ? ' (you)' : ''}
                    </span>
                    <div className="text-right">
                      <div className={`text-xs font-bold ${textColor}`}>
                        {entry.latestSet ? `${fmt(entry.latestSet.weight)} × ${entry.latestSet.reps}` : ''}
                      </div>
                      <div className="text-xs text-muted">{fmtVolume(entry.volume)} vol</div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-raised rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%`, background: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!myEntry && leaderboard.length > 0 && (
          <div className="mt-3 text-xs text-muted text-center">You haven't logged this exercise yet</div>
        )}
      </Card>

      {confirmEnd ? (
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmEnd(false)}>Keep going</Button>
          <Button variant="danger" className="flex-1" onClick={onEnd}>End workout</Button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="w-full text-center text-xs text-muted hover:text-ink-2 py-2 min-h-[44px] transition-colors">
          End workout early
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────────

function DoneScreen({ allSets, exercises, participants, displayName, startTime, onHome }) {
  const { fmtVolume } = useUnit()
  const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0
  const overall = buildOverallLeaderboard(allSets)
  const champion = overall[0]

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="text-center">
        <Icon icon="mdi:trophy-outline" width={48} className="mx-auto mb-3 text-neon-ink" />
        <div className="font-bold text-3xl text-neon-ink">Group workout complete</div>
        {duration > 0 && <div className="text-muted mt-1 text-sm">Duration: {duration}min</div>}
      </div>

      {/* Champion */}
      {champion && (
        <Card pad="lg" tone="neon" className="text-center">
          <Icon icon="mdi:crown-outline" width={28} className="mx-auto mb-1 text-neon-ink" />
          <div className="font-bold text-2xl text-neon-ink">{champion.name}</div>
          <div className="text-muted text-sm">{fmtVolume(champion.volume)} total volume</div>
          {champion.name === displayName && (
            <div className="mt-2 text-xs text-neon-ink">That's you.</div>
          )}
        </Card>
      )}

      {/* Final rankings */}
      {overall.length > 1 && (
        <Card pad="md">
          <SectionTitle>Final rankings</SectionTitle>
          <div className="space-y-2">
            {overall.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 bg-raised rounded-xl px-3 py-2.5">
                <RankChip rank={i + 1} />
                <span className={`flex-1 text-sm font-medium ${entry.name === displayName ? 'text-ink' : 'text-ink-2'}`}>
                  {entry.name}
                </span>
                <span className="text-sm font-bold text-neon-ink">{fmtVolume(entry.volume)}</span>
                <span className="text-xs text-muted">{entry.setCount} sets</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Per-exercise breakdown */}
      {exercises.length > 0 && (
        <Card pad="md">
          <SectionTitle>Exercise breakdown</SectionTitle>
          <div className="space-y-3">
            {exercises.map((ex, ei) => {
              const lb = buildExerciseLeaderboard(allSets, ex.name)
              if (lb.length === 0) return null
              return (
                <div key={ei} className="bg-inset rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={getExerciseIcon(ex)} width={16} className="text-muted flex-shrink-0" />
                    <span className="text-xs font-semibold text-ink-2">{ex.name}</span>
                  </div>
                  <div className="space-y-1.5">
                    {lb.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <RankChip rank={i + 1} small />
                        <span className={`text-xs flex-1 ${entry.name === displayName ? 'font-bold text-ink' : 'text-muted'}`}>
                          {entry.name}
                        </span>
                        <span className="text-xs font-bold text-neon-ink">{fmtVolume(entry.volume)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Button full onClick={onHome}>Back to home</Button>
    </div>
  )
}
