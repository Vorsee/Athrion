import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, Chip, Segmented, PageHeader, SectionTitle, Fact, InfoButton, IconButton, ExerciseRow, RankChip, SkeletonRows } from '../components/ui/index.js'
import { NicknameCard, LeaderboardTab, FriendsTab } from '../components/Social.jsx'
import { fetchMySocial, clearInvite } from '../lib/socialApi.js'
import { EXERCISES, MUSCLES, getExerciseIcon, todayKey } from '../lib/data.js'
import {
  createGroupSession,
  joinGroupSession,
  saveSessionPlan,
  fetchGroupSession,
  startGroupSession,
  endGroupSession,
  fetchParticipants,
  fetchGroupSets,
  logGroupSet,
  subscribeToGroupSession,
  currentUserId,
} from '../lib/groupApi.js'
import { standings, mergeSets } from '../lib/groupStandings.js'
import { planFrom, makeSets, totalSets as countSets, setsDone, restAfter, restLabel, setsSummary, REST_OPTIONS, MAX_SETS } from '../lib/groupPlan.js'
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

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [['friends', 'Friends'], ['ranks', 'Leaderboard'], ['rooms', 'Rooms']]

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
  const [plan, setPlan] = useState([]) // [{ name, sets: [{ reps, rest }] }], see groupPlan.js
  const [restTotal, setRestTotal] = useState(60) // length of the rest that's running
  const [exIdx, setExIdx] = useState(0)
  const [setIdx, setSetIdx] = useState(0)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [startTime, setStartTime] = useState(null)
  const [restLeft, setRestLeft] = useState(60)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [tab, setTab] = useState(intent?.tab || 'friends')
  const [me, setMe] = useState(undefined) // undefined = loading, null = no nickname yet
  const [editingNick, setEditingNick] = useState(false)
  const [invite, setInvite] = useState(intent?.invite || null)
  // The name a room was joined with stays fixed for that room, even if the nickname changes
  const [roomName, setRoomName] = useState(null)
  const [myId, setMyId] = useState(null)
  // Read at save time, so a set that arrived after a timer started still counts
  const allSetsRef = useRef(allSets)
  allSetsRef.current = allSets

  useEffect(() => { fetchMySocial().then(setMe).catch(() => setMe(null)) }, [])
  useEffect(() => { currentUserId().then(setMyId).catch(() => {}) }, [])
  useEffect(() => {
    if (intent?.tab) setTab(intent.tab)
    if (intent?.invite) setInvite(intent.invite)
    else if (intent) onIntentDone?.() // a tab-only intent is used up once applied
  }, [intent])

  const displayName = roomName || me?.nickname || session?.name || 'You'
  // Ref so callbacks always see the current screen without stale closure
  const screenRef = useRef('home')

  function goScreen(s) { screenRef.current = s; setScreen(s) }
  // Back from the lobby leaves the room, as its Back button did
  useBackHandler(screen === 'lobby', () => handleHome(), 'Train together')

  const exercises = plan.map(p => EXERCISES.find(e => e.name === p.name) ?? { name: p.name, muscle: '', icon: 'mdi:dumbbell' })

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
      if (state.restTotal) setRestTotal(state.restTotal)
      setPlan(planFrom(sess))
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
      restTotal,
      name: displayName,
    }))
  }, [groupSession?.id, screen, isHost, exIdx, setIdx, startTime, restTotal, displayName])

  // Realtime subscription
  useEffect(() => {
    if (!groupSession?.id) return

    fetchParticipants(groupSession.id).then(setParticipants).catch(() => {})
    fetchGroupSets(groupSession.id).then(setAllSets).catch(() => {})

    const unsub = subscribeToGroupSession(groupSession.id, {
      onSet: (row) => setAllSets(prev => mergeSets(prev, [row])),
      onParticipant: (row) => {
        setParticipants(prev =>
          prev.some(p => p.user_id === row.user_id) ? prev : [...prev, row]
        )
      },
      onSessionUpdate: (updated) => {
        setGroupSession(updated)
        // The host's edits show in everyone's lobby; once training, the plan stays as it started
        if (screenRef.current === 'lobby' && !hostEditing.current) setPlan(planFrom(updated))
        // Transition everyone from lobby → training when host starts
        if (updated.status === 'active' && screenRef.current === 'lobby') {
          setStartTime(Date.now())
          goScreen('training')
        }
      },
    })

    return unsub
  }, [groupSession?.id])

  // Polling for the whole session: realtime makes it instant when it's on, this keeps
  // everyone's sets and positions current when it isn't
  useEffect(() => {
    if (!groupSession?.id || screen === 'home') return

    const poll = setInterval(async () => {
      try {
        const [parts, sets, sess] = await Promise.all([
          fetchParticipants(groupSession.id),
          fetchGroupSets(groupSession.id),
          screen === 'lobby' ? fetchGroupSession(groupSession.id) : null,
        ])
        if (parts) setParticipants(parts)
        if (sets) setAllSets(prev => mergeSets(prev, sets))
        if (sess) {
          setGroupSession(sess)
          if (screenRef.current === 'lobby' && !hostEditing.current) setPlan(planFrom(sess))
          if (sess.status === 'active' && screenRef.current === 'lobby') {
            setStartTime(Date.now())
            goScreen('training')
          }
        }
      } catch {}
    }, 3000)

    return () => clearInterval(poll)
  }, [groupSession?.id, screen])

  // Rest timer
  useEffect(() => {
    if (screen !== 'rest') return

    const endKey = 'athrion_group_rest_end'
    if (!localStorage.getItem(endKey)) {
      localStorage.setItem(endKey, String(Date.now() + restTotal * 1000))
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
    if (nextSet >= (plan[exIdx]?.sets.length ?? 0)) {
      const nextEx = exIdx + 1
      if (nextEx >= plan.length) {
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

  // Only the host edits the room (RLS allows only them). Their own polling mustn't undo an
  // edit that's still saving, so it waits until the last save lands.
  const hostEditing = useRef(0)
  async function editPlan(next) {
    setPlan(next)
    hostEditing.current++
    try { await saveSessionPlan(groupSession.id, next) } catch (err) { console.error(err) }
    finally { hostEditing.current-- }
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const sess = await createGroupSession({ displayName })
      setRoomName(displayName)
      setGroupSession(sess)
      setIsHost(true)
      setPlan([])
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
      setPlan(planFrom(sess))
      goScreen('lobby')
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartWorkout() {
    if (!groupSession?.id || plan.length === 0) return
    try {
      await saveSessionPlan(groupSession.id, plan)
      await startGroupSession(groupSession.id)
      setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
      setStartTime(Date.now())
      goScreen('training')
    } catch (err) { console.error(err) }
  }

  async function handleLogSet() {
    const w = toLb(parseFloat(weight || '0')) // typed in the person's unit, stored in lb; 0 for bodyweight
    const r = parseInt(reps)
    if (!(w >= 0) || !(r >= 1)) return
    try {
      const row = await logGroupSet({ sessionId: groupSession.id, displayName, exercise: plan[exIdx]?.name, setNum: setIdx + 1, weight: w, reps: r })
      if (row) setAllSets(prev => mergeSets(prev, [row]))
      const rest = restAfter(plan, exIdx, setIdx)
      if (!rest) { advanceAfterRest(); return } // no rest set for this one, or the workout is done
      setRestTotal(rest); setRestLeft(rest)
      localStorage.setItem('athrion_group_rest_end', String(Date.now() + rest * 1000))
      goScreen('rest')
    } catch (err) { console.error(err) }
  }

  async function saveGroupWorkoutToHistory() {
    const mySets = allSetsRef.current.filter(s => (myId ? s.user_id === myId : s.display_name === displayName))
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
    setPlan([]); setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
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
          <Fact icon="mdi:account-multiple-outline">Friends</Fact>
          <Fact icon="mdi:trophy-outline">Monthly leaderboard</Fact>
          <Fact icon="mdi:lightning-bolt">Live rooms</Fact>
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
      plan={plan}
      onChange={editPlan}
      onStart={handleStartWorkout}
      onBack={handleHome}
    />
  )

  if (screen === 'training') return (
    <TrainingScreen
      plan={plan}
      exercises={exercises}
      exIdx={exIdx}
      setIdx={setIdx}
      participants={participants}
      allSets={allSets}
      myId={myId}
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
      plan={plan}
      exIdx={exIdx}
      setIdx={setIdx}
      restLeft={restLeft}
      restSecs={restTotal}
      allSets={allSets}
      participants={participants}
      myId={myId}
      onSkip={advanceAfterRest}
      onEnd={handleEnd}
    />
  )

  if (screen === 'done') return (
    <DoneScreen
      allSets={allSets}
      plan={plan}
      exercises={exercises}
      participants={participants}
      myId={myId}
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

function LobbyScreen({ groupSession, participants, isHost, plan, onChange, onStart, onBack }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(null) // index of the exercise whose sets are being edited

  const filtered = EXERCISES.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.muscle.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = filter === 'All' || e.muscle === filter
    return matchSearch && matchMuscle
  })

  // Quick setup shows a value only while every set in the room matches it
  const allSets = plan.flatMap(e => e.sets)
  const sameCount = plan.length && plan.every(e => e.sets.length === plan[0].sets.length) ? plan[0].sets.length : null
  const sameRest = allSets.length && allSets.every(x => x.rest === allSets[0].rest) ? allSets[0].rest : null
  const [defaults, setDefaults] = useState({ sets: 3, rest: 60 })

  function copyCode() {
    navigator.clipboard.writeText(groupSession?.code || '').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const edit = (i, sets) => onChange(plan.map((e, j) => (j === i ? { ...e, sets } : e)))
  function addExercise(ex) {
    if (plan.some(e => e.name === ex.name)) return
    onChange([...plan, { name: ex.name, sets: makeSets(sameCount ?? defaults.sets, sameRest ?? defaults.rest) }])
  }
  function removeExercise(i) {
    onChange(plan.filter((_, j) => j !== i))
    setOpen(null)
  }
  function setAllCounts(n) {
    setDefaults(d => ({ ...d, sets: n }))
    onChange(plan.map(e => ({ ...e, sets: Array.from({ length: n }, (_, k) => e.sets[k] ?? { ...e.sets[e.sets.length - 1] }) })))
  }
  function setAllRest(r) {
    setDefaults(d => ({ ...d, rest: r }))
    onChange(plan.map(e => ({ ...e, sets: e.sets.map(x => ({ ...x, rest: r })) })))
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

      {/* Host: one tap sets every exercise, then each set can be changed below */}
      {isHost && (
        <Card>
          <SectionTitle action={
            <InfoButton title="Sets and rest">
              <div className="space-y-3 text-sm text-ink-2">
                <p><span className="font-semibold text-ink">Quick setup</span> gives every exercise the same sets and rest. Start here, then change single sets.</p>
                <p><span className="font-semibold text-ink">Edit sets</span> on an exercise to add or remove sets, give each one a reps target, and choose the rest after it.</p>
                <p>Rest starts when a set is logged. The rest after an exercise's last set is the break before the next exercise.</p>
              </div>
            </InfoButton>
          }>Quick setup</SectionTitle>
          <Segmented options={[1,2,3,4,5].map(n => [n, String(n)])} value={sameCount ?? (plan.length ? null : defaults.sets)} onChange={setAllCounts} label="Sets per exercise" kind="choice" className="mb-4" scroll={false} />
          <div className="text-lg leading-[1.3] font-semibold text-ink mb-3">Rest after each set</div>
          <Segmented options={[30,45,60,90,120].map(r => [r, `${r}s`])} value={sameRest ?? (plan.length ? null : defaults.rest)} onChange={setAllRest} label="Rest after each set" kind="choice" scroll={false} />
        </Card>
      )}

      {/* The workout, set by set */}
      {plan.length > 0 && (
        <Card>
          <SectionTitle action={<Fact icon="mdi:dumbbell">{plan.length}</Fact>}>Workout</SectionTitle>
          <div className="space-y-2">
            {plan.map((e, i) => {
              const ex = EXERCISES.find(x => x.name === e.name)
              const rests = [...new Set(e.sets.map(x => x.rest))]
              const restText = rests.length === 1 ? `Rest ${restLabel(rests[0]).toLowerCase()}` : 'Rest varies'
              return isHost ? (
                <div key={e.name} className="bg-raised rounded-xl">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Icon icon={getExerciseIcon(ex)} width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{e.name}</div>
                      <div className="text-xs text-muted truncate">{setsSummary(e.sets)} · {restText}</div>
                    </div>
                    <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                      className="press text-xs font-semibold text-neon-ink min-h-[36px] px-2 rounded-md">
                      {open === i ? 'Done' : 'Edit sets'}
                    </button>
                    <IconButton icon="mdi:close" label={`Remove ${e.name}`} tone="danger" onClick={() => removeExercise(i)} className="w-9 h-9" />
                  </div>
                  {open === i && (
                    <SetEditor sets={e.sets} name={e.name} lastExercise={i === plan.length - 1} onChange={sets => edit(i, sets)} />
                  )}
                </div>
              ) : (
                <ExerciseRow key={e.name} icon={getExerciseIcon(ex)} name={e.name} meta={restText} value={setsSummary(e.sets)} />
              )
            })}
          </div>
        </Card>
      )}

      {/* Exercise picker: the host builds the workout */}
      {isHost ? (
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
              const added = plan.some(e => e.name === ex.name)
              return (
                <ExerciseRow key={i} icon={getExerciseIcon(ex)} name={ex.name} meta={ex.muscle}>
                  {added
                    ? <span className="w-9 h-9 flex items-center justify-center text-neon-ink"><Icon icon="mdi:check" width={20} aria-label="Added" /></span>
                    : <Button size="sm" icon="mdi:plus" onClick={() => addExercise(ex)}>Add</Button>}
                </ExerciseRow>
              )
            })}
          </div>
        </Card>
      ) : plan.length === 0 && (
        <div className="text-sm text-muted text-center py-2">The host is choosing the exercises.</div>
      )}

      {/* Host starts; participants wait */}
      {isHost ? (
        <>
          <Button full icon="mdi:play" onClick={onStart} disabled={plan.length === 0}>
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

const SET_INPUT = 'bg-surface border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-lg px-2 h-10 text-sm font-semibold tabular-nums outline-none transition-colors'

// One row per set: reps target and the rest that follows it
function SetEditor({ sets, name, lastExercise, onChange }) {
  const change = (k, patch) => onChange(sets.map((x, j) => (j === k ? { ...x, ...patch } : x)))
  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="grid grid-cols-[3.25rem_1fr_1.4fr_2.25rem] gap-2 text-xs text-muted px-0.5" aria-hidden="true">
        <span>Set</span><span>Reps</span><span>Rest after</span><span />
      </div>
      {sets.map((x, k) => {
        const last = k === sets.length - 1
        const noRest = last && lastExercise
        return (
          <div key={k} className="grid grid-cols-[3.25rem_1fr_1.4fr_2.25rem] gap-2 items-center">
            <span className="text-sm font-semibold text-ink-2 tabular-nums">{k + 1}</span>
            <input type="number" inputMode="numeric" min="1" max="100" placeholder="Any" value={x.reps ?? ''}
              aria-label={`${name}, set ${k + 1} reps target`}
              onChange={e => change(k, { reps: e.target.value === '' ? null : Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
              className={`${SET_INPUT} w-full text-center`} />
            {noRest ? (
              <span className="text-xs text-muted">End of workout</span>
            ) : (
              <select value={x.rest} aria-label={last ? `${name}, rest before the next exercise` : `${name}, rest after set ${k + 1}`}
                onChange={e => change(k, { rest: Number(e.target.value) })}
                className={`${SET_INPUT} w-full`}>
                {REST_OPTIONS.map(r => <option key={r} value={r}>{last ? `${restLabel(r)} to next` : restLabel(r)}</option>)}
              </select>
            )}
            {sets.length > 1
              ? <IconButton icon="mdi:minus-circle-outline" label={`Remove set ${k + 1} of ${name}`} onClick={() => onChange(sets.filter((_, j) => j !== k))} className="w-9 h-9" />
              : <span />}
          </div>
        )
      })}
      {sets.length < MAX_SETS && (
        <Button size="sm" variant="secondary" icon="mdi:plus" onClick={() => onChange([...sets, { ...sets[sets.length - 1] }])}>Add set</Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Live standings: where everyone is, shared by training, rest and done
// ─────────────────────────────────────────────────────────────────────────────

// Re-render every few seconds so "Resting" turns back into the next set on time
function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function LiveBoard({ rows, myId, title, detailed = false }) {
  const { fmt, fmtVolume } = useUnit()
  return (
    <Card pad={detailed ? 'lg' : 'md'}>
      <SectionTitle action={<Fact icon="mdi:account-multiple">{rows.length}</Fact>}>{title}</SectionTitle>
      <ol className="space-y-2" aria-label={title}>
        {rows.map((r, i) => {
          const me = r.id === myId
          return (
            <li key={r.id} className={`rounded-xl px-3 py-2.5 border ${me ? 'bg-neon-tint border-neon-stroke/30' : 'bg-raised border-transparent'}`}>
              <div className="flex items-center gap-3">
                <RankChip rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-ink truncate">{r.name}{me && <span className="font-normal text-muted"> (you)</span>}</span>
                    {r.resting && <span className="text-2xs font-semibold text-muted bg-inset rounded px-1.5 py-0.5 flex-shrink-0">Resting</span>}
                  </div>
                  <div className={`text-xs truncate ${r.finished ? 'text-neon-ink font-semibold' : 'text-muted'}`}>{r.where}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-neon-ink tabular-nums">{fmtVolume(r.volume)}</div>
                  <div className="text-xs text-muted tabular-nums">{r.done}/{r.total} sets</div>
                </div>
              </div>
              {detailed && r.latest && (
                <div className="text-xs text-ink-2 mt-1.5 pl-10 truncate">
                  Last set: {r.latest.exercise}, {Number(r.latest.weight) ? `${fmt(r.latest.weight)} × ${r.latest.reps}` : `${r.latest.reps} reps`}
                </div>
              )}
              <div className="h-1 bg-inset rounded-full overflow-hidden mt-2" aria-hidden="true">
                <div className="h-full bg-neon rounded-full transition-[width] duration-500" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function EndEarly({ onEnd, confirm, setConfirm }) {
  return confirm ? (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>Keep going</Button>
      <Button variant="danger" className="flex-1" onClick={onEnd}>End workout</Button>
    </div>
  ) : (
    <button onClick={() => setConfirm(true)}
      className="w-full text-center text-xs text-muted hover:text-ink-2 py-2 min-h-[44px] transition-colors">
      End workout early
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────

function TrainingScreen({ plan, exercises, exIdx, setIdx, participants, allSets, myId, weight, setWeight, reps, setReps, onLog, onEnd, confirmEnd, setConfirmEnd }) {
  const { unit } = useUnit()
  const now = useNow()
  const ex = exercises[exIdx]
  if (!ex) return null
  const sets = plan[exIdx].sets
  const target = sets[setIdx]?.reps
  const rest = restAfter(plan, exIdx, setIdx)
  // My own row follows this screen: I'm lifting, whatever my last set's time says
  const rows = standings({ sets: allSets, participants, plan, now })
    .map(r => r.id === myId ? { ...r, resting: false, where: `${ex.name} · set ${setIdx + 1}/${sets.length}` } : r)
  const mine = rows.find(r => r.id === myId)
  const total = countSets(plan)
  const done = mine?.done ?? setsDone(plan, exIdx, setIdx)
  const next = exercises[exIdx + 1]

  return (
    <div className="space-y-4 py-4 slide-in">
      {/* My progress through the whole workout */}
      <div>
        <div className="flex justify-between text-xs mb-2">
          <span className="font-semibold text-ink-2">Exercise {exIdx + 1} of {exercises.length}</span>
          <span className="font-semibold text-neon-ink tabular-nums">{done} of {total} sets</span>
        </div>
        <div className="h-1.5 bg-raised rounded-full overflow-hidden" role="progressbar" aria-label="Workout progress"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="h-full bg-neon rounded-full transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Exercise card */}
      <Card hero>
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon icon={getExerciseIcon(ex)} width={30} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
          <div className="font-bold text-2xl text-ink leading-tight break-words">{ex.name}</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Fact icon="mdi:repeat">Set {setIdx + 1} of {sets.length}</Fact>
          {target && <Fact icon="mdi:target">Target {target} reps</Fact>}
          {rest > 0 && <Fact icon="mdi:timer-sand">Then rest {restLabel(rest).toLowerCase()}</Fact>}
          {next && <Fact icon="mdi:arrow-right">Next: {next.name}</Fact>}
        </div>
        <div className="flex gap-1.5 mt-4" aria-hidden="true">
          {sets.map((_, i) => (
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
              type="number" placeholder={target ? String(target) : '0'} aria-label="Reps" value={reps}
              onChange={e => setReps(e.target.value)} min="1" inputMode="numeric"
              className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-2xl font-bold tabular-nums text-center outline-none transition-colors"
            />
          </div>
        </div>
        <Button full icon="mdi:check" onClick={onLog} disabled={!(parseInt(reps) >= 1)}>Log set {setIdx + 1}</Button>
        <p className="text-xs text-muted text-center mt-2">Bodyweight? Leave weight empty.</p>
      </Card>

      <LiveBoard rows={rows} myId={myId} title="Live standings" />

      <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest: the timer, then everyone's standing
// ─────────────────────────────────────────────────────────────────────────────

function RestScreen({ plan, exIdx, setIdx, restLeft, restSecs, allSets, participants, myId, onSkip, onEnd }) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const now = useNow()
  const ex = plan[exIdx]
  const upNext = setIdx + 1 < (ex?.sets.length ?? 0) ? `${ex.name}, set ${setIdx + 2}` : plan[exIdx + 1]?.name
  const rows = standings({ sets: allSets, participants, plan, now })
  const place = rows.findIndex(r => r.id === myId) + 1

  const pct = Math.min(1, restLeft / restSecs) * 100
  const r = 70
  const circ = 2 * Math.PI * r
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-5 py-4 fade-in">
      <div className="flex flex-col items-center">
        <div className="text-xs text-muted mb-1">
          <span className="inline-flex items-center gap-1.5"><Icon icon="mdi:check-circle-outline" width={16} className="text-neon-ink" />{ex?.name}, set {setIdx + 1} done</span>
        </div>
        <div className="relative w-44 h-44 my-2">
          <svg className="w-44 h-44 -rotate-90" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={r} fill="none" className="stroke-line" strokeWidth="8" />
            <circle cx="90" cy="90" r={r} fill="none" className="stroke-neon-stroke" strokeWidth="8"
              strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-bold text-4xl text-neon-ink leading-none tabular-nums">{fmtTime(restLeft)}</div>
            <div className="text-xs font-medium text-muted">rest</div>
          </div>
        </div>
        {upNext && <div className="text-sm text-ink-2 mb-1">Next: <span className="font-semibold text-ink">{upNext}</span></div>}
        {place > 0 && rows.length > 1 && (
          <div className="text-sm text-ink-2 mb-3">You're <span className="font-bold text-neon-ink">#{place}</span> of {rows.length}</div>
        )}
        <Button variant="secondary" onClick={onSkip}>Skip rest</Button>
      </div>

      <LiveBoard rows={rows} myId={myId} title="Live standings" detailed />

      <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done: final standings, updating while others finish
// ─────────────────────────────────────────────────────────────────────────────

function DoneScreen({ allSets, plan, exercises, participants, myId, startTime, onHome }) {
  const { fmtVolume } = useUnit()
  const now = useNow()
  const duration = startTime ? Math.round((now - startTime) / 60000) : 0
  const rows = standings({ sets: allSets, participants, plan, now })
  const going = rows.filter(r => !r.finished).length
  const leader = rows[0]
  const myName = rows.find(r => r.id === myId)?.name

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="text-center">
        <Icon icon="mdi:trophy-outline" width={48} className="mx-auto mb-3 text-neon-ink" aria-hidden="true" />
        <div className="font-bold text-3xl text-neon-ink">Group workout complete</div>
        {duration > 0 && <div className="text-muted mt-1 text-sm">Duration: {duration} min</div>}
      </div>

      {leader && (
        <Card hero className="text-center">
          <div className="text-xs font-semibold text-neon-ink">{going ? 'Leading for now' : 'Winner'}</div>
          <Icon icon="mdi:crown-outline" width={28} className="mx-auto my-1 text-neon-ink" aria-hidden="true" />
          <div className="font-bold text-2xl text-ink">{leader.name}</div>
          <div className="text-muted text-sm">{fmtVolume(leader.volume)} total volume</div>
          {leader.id === myId && <div className="mt-2 text-sm font-semibold text-neon-ink">That's you.</div>}
        </Card>
      )}

      <LiveBoard rows={rows} myId={myId} detailed
        title={going ? `Standings · ${going} still training` : 'Final standings'} />

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
                    <Icon icon={getExerciseIcon(ex)} width={16} className="text-muted flex-shrink-0" aria-hidden="true" />
                    <span className="text-xs font-semibold text-ink-2">{ex.name}</span>
                  </div>
                  <div className="space-y-1.5">
                    {lb.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <RankChip rank={i + 1} small />
                        <span className={`text-xs flex-1 ${entry.name === myName ? 'font-bold text-ink' : 'text-muted'}`}>{entry.name}</span>
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
