import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { EXERCISES, MUSCLES, getExerciseIcon } from '../lib/data.js'
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

export default function Group({ session }) {
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

  const displayName = session?.name || 'You'
  // Ref so callbacks always see the current screen without stale closure
  const screenRef = useRef('home')

  function goScreen(s) { screenRef.current = s; setScreen(s) }

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
    }))
  }, [groupSession?.id, screen, isHost, exIdx, setIdx, startTime])

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
      if (nextEx >= exercises.length) { setScreen('done'); return }
      setExIdx(nextEx); setSetIdx(0)
    } else {
      setSetIdx(nextSet)
    }
    setWeight(''); setReps('')
    setScreen('training')
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
    const w = parseFloat(weight)
    const r = parseInt(reps)
    if (!w || !r || w < 0 || r < 1) return
    try {
      await logGroupSet({ sessionId: groupSession.id, displayName, exercise: exercises[exIdx]?.name, setNum: setIdx + 1, weight: w, reps: r })
      setRestLeft(restSecs)
      localStorage.setItem('athrion_group_rest_end', String(Date.now() + restSecs * 1000))
      goScreen('rest')
    } catch (err) { console.error(err) }
  }

  async function handleEnd() {
    try { if (isHost && groupSession?.id) await endGroupSession(groupSession.id) } catch {}
    localStorage.removeItem(SESSION_PERSIST_KEY)
    goScreen('done')
  }

  function handleHome() {
    goScreen('home')
    setGroupSession(null); setParticipants([]); setAllSets([]); setIsHost(false)
    setExercises([]); setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
    setJoinCode(''); setJoinError(''); setConfirmEnd(false)
    localStorage.removeItem('athrion_group_rest_end')
    localStorage.removeItem(SESSION_PERSIST_KEY)
  }

  if (screen === 'home') return (
    <HomeScreen
      joinCode={joinCode}
      setJoinCode={setJoinCode}
      joinError={joinError}
      loading={loading}
      onCreate={handleCreate}
      onJoin={handleJoin}
    />
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
    <div className="space-y-6 py-4 slide-up">
      <div className="text-center pt-4">
        <div className="font-bebas text-5xl tracking-widest text-white mb-2">GROUP WORKOUT</div>
        <div className="text-gray-400 text-sm">Train together. Compete in real time.</div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest">Host a Session</div>
        <p className="text-sm text-gray-400">Create a room, pick exercises, and invite friends with a code.</p>
        <NeonBtn onClick={onCreate} disabled={loading} className="w-full">
          {loading ? 'Creating...' : '+ Create a Room'}
        </NeonBtn>
      </Card>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#222]" />
        <span className="text-xs text-gray-600 uppercase tracking-widest">or join with a code</span>
        <div className="flex-1 h-px bg-[#222]" />
      </div>

      <Card className="p-6 space-y-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest">Join a Room</div>
        <input
          className="w-full bg-[#0d0d0d] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors font-bebas text-xl tracking-widest text-center uppercase"
          placeholder="ABC123"
          maxLength={6}
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && onJoin()}
        />
        {joinError && (
          <div className="text-red-400 text-xs text-center">{joinError}</div>
        )}
        <button
          onClick={onJoin}
          disabled={loading || joinCode.length < 2}
          className="w-full py-3 rounded-xl border border-[#333] bg-[#1a1a1a] text-white font-semibold text-sm hover:border-neon/40 hover:text-neon transition-all disabled:opacity-40"
        >
          {loading ? 'Joining...' : 'Join →'}
        </button>
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
      <button onClick={onBack} className="text-gray-500 text-sm hover:text-white transition-colors">← Back</button>

      {/* Room code */}
      <Card className="p-6 text-center">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Room Code</div>
        <div className="font-bebas text-6xl tracking-[0.2em] text-neon mb-3">{groupSession?.code}</div>
        <button onClick={copyCode}
          className="text-xs text-gray-500 hover:text-white border border-[#333] hover:border-neon/40 px-4 py-1.5 rounded-lg transition-all">
          {copied ? '✓ Copied!' : 'Copy Code'}
        </button>
        <div className="text-[10px] text-gray-600 mt-2">Share this code with friends to join</div>
      </Card>

      {/* Participants */}
      <Card className="p-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Participants · {participants.length}</div>
        <div className="space-y-2">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#0d0d0d] rounded-xl px-3 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-neon/15 border border-neon/20 flex items-center justify-center flex-shrink-0">
                <span className="font-bebas text-xs text-neon leading-none">{(p.display_name || '?')[0].toUpperCase()}</span>
              </div>
              <span className="text-sm font-medium flex-1">{p.display_name}</span>
              {p.user_id === groupSession?.host_id && <span className="text-xs">👑</span>}
            </div>
          ))}
          {participants.length === 0 && (
            <div className="text-xs text-gray-600 text-center py-2">Waiting for participants...</div>
          )}
        </div>
      </Card>

      {/* Host-only config */}
      {isHost && (
        <Card className="p-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Sets per Exercise</div>
          <div className="flex gap-2 mb-4">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setTotalSets(n)}
                className={`flex-1 py-2.5 rounded-xl font-bebas text-xl transition-all ${totalSets === n ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'}`}>
                {n}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Rest Duration</div>
          <div className="flex gap-2">
            {[30,45,60,90,120].map(s => (
              <button key={s} onClick={() => setRestSecs(s)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${restSecs === s ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'}`}>
                {s}s
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Exercise list — all participants can edit */}
      {exercises.length > 0 && (
        <Card className="p-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Selected · {exercises.length}</div>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#0d0d0d] rounded-xl p-3">
                <Icon icon={getExerciseIcon(ex)} width={20} className="flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-gray-500">{ex.muscle}</div>
                </div>
                <button onClick={() => onRemoveExercise(i)} className="text-red-400 hover:text-red-300 text-lg leading-none transition-colors">×</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Exercise picker — open to everyone */}
      <Card className="p-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Add Exercises</div>
        <input
          className="w-full bg-[#0d0d0d] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search exercises..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {['All', ...MUSCLES.filter(m => m !== 'All')].map(m => (
            <button key={m} onClick={() => setFilter(m)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${filter === m ? 'bg-neon text-black' : 'bg-[#1a1a1a] text-gray-500 border border-[#2a2a2a]'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((ex, i) => {
            const added = exercises.some(e => e.name === ex.name)
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0d0d]">
                <Icon icon={getExerciseIcon(ex)} width={20} className="flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ex.name}</div>
                  <div className="text-xs text-gray-500">{ex.muscle}</div>
                </div>
                <button onClick={() => onAddExercise(ex)} disabled={added}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${added ? 'bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-default' : 'bg-neon text-black hover:shadow-[0_4px_12px_rgba(200,241,53,0.3)]'}`}>
                  {added ? '✓' : '+ Add'}
                </button>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Host starts; participants wait */}
      {isHost ? (
        <>
          {participants.length < 2 && (
            <div className="text-xs text-gray-600 text-center">Invite friends — or test solo</div>
          )}
          <NeonBtn onClick={onStart} disabled={exercises.length === 0} className="w-full">
            Start Workout →
          </NeonBtn>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="text-sm text-gray-400">Waiting for host to start...</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────

function TrainingScreen({ exercises, exIdx, setIdx, totalSets, participants, allSets, displayName, weight, setWeight, reps, setReps, onLog, onEnd, confirmEnd, setConfirmEnd }) {
  const ex = exercises[exIdx]
  if (!ex) return null

  const setsForThisExByPerson = (name) =>
    allSets.filter(s => s.exercise === ex.name && s.display_name === name).length

  return (
    <div className="space-y-4 py-4 slide-in">
      {/* Progress header */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-600 uppercase tracking-widest mb-2">
          <span>Exercise {exIdx + 1}/{exercises.length} · {ex.name}</span>
          <span>Set {setIdx + 1} of {totalSets}</span>
        </div>
        <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
          <div
            className="h-full bg-neon rounded-full transition-all duration-500"
            style={{ width: `${((exIdx * totalSets + setIdx) / (exercises.length * totalSets)) * 100}%` }}
          />
        </div>
      </div>

      {/* Participants strip */}
      {participants.length > 0 && (
        <Card className="p-3">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Participants</div>
          <div className="flex flex-wrap gap-3">
            {participants.map((p, i) => {
              const done = setsForThisExByPerson(p.display_name)
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${p.display_name === displayName ? 'text-white' : 'text-gray-400'}`}>
                    {p.display_name.split(' ')[0]}
                  </span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: totalSets }, (_, si) => (
                      <div key={si} className={`w-2 h-2 rounded-full ${si < done ? 'bg-neon' : 'bg-[#333]'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Exercise card */}
      <div className="bg-[#0b0f00] border border-neon/30 rounded-2xl p-6 text-center">
        <div className="flex justify-center mb-3">
          <Icon icon={getExerciseIcon(ex)} width={56} className="text-neon/80" />
        </div>
        <div className="font-bebas text-4xl tracking-wide mb-1">{ex.name}</div>
        <div className="text-gray-400 text-sm">{ex.muscle}</div>
      </div>

      {/* Set log */}
      <Card className="p-5">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Set {setIdx + 1} of {totalSets}</div>
        <div className="flex gap-2 mb-4">
          {Array.from({ length: totalSets }, (_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-all duration-300 ${i < setIdx ? 'bg-neon' : i === setIdx ? 'bg-neon ring-pulse' : 'bg-[#222]'}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Weight (lb)</label>
            <input
              type="number" placeholder="0" value={weight}
              onChange={e => setWeight(e.target.value)} min="0" step="0.5"
              className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reps</label>
            <input
              type="number" placeholder="0" value={reps}
              onChange={e => setReps(e.target.value)} min="1"
              className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            />
          </div>
        </div>
        <NeonBtn onClick={onLog} className="w-full">Log Set →</NeonBtn>
      </Card>

      {confirmEnd ? (
        <div className="flex gap-3">
          <button onClick={() => setConfirmEnd(false)}
            className="flex-1 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 font-semibold text-sm transition-all hover:border-[#444]">
            Keep Going
          </button>
          <button onClick={onEnd}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm transition-all hover:bg-red-500/30">
            End Workout
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="w-full text-center text-xs text-gray-600 hover:text-gray-400 py-2 transition-colors">
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
  const [confirmEnd, setConfirmEnd] = useState(false)
  const ex = exercises[exIdx]
  const leaderboard = buildExerciseLeaderboard(allSets, ex?.name || '')
  const maxVolume = leaderboard[0]?.volume || 1
  const myEntry = leaderboard.find(e => e.name === displayName)

  const pct = Math.min(1, restLeft / restSecs) * 100
  const r = 70
  const circ = 2 * Math.PI * r

  const medals = ['🥇', '🥈', '🥉']

  function fmtTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6 py-4 fade-in">
      {/* Timer */}
      <div className="flex flex-col items-center">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
          {ex?.name} — Set {setIdx + 1} complete ✓
        </div>
        <div className="relative w-44 h-44 my-2">
          <svg className="w-44 h-44 -rotate-90" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={r} fill="none" stroke="#1e1e1e" strokeWidth="8" />
            <circle
              cx="90" cy="90" r={r} fill="none" stroke="#C8F135" strokeWidth="8"
              strokeDasharray={`${circ * pct / 100} ${circ}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-bebas text-5xl text-neon leading-none">{fmtTime(restLeft)}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-widest">rest</div>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#444] transition-all px-6 py-2 rounded-xl text-sm font-medium"
        >
          SKIP →
        </button>
      </div>

      {/* Live Leaderboard */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-neon text-sm font-bold tracking-widest uppercase">⚡ Live Standings</span>
          <div className="flex-1 h-px bg-neon/20" />
          <span className="text-[10px] text-gray-600 uppercase">{ex?.name}</span>
        </div>

        {leaderboard.length === 0 ? (
          <div className="text-center py-4 text-gray-600 text-sm">No sets logged yet — be the first!</div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry, i) => {
              const barWidth = maxVolume > 0 ? (entry.volume / maxVolume) * 100 : 0
              const barColor = i === 0 ? '#C8F135' : i === 1 ? '#f59e0b' : '#555'
              const textColor = i === 0 ? 'text-neon' : i === 1 ? 'text-amber-400' : 'text-gray-400'
              const isMe = entry.name === displayName
              return (
                <div key={i} className="bg-[#0d0d0d] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg w-6 flex-shrink-0">{medals[i] || `${i + 1}.`}</span>
                    <span className={`text-sm flex-1 ${isMe ? 'font-bold text-white' : 'font-medium text-gray-300'}`}>
                      {entry.name}{isMe ? ' (you)' : ''}
                    </span>
                    <div className="text-right">
                      <div className={`text-xs font-bold ${textColor}`}>
                        {entry.latestSet ? `${entry.latestSet.weight}lb × ${entry.latestSet.reps}` : ''}
                      </div>
                      <div className="text-[10px] text-gray-600">{entry.volume}lb vol</div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
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
          <div className="mt-3 text-xs text-gray-600 text-center">You haven't logged this exercise yet</div>
        )}
      </Card>

      {confirmEnd ? (
        <div className="flex gap-3">
          <button onClick={() => setConfirmEnd(false)}
            className="flex-1 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 font-semibold text-sm transition-all hover:border-[#444]">
            Keep Going
          </button>
          <button onClick={onEnd}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm transition-all hover:bg-red-500/30">
            End Workout
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmEnd(true)}
          className="w-full text-center text-xs text-gray-600 hover:text-gray-400 py-2 transition-colors">
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
  const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0
  const overall = buildOverallLeaderboard(allSets)
  const champion = overall[0]
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="text-center">
        <div className="text-5xl mb-3">🏆</div>
        <div className="font-bebas text-4xl text-neon tracking-wide">GROUP WORKOUT COMPLETE!</div>
        {duration > 0 && <div className="text-gray-400 mt-1 text-sm">Duration: {duration}min</div>}
      </div>

      {/* Champion */}
      {champion && (
        <Card className="p-5 text-center border-neon/30">
          <div className="text-2xl mb-1">👑</div>
          <div className="font-bebas text-3xl text-neon">{champion.name}</div>
          <div className="text-gray-400 text-sm">{champion.volume}lb total volume</div>
          {champion.name === displayName && (
            <div className="mt-2 text-xs text-neon/70 uppercase tracking-widest">That's you!</div>
          )}
        </Card>
      )}

      {/* Final rankings */}
      {overall.length > 1 && (
        <Card className="p-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Final Rankings</div>
          <div className="space-y-2">
            {overall.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#0d0d0d] rounded-xl px-3 py-2.5">
                <span className="text-lg w-6">{medals[i] || `${i + 1}.`}</span>
                <span className={`flex-1 text-sm font-medium ${entry.name === displayName ? 'text-white' : 'text-gray-300'}`}>
                  {entry.name}
                </span>
                <span className="text-sm font-bold text-neon">{entry.volume}lb</span>
                <span className="text-xs text-gray-600">{entry.setCount} sets</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Per-exercise breakdown */}
      {exercises.length > 0 && (
        <Card className="p-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Exercise Breakdown</div>
          <div className="space-y-3">
            {exercises.map((ex, ei) => {
              const lb = buildExerciseLeaderboard(allSets, ex.name)
              if (lb.length === 0) return null
              return (
                <div key={ei} className="bg-[#0d0d0d] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={getExerciseIcon(ex)} width={16} className="text-gray-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-gray-300">{ex.name}</span>
                  </div>
                  <div className="space-y-1.5">
                    {lb.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] w-4">{medals[i] || `${i + 1}.`}</span>
                        <span className={`text-xs flex-1 ${entry.name === displayName ? 'font-bold text-white' : 'text-gray-400'}`}>
                          {entry.name}
                        </span>
                        <span className="text-xs font-bold text-neon">{entry.volume}lb</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <NeonBtn onClick={onHome} className="w-full">Back to Home</NeonBtn>
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
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-neon text-black font-bold py-3 rounded-xl text-sm uppercase tracking-widest hover:shadow-[0_6px_24px_rgba(200,241,53,0.4)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}
