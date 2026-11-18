import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler, SESSION_LIMIT_MS } from '../lib/shell.js'
import { Button, Card, Chip, Segmented, PageHeader, SectionTitle, Fact, InfoButton, IconButton, ExerciseRow, RankChip, SkeletonRows, Avatar, AvatarStack } from '../components/ui/index.js'
import { NicknameCard, LeaderboardTab, FriendsTab } from '../components/Social.jsx'
import { fetchMySocial, clearInvite, fetchFriends, fetchMyPoints, fetchLeaderboard, sendFriendRequest } from '../lib/socialApi.js'
import { NICKNAME_RE } from '../lib/points.js'
import { EXERCISES, MUSCLES, getExerciseIcon, todayKey, localDateKey } from '../lib/data.js'
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
  removeRoomMember,
  leaveGroupSession,
  ROOM_SIZE,
  REACTIONS,
  sendReaction,
  fetchReactions,
  scheduleNextSession,
  fetchNextSessions,
  setNextSessionRoom,
  leaveNextSession,
} from '../lib/groupApi.js'
import { standings, mergeSets } from '../lib/groupStandings.js'
import { newClientId, queueSet, loadQueued, flushQueued, pendingRow } from '../lib/roomQueue.js'
import { roomUrl, roomShareText } from '../lib/roomLink.js'
import { shareLink } from '../lib/shopLink.js'
import PersonSafetySheet from '../components/PersonSafetySheet.jsx'
import ShareSheet from '../components/ShareSheet.jsx'
import { cardContent } from '../lib/shareCard.js'
import { bestSetEach, beatItRows } from '../lib/roomSummary.js'
import { planFrom, makeSets, totalSets as countSets, setsDone, restAfter, restLabel, setsSummary, REST_OPTIONS, MAX_SETS, freePlan, freeRoom, freePicks, FREE_SET_OPTIONS, FREE_REST_OPTIONS } from '../lib/groupPlan.js'
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

const TABS = [['rooms', 'Rooms'], ['friends', 'Friends'], ['ranks', 'Leaderboard']]
const SESSION_SCREENS = ['training', 'rest', 'picker']

// intent: { tab, invite } from App, e.g. after opening an athrion.app/add/<nickname> link
// isMinor: an account under 16 (032): no rooms or friends (the server refuses them too)
export default function Group({ session, intent, onIntentDone, isMinor = false }) {
  const { toLb } = useUnit()
  const [screen, setScreen] = useState('home')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [loading, setLoading] = useState(false)
  const [groupSession, setGroupSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [allSets, setAllSets] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [plan, setPlan] = useState([]) // [{ name, sets: [{ reps, rest }] }], see groupPlan.js; in a free room, the host's picks so far
  const [replacing, setReplacing] = useState(false) // a free room's host changing the exercise just picked
  const [free, setFree] = useState(null) // a free room's { sets, rest } (freeRoom), else null
  const [restTotal, setRestTotal] = useState(60) // length of the rest that's running
  const [exIdx, setExIdx] = useState(0)
  const [setIdx, setSetIdx] = useState(0)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [startTime, setStartTime] = useState(null)
  const [restLeft, setRestLeft] = useState(60)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [tab, setTab] = useState(intent?.tab || 'rooms')
  const tabDir = useRef(0) // which way the tab content slides: from the right going right, from the left going left
  function pickTab(t) {
    tabDir.current = TABS.findIndex(([id]) => id === t) - TABS.findIndex(([id]) => id === tab)
    setTab(t); setEditingNick(false)
  }
  const [joinStartOwn, setJoinStartOwn] = useState(false) // the failed join offers starting your own room
  const [autoEnded, setAutoEnded] = useState(false) // the 4-hour limit ended it
  const [me, setMe] = useState(undefined) // undefined = loading, null = no nickname yet
  const [editingNick, setEditingNick] = useState(false)
  const [invite, setInvite] = useState(intent?.invite || null)
  // The name a room was joined with stays fixed for that room, even if the nickname changes
  const [roomName, setRoomName] = useState(null)
  const [myId, setMyId] = useState(null)
  const myIdRef = useRef(null)
  myIdRef.current = myId
  const missingRef = useRef(0)
  // Read at save time, so a set that arrived after a timer started still counts
  const allSetsRef = useRef(allSets)
  allSetsRef.current = allSets
  const flushing = useRef(null)
  // Reactions (037): null before it runs (no buttons then)
  const [reactions, setReactions] = useState([])
  const [toast, setToast] = useState(null) // { id, name, kind, exercise } a reaction to one of my sets
  const [buzz, setBuzz] = useState(() => { try { return localStorage.getItem('athrion_room_buzz') !== 'off' } catch { return true } })
  const [safety, setSafety] = useState(null) // { id, name } being reported or blocked
  const seen = useRef({ sets: null, reactions: null })

  // Sends every queued room set (any room: one finished offline is sent too). One run at a time;
  // a call while one runs waits for it and then sends what's left.
  function sendQueued() {
    const run = async () => {
      for (const id of [...new Set(loadQueued().map(q => q.sessionId))]) {
        const rows = await flushQueued(id, async set => {
          const row = await logGroupSet(set)
          return row ? { ...row, client_id: row.client_id ?? set.clientId } : null // before 035 the row has none
        })
        if (rows.length) setAllSets(prev => (prev.some(s => s.session_id === id) ? mergeSets(prev, rows) : prev))
      }
    }
    const next = (flushing.current || Promise.resolve()).then(run).catch(() => {})
    flushing.current = next.finally(() => { if (flushing.current === next) flushing.current = null })
    return next
  }
  useEffect(() => {
    sendQueued()
    const online = () => sendQueued()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  useEffect(() => { fetchMySocial().then(setMe).catch(() => setMe(null)) }, [])
  useEffect(() => { currentUserId().then(setMyId).catch(() => {}) }, [])
  useEffect(() => {
    if (intent?.tab) setTab(intent.tab)
    if (intent?.invite) setInvite(intent.invite)
    else if (intent && !intent.join && !intent.host) onIntentDone?.() // a tab-only intent is used up once applied
  }, [intent])

  // From a room link (join: code) or Train's Train together (host: { plan, free }): once the
  // nickname is known (it's the name in the room) and no room is open
  const roomIntent = useRef(null)
  useEffect(() => {
    if (!intent || (!intent.join && !intent.host) || roomIntent.current === intent || me === undefined || screenRef.current !== 'home') return
    roomIntent.current = intent
    onIntentDone?.()
    if (intent.join) { setJoinCode(intent.join); handleJoin(intent.join) }
    else handleCreate(intent.host)
  }, [intent, me])

  const displayName = roomName || me?.nickname || session?.name || 'You'
  // Ref so callbacks always see the current screen without stale closure
  const screenRef = useRef('home')

  function goScreen(s) { screenRef.current = s; setScreen(s) }
  // The room as the host set it up: a plan, or a free room, where everyone does the host's
  // picks in order. Picks only grow (or the latest is swapped), so a stale read never drops one.
  function applyRoom(sess) {
    const fr = freeRoom(sess?.plan)
    setFree(fr)
    if (!fr) return setPlan(planFrom(sess))
    const picked = freePicks(sess.plan)
    setPlan(prev => (picked.length >= prev.length ? picked : prev))
  }
  // During the workout only a free room changes: the host's next pick. The host's own read
  // waits until their save has landed.
  const followRoom = sess => {
    if (hostEditing.current) return
    if (screenRef.current === 'lobby' || (freeRoom(sess?.plan) && SESSION_SCREENS.includes(screenRef.current))) applyRoom(sess)
  }
  const firstScreen = sess => (freeRoom(sess?.plan) ? 'picker' : 'training')
  // Back from the lobby leaves the room, as its Back button did
  useBackHandler(screen === 'lobby', () => leaveLobby(), 'Train together')

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
      applyRoom(sess)
      const target = state.screen && state.screen !== 'done' ? state.screen : (sess.status === 'lobby' ? 'lobby' : firstScreen(sess))
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
  }, [groupSession?.id, screen, isHost, exIdx, setIdx, startTime, restTotal, displayName, free, plan])

  // Realtime subscription
  useEffect(() => {
    if (!groupSession?.id) return

    fetchParticipants(groupSession.id).then(setParticipants).catch(() => {})
    // What's already there on arrival is marked seen: no buzz or toast for it
    fetchGroupSets(groupSession.id).then(sets => {
      seen.current.sets = new Set(sets.map(x => x.id))
      setAllSets(prev => mergeSets(prev, sets))
    }).catch(() => {})
    fetchReactions(groupSession.id).then(r => {
      seen.current.reactions = new Set((r ?? []).map(x => x.id))
      setReactions(prev => mergeById(prev, r))
    }).catch(() => {})

    const unsub = subscribeToGroupSession(groupSession.id, {
      onSet: (row) => setAllSets(prev => mergeSets(prev, [row])),
      onReaction: (row) => setReactions(prev => mergeById(prev, [row])),
      onParticipant: (row) => {
        setParticipants(prev =>
          prev.some(p => p.user_id === row.user_id) ? prev : [...prev, row]
        )
      },
      onSessionUpdate: (updated) => {
        setGroupSession(updated)
        if (myIdRef.current) setIsHost(updated.host_id === myIdRef.current)
        // The host's edits show in everyone's lobby; once training, only a free room's picks change
        followRoom(updated)
        // Transition everyone from lobby → training (or the picker, in a free room) when host starts
        if (updated.status === 'active' && screenRef.current === 'lobby') {
          setStartTime(Date.now())
          goScreen(firstScreen(updated))
        }
      },
    })

    return unsub
  }, [groupSession?.id])

  // A partner's new set: a short buzz (where the phone allows it, and unless turned off).
  // A reaction to one of my sets: a toast and a buzz. Nothing for what was there on arrival.
  useEffect(() => {
    if (!seen.current.sets) return
    const real = allSets.filter(s => !s.pending)
    const fresh = real.filter(s => !seen.current.sets.has(s.id))
    fresh.forEach(s => seen.current.sets.add(s.id))
    if (buzz && fresh.some(s => s.user_id !== myIdRef.current) && SESSION_SCREENS.includes(screenRef.current)) navigator.vibrate?.(20)
  }, [allSets])
  useEffect(() => {
    if (!Array.isArray(reactions) || !seen.current.reactions) return
    const fresh = reactions.filter(r => !seen.current.reactions.has(r.id))
    fresh.forEach(r => seen.current.reactions.add(r.id))
    const mine = fresh.filter(r => r.to_user === myIdRef.current && r.from_user !== myIdRef.current).at(-1)
    if (!mine) return
    const set = allSetsRef.current.find(s => s.id === mine.set_id)
    setToast({ id: mine.id, name: mine.from_name, kind: mine.kind, exercise: set?.exercise })
    navigator.vibrate?.([15, 60, 15])
  }, [reactions])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function toggleBuzz() {
    setBuzz(b => { try { localStorage.setItem('athrion_room_buzz', b ? 'off' : 'on') } catch {} return !b })
  }
  async function react(set, kind) {
    const temp = { id: `local-${set.id}-${kind}`, set_id: set.id, from_user: myId, to_user: set.user_id, kind, pending: true }
    setReactions(prev => (Array.isArray(prev) ? [...prev, temp] : prev))
    try {
      const row = await sendReaction({ sessionId: groupSession.id, set, kind, fromName: displayName })
      setReactions(prev => mergeById(prev.filter(r => r.id !== temp.id), row ? [row] : []))
    } catch (e) {
      setReactions(prev => (['42P01', 'PGRST205'].includes(e?.code) ? null : prev.filter(r => r.id !== temp.id)))
    }
  }

  // My sets still waiting to be sent (after a reload, too)
  useEffect(() => {
    if (!groupSession?.id || !myId) return
    const queued = loadQueued(groupSession.id).map(q => pendingRow(q, myId))
    if (queued.length) setAllSets(prev => mergeSets(prev, queued.filter(q => !prev.some(s => s.client_id === q.client_id))))
  }, [groupSession?.id, myId])

  // Polling for the whole session: realtime makes it instant when it's on, this keeps
  // everyone's sets and positions current when it isn't
  useEffect(() => {
    if (!groupSession?.id || screen === 'home') return

    const poll = setInterval(async () => {
      if (loadQueued(groupSession.id).length) sendQueued()
      try {
        const [parts, sets, sess, reacts] = await Promise.all([
          fetchParticipants(groupSession.id),
          fetchGroupSets(groupSession.id),
          fetchGroupSession(groupSession.id).catch(() => null),
          fetchReactions(groupSession.id).catch(() => []),
        ])
        setReactions(prev => mergeById(prev, reacts))
        // Out of the room (the host removed you): twice in a row, so a slow first read can't do it
        if (parts && myIdRef.current && screenRef.current !== 'done' && !parts.some(p => p.user_id === myIdRef.current)) {
          if (++missingRef.current >= 2) { handleHome(); setJoinError('The host removed you from this room.'); return }
        } else missingRef.current = 0
        if (parts) setParticipants(parts)
        if (sets) setAllSets(prev => mergeSets(prev, sets))
        if (sess) {
          setGroupSession(sess)
          if (myIdRef.current) setIsHost(sess.host_id === myIdRef.current)
          followRoom(sess)
          if (sess.status === 'active' && screenRef.current === 'lobby') {
            setStartTime(Date.now())
            goScreen(firstScreen(sess))
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
      if (free) return toPicker() // a free room: pick the next exercise, or finish
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

  // A free room, after an exercise: on to the host's next pick if it's there already, else the
  // picker (host) or waiting for it (everyone else). replace: the host swaps the exercise just
  // picked, before any set of it.
  function toPicker({ replace = false } = {}) {
    localStorage.removeItem('athrion_group_rest_end')
    setSetIdx(0); setWeight(''); setReps('')
    setReplacing(replace)
    if (replace) return goScreen('picker')
    const next = exIdx + 1
    setExIdx(next)
    goScreen(next < plan.length ? 'training' : 'picker')
  }

  // Training screen's button in a free room: the host changes an exercise not started yet;
  // anyone else (or after a set) moves on to the next one
  function leaveExercise() {
    toPicker({ replace: isHost && setIdx === 0 })
  }

  // Only the host picks; the pick is saved with the room and everyone else follows it
  function pickExercise(ex) {
    const item = { name: ex.name, sets: makeSets(free?.sets ?? 3, free?.rest ?? 60) }
    const idx = replacing ? exIdx : plan.length
    const next = [...plan.slice(0, idx), item, ...plan.slice(idx + 1)]
    setPlan(next)
    setReplacing(false)
    setExIdx(idx); setSetIdx(0); setWeight(''); setReps('')
    goScreen('training')
    hostEditing.current++
    saveSessionPlan(groupSession.id, freePlan({ ...free, picks: next.map(e => e.name) }))
      .catch(err => console.error(err))
      .finally(() => { hostEditing.current-- })
  }

  // Waiting for the host's pick: start it as soon as it arrives
  useEffect(() => {
    if (free && screen === 'picker' && !replacing && exIdx < plan.length) {
      setSetIdx(0); setWeight(''); setReps('')
      goScreen('training')
    }
  }, [free, screen, replacing, exIdx, plan.length])

  // Only the host edits the room (RLS allows only them). Their own polling mustn't undo an
  // edit that's still saving, so it waits until the last save lands.
  const hostEditing = useRef(0)
  // next is the room's plan as saved: exercises, or freePlan(...) for a free room
  async function editPlan(next) {
    applyRoom({ plan: next })
    hostEditing.current++
    try { await saveSessionPlan(groupSession.id, next) } catch (err) { console.error(err) }
    finally { hostEditing.current-- }
  }

  // host: Train's Train together, the workout already picked ({ plan } or { free }), and the
  // share sheet opens as soon as the room exists
  async function handleCreate(host = null) {
    setLoading(true)
    try {
      const sess = await createGroupSession({ displayName })
      setRoomName(displayName)
      setGroupSession(sess)
      setIsHost(true)
      const picked = host?.free ? null : host?.plan?.length ? host.plan : null
      setPlan(picked ?? []); setFree(host?.free ? { sets: 3, rest: 60, ...host.free } : null)
      goScreen('lobby')
      if (host?.free || picked) saveSessionPlan(sess.id, host.free ? freePlan({ sets: 3, rest: 60, ...host.free }) : picked).catch(() => {})
      if (host?.next) {
        // A booked session: the room everyone joins. If someone opened it first, go to theirs.
        const code = await setNextSessionRoom(host.next, sess.code).catch(() => sess.code)
        if (code && code !== sess.code) {
          leaveGroupSession(sess.id).catch(() => {})
          setLoading(false)
          return handleJoin(code)
        }
      } else if (host) shareLink(roomUrl(sess.code), roomShareText(sess.code))
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // code: passed when the 6th character is typed, before the state has caught up
  async function handleJoin(code = joinCode) {
    if (!code.trim() || loading) return
    setLoading(true); setJoinError('')
    try {
      const sess = await joinGroupSession(code.trim(), displayName)
      setRoomName(displayName)
      setGroupSession(sess)
      setIsHost(false)
      applyRoom(sess)
      goScreen('lobby')
    } catch (err) {
      setJoinError(err.message)
      setJoinStartOwn(!!err.startOwn)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartWorkout() {
    if (!groupSession?.id || (!free && plan.length === 0)) return
    try {
      await saveSessionPlan(groupSession.id, free ? freePlan(free) : plan)
      await startGroupSession(groupSession.id)
      setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
      setStartTime(Date.now())
      goScreen(free ? 'picker' : 'training')
    } catch (err) { console.error(err) }
  }

  // The set shows and the rest starts at once; it's sent in the background and waits on the
  // phone while there's no signal (roomQueue.js)
  function handleLogSet() {
    const w = toLb(parseFloat(weight || '0')) // typed in the person's unit, stored in lb; 0 for bodyweight
    const r = parseInt(reps)
    if (!(w >= 0) || !(r >= 1) || !groupSession?.id) return
    const set = {
      sessionId: groupSession.id, displayName, exercise: plan[exIdx]?.name, setNum: setIdx + 1,
      weight: w, reps: r, clientId: newClientId(), loggedAt: new Date().toISOString(),
    }
    queueSet(set)
    setAllSets(prev => mergeSets(prev, [pendingRow(set, myId)]))
    sendQueued()
    // A free room always rests, the last set's rest too: it's the break before the next pick
    const rest = free ? free.rest : restAfter(plan, exIdx, setIdx)
    if (!rest) { advanceAfterRest(); return } // no rest set for this one, or the workout is done
    setRestTotal(rest); setRestLeft(rest)
    localStorage.setItem('athrion_group_rest_end', String(Date.now() + rest * 1000))
    goScreen('rest')
  }

  // auto: the 4-hour limit ended it, so it's timed at 4 hours and dated the day it started
  async function saveGroupWorkoutToHistory(auto = false) {
    const mySets = allSetsRef.current.filter(s => (myId ? s.user_id === myId : s.display_name === displayName))
    if (!mySets.length) return
    const volume   = mySets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0)
    const duration = startTime ? Math.round((Math.min(Date.now(), startTime + SESSION_LIMIT_MS) - startTime) / 60000) : 0
    const name     = exercises.length > 0
      ? `Group: ${exercises.slice(0, 2).map(e => e.name).join(', ')}${exercises.length > 2 ? '…' : ''}`
      : 'Group workout'
    const formattedSets = mySets.map(s => ({ ex: s.exercise, set: s.set_num, weight: s.weight, reps: s.reps }))
    try {
      await saveWorkoutEntry({
        date:     auto && startTime ? localDateKey(new Date(startTime)) : todayKey(),
        name,
        duration: `${duration}min`,
        volume,
        sets:     formattedSets,
      })
    } catch (err) {
      console.error('Failed to save group workout to history:', err)
    }
  }

  async function handleEnd({ auto = false } = {}) {
    setAutoEnded(auto)
    localStorage.removeItem('athrion_group_rest_end')
    goScreen('done') // first, so the 4-hour timer can't fire twice
    await sendQueued() // quick: offline, it fails at once and the sets stay queued
    await saveGroupWorkoutToHistory(auto)
    if (isHost && groupSession?.id) {
      try { await leaveGroupSession(groupSession.id, { keepSeat: true }) }
      catch { try { await endGroupSession(groupSession.id) } catch {} } // before 034
    }
    localStorage.removeItem(SESSION_PERSIST_KEY)
  }

  // A room's workout ends by itself 4 hours after it started (straight away when an older one is restored)
  const endRef = useRef(handleEnd)
  endRef.current = handleEnd
  useEffect(() => {
    if (!startTime || !SESSION_SCREENS.includes(screen)) return
    const id = setTimeout(() => endRef.current({ auto: true }), Math.max(0, startTime + SESSION_LIMIT_MS - Date.now()))
    return () => clearTimeout(id)
  }, [startTime, screen])

  function handleHome() {
    goScreen('home')
    setGroupSession(null); setParticipants([]); setAllSets([]); setIsHost(false)
    setPlan([]); setFree(null); setExIdx(0); setSetIdx(0); setWeight(''); setReps('')
    setJoinCode(''); setJoinError(''); setConfirmEnd(false); setRoomName(null); setAutoEnded(false)
    localStorage.removeItem('athrion_group_rest_end')
    localStorage.removeItem(SESSION_PERSIST_KEY)
  }

  function leaveLobby() {
    const id = groupSession?.id
    handleHome()
    if (id) leaveGroupSession(id).catch(() => {})
  }

  function inviteDone() {
    setInvite(null)
    clearInvite()
    onIntentDone?.()
  }

  const waiting = allSets.filter(s => s.pending && s.session_id === groupSession?.id).length
  const safetySheet = safety && (
    <PersonSafetySheet person={safety} sessionId={groupSession?.id} onClose={() => setSafety(null)}
      onBlocked={p => setParticipants(prev => (isHost ? prev.filter(x => x.user_id !== p.id) : prev))} />
  )
  const feed = (
    <>
      <PartnerFeed sets={allSets} reactions={reactions} myId={myId} buzz={buzz} onToggleBuzz={toggleBuzz}
        onReact={react} onPerson={setSafety} />
      {toast && <ReactionToast toast={toast} />}
      {safetySheet}
    </>
  )

  if (screen === 'home') return (
    <div className="space-y-4 py-4">
      <PageHeader icon="mdi:account-group-outline" title="Train together" />
      <Segmented label="Train together" options={TABS} value={tab} onChange={pickTab} />

      <div key={tab} className={tabDir.current < 0 ? 'slide-from-left' : 'slide-from-right'}>
      {isMinor && tab !== 'ranks' ? (
        <Card className="space-y-2">
          <div className="font-bold text-lg text-ink">Opens when you're 16</div>
          <p className="text-sm text-ink-2">Rooms and friends aren't on accounts under 16. Your workouts still earn points, shown to you on Leaderboard.</p>
        </Card>
      ) : tab === 'rooms' ? (
        <HomeScreen
          joinCode={joinCode}
          setJoinCode={c => { setJoinCode(c); setJoinError(''); setJoinStartOwn(false) }}
          joinError={joinError}
          startOwn={joinStartOwn}
          loading={loading}
          onCreate={() => handleCreate()}
          onJoin={handleJoin}
          nickname={me?.nickname}
          onTab={pickTab}
          onOpenNext={n => {
            if (n.room_code) { setJoinCode(n.room_code); return handleJoin(n.room_code) }
            const fr = freeRoom(n.plan)
            handleCreate(fr ? { free: fr, next: n.id } : { plan: planFrom({ plan: n.plan }), next: n.id })
          }}
        />
      ) : me === undefined ? (
        <SkeletonRows rows={3} />
      ) : me === null || editingNick ? (
        <NicknameCard current={me?.nickname} onSaved={m => { setMe(m); setEditingNick(false) }}
          onCancel={me ? () => setEditingNick(false) : null} />
      ) : tab === 'ranks' ? (
        <LeaderboardTab me={me} onMeChange={setMe} onAddFriends={() => pickTab('friends')} minor={isMinor} />
      ) : (
        <FriendsTab me={me} invite={invite} onInviteDone={inviteDone} onEditNickname={() => setEditingNick(true)}
          onTrainNow={() => handleCreate({ share: true })} />
      )}
      </div>
    </div>
  )

  if (screen === 'lobby') return (
    <LobbyScreen
      groupSession={groupSession}
      participants={participants}
      isHost={isHost}
      plan={plan}
      free={free}
      onChange={editPlan}
      onStart={handleStartWorkout}
      onRemove={async userId => {
        await removeRoomMember(groupSession.id, userId)
        setParticipants(prev => prev.filter(p => p.user_id !== userId))
      }}
      onBack={leaveLobby}
      onPerson={setSafety}
      safetySheet={safetySheet}
      myId={myId}
    />
  )

  if (screen === 'picker') return (
    <>
    <WaitingNote count={waiting} />
    <PickerScreen
      feed={feed}
      picked={plan}
      current={plan[exIdx]?.name}
      free={free}
      isHost={isHost}
      replacing={replacing}
      hostName={participants.find(p => p.user_id === groupSession?.host_id)?.display_name}
      onCancelReplace={() => { setReplacing(false); goScreen('training') }}
      allSets={allSets}
      participants={participants}
      myId={myId}
      onPick={pickExercise}
      onEnd={handleEnd}
    />
    </>
  )

  if (screen === 'training') return (
    <>
    <WaitingNote count={waiting} />
    <TrainingScreen
      feed={feed}
      plan={plan}
      free={free}
      isHost={isHost}
      onNextExercise={leaveExercise}
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
      onEnd={() => handleEnd()}
      confirmEnd={confirmEnd}
      setConfirmEnd={setConfirmEnd}
    />
    </>
  )

  if (screen === 'rest') return (
    <>
    <WaitingNote count={waiting} />
    <RestScreen
      feed={feed}
      plan={plan}
      free={free}
      exIdx={exIdx}
      setIdx={setIdx}
      isHost={isHost}
      restLeft={restLeft}
      restSecs={restTotal}
      allSets={allSets}
      participants={participants}
      myId={myId}
      onSkip={advanceAfterRest}
      onEnd={() => handleEnd()}
    />
    </>
  )

  if (screen === 'done') return (
    <>
    <WaitingNote count={waiting} />
    <DoneScreen
      allSets={allSets}
      plan={plan}
      free={free}
      autoEnded={autoEnded}
      exercises={exercises}
      participants={participants}
      myId={myId}
      startTime={startTime}
      onHome={handleHome}
      sessionId={groupSession?.id}
      onPerson={setSafety}
      safetySheet={safetySheet}
    />
    </>
  )
}

// Rows from realtime and polling, once each by id. null stays null (reactions not available)
function mergeById(prev, rows) {
  if (rows === null) return null
  if (!Array.isArray(prev)) return prev
  const byId = new Map(prev.map(r => [r.id, r]))
  for (const r of rows ?? []) if (r?.id) byId.set(r.id, r)
  return [...byId.values()]
}

const REACTION_WORD = { laugh: 'laughed at', like: 'liked', lift: 'cheered' }

// Partners' latest sets, newest first, each with the three reactions. The vibrate switch is here.
function PartnerFeed({ sets, reactions, myId, buzz, onToggleBuzz, onReact, onPerson }) {
  const { fmt } = useUnit()
  const now = useNow()
  const theirs = sets.filter(s => !s.pending && s.user_id && s.user_id !== myId).slice(-5).reverse()
  const canReact = Array.isArray(reactions)
  return (
    <Card>
      <SectionTitle action={
        <IconButton icon={buzz ? 'mdi:vibrate' : 'mdi:vibrate-off'} onClick={onToggleBuzz}
          label={`Vibrate when a partner logs a set: ${buzz ? 'on' : 'off'}`} className={buzz ? 'text-neon-ink' : ''} />
      }>Partners' sets</SectionTitle>
      {theirs.length === 0 ? (
        <p className="text-sm text-muted">Sets your partners log show up here. Tap a reaction to cheer them on.</p>
      ) : (
        <ul className="space-y-2" aria-label="Partners' latest sets">
          {theirs.map(s => {
            const on = canReact ? reactions.filter(r => r.set_id === s.id) : []
            const ago = Math.max(0, Math.round((now - new Date(s.logged_at).getTime()) / 60000))
            return (
              <li key={s.id} className="slide-in bg-raised rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar name={s.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink break-words"><span className="font-semibold">{s.display_name}</span> · {s.exercise}</div>
                    <div className="text-xs text-muted tabular-nums">
                      {Number(s.weight) ? `${fmt(s.weight)} × ${s.reps}` : `${s.reps} reps`} · {ago < 1 ? 'just now' : `${ago} min ago`}
                    </div>
                  </div>
                  <IconButton icon="mdi:dots-vertical" label={`More for ${s.display_name}`} className="w-9 h-9"
                    onClick={() => onPerson({ id: s.user_id, name: s.display_name })} />
                </div>
                {canReact && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-11" role="group" aria-label={`React to ${s.display_name}'s set`}>
                    {REACTIONS.map(([kind, icon, label]) => {
                      const n = on.filter(r => r.kind === kind).length
                      const mine = on.some(r => r.kind === kind && r.from_user === myId)
                      return (
                        <button key={kind} type="button" aria-pressed={mine} disabled={mine}
                          aria-label={`${label}${n ? `, ${n}` : ''}`} onClick={() => onReact(s, kind)}
                          className={`press min-h-[36px] min-w-[44px] px-2.5 rounded-full border inline-flex items-center justify-center gap-1 text-sm font-semibold tabular-nums transition-colors ${
                            mine ? 'bg-neon-tint border-neon-stroke/50 text-neon-ink' : 'bg-surface border-line text-ink-2 hover:border-neon-stroke/30'}`}>
                          <Icon key={mine ? 'on' : 'off'} icon={icon} width={20} className={mine ? 'pop-in' : ''} aria-hidden="true" />
                          {n > 0 && <span>{n}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// Someone reacted to one of my sets: a short note at the top of the screen
function ReactionToast({ toast }) {
  const icon = REACTIONS.find(([k]) => k === toast.kind)?.[1] ?? 'mdi:thumb-up-outline'
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 z-50 w-[min(92vw,24rem)] pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)' }}>
      <div key={toast.id} className="slide-up flex items-center gap-3 bg-overlay border border-neon-stroke/40 rounded-2xl px-4 py-3" style={{ boxShadow: 'var(--sheet-shadow)' }}>
        <span className="w-9 h-9 rounded-full bg-neon text-on-neon flex items-center justify-center flex-shrink-0 pop-in">
          <Icon icon={icon} width={20} aria-hidden="true" />
        </span>
        <span className="text-sm text-ink break-words">
          <span className="font-semibold">{toast.name}</span> {REACTION_WORD[toast.kind] ?? 'reacted to'} your {toast.exercise ? `${toast.exercise.toLowerCase()} ` : ''}set
        </span>
      </div>
    </div>
  )
}

// My sets logged without signal, sent by themselves once it's back
function WaitingNote({ count }) {
  if (!count) return null
  return (
    <div role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-sm text-ink-2">
      <Icon icon="mdi:cloud-upload-outline" width={18} className="text-muted flex-shrink-0" />
      <span className="break-words">{count === 1 ? '1 set' : `${count} sets`} waiting for signal. {count === 1 ? 'It sends by itself' : 'They send by themselves'} once you're back online.</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────

function HomeScreen({ joinCode, setJoinCode, joinError, startOwn, loading, onCreate, onJoin, nickname, onTab, onOpenNext }) {
  const [friends, setFriends] = useState(null)
  const [board, setBoard] = useState(null) // { points, place }
  useEffect(() => {
    fetchFriends().then(f => setFriends(f.filter(x => x.status === 'accepted'))).catch(() => setFriends([]))
    Promise.all([fetchMyPoints(), fetchLeaderboard('friends')])
      .then(([p, rows]) => setBoard({ points: p.points ?? 0, place: rows.find(r => r.is_me)?.place ?? null, others: rows.length > 1 }))
      .catch(() => {})
  }, [])

  const [upcoming, setUpcoming] = useState([])
  useEffect(() => { fetchNextSessions().then(n => setUpcoming(n ?? [])).catch(() => {}) }, [])
  const crew = (friends ?? []).slice(0, 4).map(f => f.nickname)
  const seats = Math.max(0, Math.min(ROOM_SIZE, 4) - 1 - crew.length)

  return (
    <div className="space-y-4">
      {upcoming.map(n => (
        <UpNext key={n.id} session={n} me={nickname} busy={loading} onOpen={() => onOpenNext(n)}
          onSkip={() => leaveNextSession(n.id).then(() => setUpcoming(u => u.filter(x => x.id !== n.id))).catch(() => {})} />
      ))}
      <Card hero className="rise">
        <div className="flex items-center gap-2 text-xs font-semibold text-neon-ink">
          <span className="relative flex w-2 h-2" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-neon live-pulse" />
            <span className="relative w-2 h-2 rounded-full bg-neon" />
          </span>
          Live rooms · free for everyone
        </div>
        <h2 className="font-bold text-[1.75rem] xs:text-3xl leading-tight text-ink mt-1.5">Train live with friends</h2>
        <p className="text-sm text-ink-2 mt-1.5">Everyone in the room sees each set the moment it's logged, wherever they train.</p>

        <RoomSteps />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4 mb-4">
          <AvatarStack names={[nickname || 'You', ...crew]} seats={seats} />
          <span className="text-xs text-muted">
            {crew.length ? `You${crew.length === 1 ? ` and @${crew[0]}` : ` and ${crew.length} friends`} · up to ${ROOM_SIZE} in a room` : `Up to ${ROOM_SIZE} people in a room`}
          </span>
        </div>
        <Button full icon="mdi:plus" onClick={onCreate} disabled={loading}>
          {loading ? 'Creating…' : 'Create a room'}
        </Button>
      </Card>

      <Card className="rise" style={{ '--i': 1 }}>
        <div className="flex items-center gap-2">
          <Icon icon="mdi:door-open" width={22} className="text-neon-ink" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink">Got a code?</h2>
        </div>
        <p className="text-sm text-ink-2 mt-1">Type a friend's room code. You're in as soon as it's complete.</p>
        <CodeInput value={joinCode} onChange={setJoinCode} onComplete={onJoin} busy={loading} invalid={!!joinError} />
        {joinError && (
          <div role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger fade-in">
            <Icon icon="mdi:alert-circle-outline" width={18} className="flex-shrink-0 mt-px" aria-hidden="true" />
            <span className="break-words">{joinError}</span>
          </div>
        )}
        {joinError && startOwn ? (
          <Button full variant="secondary" icon="mdi:plus" className="mt-3" onClick={onCreate} disabled={loading}>Start your own room</Button>
        ) : (
          <Button full variant="secondary" className="mt-3" onClick={() => onJoin()} disabled={loading || joinCode.length < 6}>
            {loading ? 'Joining…' : 'Join room'}
          </Button>
        )}
      </Card>

      <div className="grid gap-3 rise" style={{ '--i': 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))' }}>
        <ShortcutTile label="Friends" meta={friends?.length ? 'Your crew' : 'Share your invite link'} onClick={() => onTab('friends')}
          value={friends === null ? '…' : friends.length ? `${friends.length} friend${friends.length === 1 ? '' : 's'}` : 'Add friends'}>
          {crew.length ? <AvatarStack names={crew} size="sm" /> : <Icon icon="mdi:account-plus-outline" width={26} className="text-neon-ink" aria-hidden="true" />}
        </ShortcutTile>
        <ShortcutTile label="Leaderboard" onClick={() => onTab('ranks')}
          value={board ? `${board.points} pts` : '…'}
          meta={board?.place && board.others ? `#${board.place} among friends` : 'This month'}>
          <Icon icon="mdi:trophy-outline" width={26} className="text-neon-ink" aria-hidden="true" />
        </ShortcutTile>
      </div>
    </div>
  )
}

// A booked session (038): when and who, open (or join) the room from an hour before
function UpNext({ session, me, busy, onOpen, onSkip }) {
  const now = useNow(30000)
  const at = new Date(session.starts_at)
  const mins = Math.round((at - now) / 60000)
  const soon = mins <= 60
  const others = (session.names ?? []).filter(n => n && n !== me)
  const when = mins <= 0 ? 'Now' : mins <= 60 ? `In ${mins} min` : at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <Card tone="neon" className="rise">
      <div className="flex items-center gap-3">
        <AvatarStack names={others.slice(0, 3)} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-neon-ink">Up next · {when}</div>
          <div className="text-sm font-semibold text-ink break-words">With {others.map(n => `@${n}`).join(', ') || 'your friends'}</div>
        </div>
      </div>
      <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button variant="ghost" onClick={onSkip}>Can't make it</Button>
        <Button icon={session.room_code ? 'mdi:door-open' : 'mdi:account-group-outline'} disabled={!soon || busy} onClick={onOpen}>
          {session.room_code ? 'Join the room' : soon ? 'Open the room' : 'Opens an hour before'}
        </Button>
      </div>
    </Card>
  )
}

// Create, share, train: the three steps light up one after another
function RoomSteps() {
  const steps = [['mdi:plus', 'Create'], ['mdi:share-variant-outline', 'Share the code'], ['mdi:lightning-bolt', 'Train live']]
  return (
    <ol className="mt-4 flex items-start" aria-label="How a room works">
      {steps.map(([icon, text], i) => (
        <li key={text} className="flex-1 flex flex-col items-center text-center relative min-w-0">
          {i > 0 && (
            <span aria-hidden="true" className="absolute top-5 right-1/2 w-full h-0.5 -z-0 bg-line overflow-hidden">
              <span className="block h-full bg-neon-stroke/60 grow-x" style={{ animationDelay: `${i * 260}ms` }} />
            </span>
          )}
          <span className="relative w-10 h-10 rounded-full bg-raised border border-neon-stroke/40 text-neon-ink flex items-center justify-center pop-in"
            style={{ animationDelay: `${i * 260 + 120}ms` }}>
            <Icon icon={icon} width={20} aria-hidden="true" />
          </span>
          <span className="text-xs font-medium text-ink-2 mt-1.5 px-1 break-words">{text}</span>
        </li>
      ))}
    </ol>
  )
}

// Six boxes over one real input: typed codes, pasted codes and the keyboard all just work.
// Letters only from the code alphabet; the 6th character joins straight away.
function CodeInput({ value, onChange, onComplete, busy, invalid }) {
  const [focused, setFocused] = useState(false)
  function change(e) {
    const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    onChange(code)
    if (code.length === 6 && code !== value) onComplete(code)
  }
  return (
    <div className="relative mt-3">
      <input
        aria-label="Room code" inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
        maxLength={6} value={value} onChange={change} disabled={busy}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={e => e.key === 'Enter' && value.length === 6 && onComplete(value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10" />
      <div className="grid grid-cols-6 gap-1.5 xs:gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const ch = value[i]
          const active = focused && (i === value.length || (i === 5 && value.length === 6))
          return (
            <div key={i} className={`h-14 rounded-xl border-2 flex items-center justify-center font-bold text-2xl tabular-nums transition-colors duration-150 ${
              invalid ? 'border-danger/60 bg-raised text-ink'
              : active ? 'border-neon-stroke bg-neon-tint text-ink'
              : ch ? 'border-line-strong bg-raised text-ink' : 'border-line bg-raised text-placeholder'}`}>
              {ch ? <span key={ch + i} className="pop-in">{ch}</span>
                : active ? <span className="w-0.5 h-6 bg-neon-ink caret-blink" />
                : <span className="w-2.5 h-0.5 rounded-full bg-line-strong" />}
            </div>
          )
        })}
      </div>
      {busy && <div className="absolute inset-0 rounded-xl bg-surface/60 flex items-center justify-center text-sm font-semibold text-ink-2 fade-in">Joining…</div>}
    </div>
  )
}

function ShortcutTile({ label, value, meta, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="press text-left bg-surface border border-line hover:border-neon-stroke/30 rounded-2xl p-4 transition-colors min-w-0">
      <div className="flex items-center justify-between gap-2 min-h-[2rem]">
        {children}
        <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />
      </div>
      <div className="mt-3 font-bold text-lg text-ink leading-tight break-words">{value}</div>
      <div className="text-xs text-muted break-words">{meta || label}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────────────────────────────────────

function LobbyScreen({ groupSession, participants, isHost, plan, free, onChange, onStart, onRemove, onBack, onPerson, safetySheet, myId }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(null) // index of the exercise whose sets are being edited
  const [removing, setRemoving] = useState(null) // user_id asked "Remove?"
  const [removeError, setRemoveError] = useState('')

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
  // Switching to a free workout and back keeps the exercises picked so far
  const keptPlan = useRef([])
  function setMode(mode) {
    if (mode === 'free' && !free) { keptPlan.current = plan; onChange(freePlan()) }
    if (mode === 'plan' && free) onChange(keptPlan.current)
  }

  function copyCode() {
    navigator.clipboard?.writeText(groupSession?.code || '').then(() => {
      setCopied('code'); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  // The phone's share sheet with the room link (athrion.app/r/CODE), else the link is copied
  async function shareRoom() {
    const code = groupSession?.code
    if (!code) return
    if (await shareLink(roomUrl(code), roomShareText(code))) { setCopied('link'); setTimeout(() => setCopied(false), 2000) }
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
      <Card hero className="text-center rise">
        <div className="text-xs font-semibold text-neon-ink mb-3">Room code</div>
        <div className="sr-only">{groupSession?.code}</div>
        <div className="flex justify-center gap-1.5 xs:gap-2 mb-4" aria-hidden="true">
          {String(groupSession?.code || '').split('').map((ch, i) => (
            <span key={i} className="pop-in w-10 h-12 xs:w-11 xs:h-14 rounded-xl bg-raised border border-neon-stroke/30 flex items-center justify-center font-bold text-2xl xs:text-3xl text-neon-ink tabular-nums"
              style={{ animationDelay: `${i * 60}ms` }}>{ch}</span>
          ))}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))' }}>
          <Button icon={copied === 'link' ? 'mdi:check' : 'mdi:share-variant-outline'} onClick={shareRoom}>
            {copied === 'link' ? 'Link copied' : 'Invite friends'}
          </Button>
          <Button variant="secondary" icon={copied === 'code' ? 'mdi:check' : 'mdi:content-copy'} onClick={copyCode}>
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
        </div>
      </Card>

      {/* Participants */}
      <Card className="rise" style={{ '--i': 1 }}>
        <SectionTitle action={<Fact icon="mdi:account-multiple">{participants.length} of {ROOM_SIZE}</Fact>}>Participants</SectionTitle>
        <div className="space-y-2">
          {participants.map(p => {
            const host = p.user_id === groupSession?.host_id
            return (
              <div key={p.user_id} className="slide-in flex flex-wrap items-center gap-x-3 gap-y-2 bg-raised rounded-xl px-3 py-2.5">
                <Avatar name={p.display_name} size="sm" className="pop-in" />
                <span className="text-sm font-semibold text-ink flex-1 min-w-0 break-words">{p.display_name}</span>
                {host && <Fact>Host</Fact>}
                {myId && p.user_id !== myId && onPerson && (
                  <IconButton icon="mdi:dots-vertical" label={`More for ${p.display_name}`} className="w-9 h-9"
                    onClick={() => onPerson({ id: p.user_id, name: p.display_name })} />
                )}
                {isHost && !host && (removing === p.user_id ? (
                  <span className="flex gap-1.5 ml-auto">
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Keep</Button>
                    <Button size="sm" variant="danger" onClick={async () => {
                      setRemoveError('')
                      try { await onRemove(p.user_id) } catch { setRemoveError(`Couldn't remove ${p.display_name}. Try again.`) }
                      setRemoving(null)
                    }}>Remove</Button>
                  </span>
                ) : (
                  <IconButton icon="mdi:account-remove-outline" label={`Remove ${p.display_name}`} onClick={() => setRemoving(p.user_id)} className="w-9 h-9" />
                ))}
              </div>
            )
          })}
          {removeError && <div className="text-danger text-xs">{removeError}</div>}
          {participants.length < ROOM_SIZE && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5">
              <span className="relative flex w-8 h-8 items-center justify-center flex-shrink-0" aria-hidden="true">
                <span className="absolute inset-1 rounded-full bg-neon/20 live-pulse" />
                <Icon icon="mdi:account-plus-outline" width={20} className="relative text-neon-ink" />
              </span>
              <span className="text-sm text-muted">
                {participants.length <= 1 ? 'Waiting for friends to join…' : `${ROOM_SIZE - participants.length} seat${ROOM_SIZE - participants.length === 1 ? '' : 's'} left. Friends can join after you start too.`}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Host: a planned workout, or a free one where the host picks each exercise as they go */}
      {isHost && (
        <Segmented options={[['plan', 'Plan exercises'], ['free', 'Free workout']]} value={free ? 'free' : 'plan'} onChange={setMode}
          label="Room workout" kind="choice" scroll={false} />
      )}

      {free && (isHost ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg leading-[1.3] font-semibold text-ink">Sets per exercise</h2>
              <p className="text-xs text-muted mt-0.5 mb-3">You pick each exercise as you go and everyone follows. 3 sets suits most people.</p>
            </div>
            <InfoButton title="Free workout">
              <div className="space-y-3 text-sm text-ink-2">
                <p>No list to plan: you pick an exercise, everyone in the room does its sets, then you pick the next one, until you finish. Anyone who's quicker waits for your next pick.</p>
                <p><span className="font-semibold text-ink">Rest:</span> the timer after each set. 60 to 90 seconds works for most exercises; 2 minutes for heavy lifts, 30 seconds for light or core work.</p>
              </div>
            </InfoButton>
          </div>
          <Segmented options={FREE_SET_OPTIONS.map(n => [n, String(n)])} value={free.sets} onChange={n => onChange(freePlan({ ...free, sets: n }))} label="Sets per exercise" kind="choice" scroll={false} />
          <h2 className="text-lg leading-[1.3] font-semibold text-ink mt-5">Rest between sets</h2>
          <p className="text-xs text-muted mt-0.5 mb-3">A timer starts after each set. 60 to 90 seconds suits most exercises.</p>
          <Segmented options={FREE_REST_OPTIONS.map(r => [r, `${r}s`])} value={free.rest} onChange={r => onChange(freePlan({ ...free, rest: r }))} label="Rest between sets" kind="choice" scroll={false} />
        </Card>
      ) : (
        <Card>
          <SectionTitle>Free workout</SectionTitle>
          <p className="text-sm text-ink-2">The host picks each exercise as you go, and everyone does it together.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Fact icon="mdi:repeat">{free.sets} sets each</Fact>
            <Fact icon="mdi:timer-outline">{free.rest}s rest</Fact>
          </div>
        </Card>
      ))}

      {/* Host: one tap sets every exercise, then each set can be changed below */}
      {isHost && !free && (
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
      {free ? null : isHost ? (
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
          <Button full icon="mdi:play" onClick={onStart} disabled={!free && plan.length === 0}>
            Start workout
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="text-sm text-muted">Waiting for host to start...</span>
        </div>
      )}
      {safetySheet}
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
                  <div className="text-xs text-muted tabular-nums">{r.total ? `${r.done}/${r.total}` : r.done} sets</div>
                </div>
              </div>
              {detailed && r.latest && (
                <div className="text-xs text-ink-2 mt-1.5 pl-10 truncate">
                  Last set: {r.latest.exercise}, {Number(r.latest.weight) ? `${fmt(r.latest.weight)} × ${r.latest.reps}` : `${r.latest.reps} reps`}
                </div>
              )}
              {r.total > 0 && (
                <div className="h-1 bg-inset rounded-full overflow-hidden mt-2" aria-hidden="true">
                  <div className="h-full bg-neon rounded-full transition-[width] duration-500" style={{ width: `${(r.done / r.total) * 100}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function EndEarly({ onEnd, confirm, setConfirm, label = 'End workout early' }) {
  return confirm ? (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>Keep going</Button>
      <Button variant="danger" className="flex-1" onClick={() => onEnd()}>End workout</Button>
    </div>
  ) : (
    <button onClick={() => setConfirm(true)}
      className="w-full text-center text-xs text-muted hover:text-ink-2 py-2 min-h-[44px] transition-colors">
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────

function TrainingScreen({ feed, plan, free, isHost, onNextExercise, exercises, exIdx, setIdx, participants, allSets, myId, weight, setWeight, reps, setReps, onLog, onEnd, confirmEnd, setConfirmEnd }) {
  const { unit } = useUnit()
  const now = useNow()
  const ex = exercises[exIdx]
  if (!ex) return null
  const sets = plan[exIdx].sets
  const target = sets[setIdx]?.reps
  const rest = free ? free.rest : restAfter(plan, exIdx, setIdx)
  // My own row follows this screen: I'm lifting, whatever my last set's time says
  const rows = standings({ sets: allSets, participants, plan, free, now })
    .map(r => r.id === myId ? { ...r, resting: false, where: `${ex.name} · set ${setIdx + 1}/${sets.length}` } : r)
  const mine = rows.find(r => r.id === myId)
  const total = countSets(plan)
  const done = mine?.done ?? setsDone(plan, exIdx, setIdx)
  const next = exercises[exIdx + 1]

  return (
    <div className="space-y-4 py-4 slide-in">
      {/* My progress through the whole workout; a free one has no end to measure against */}
      {free ? (
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-ink-2">Free workout · exercise {exIdx + 1}</span>
          <span className="font-semibold text-neon-ink tabular-nums">{done} {done === 1 ? 'set' : 'sets'} done</span>
        </div>
      ) : (
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
      )}

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
        {free && (
          <Button variant="ghost" full icon="mdi:swap-horizontal" onClick={onNextExercise} className="mt-2">
            {setIdx > 0 ? 'Done with this exercise' : isHost ? 'Change exercise' : 'Skip this exercise'}
          </Button>
        )}
      </Card>

      <LiveBoard rows={rows} myId={myId} title="Live standings" />
      {feed}

      <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Free room: the host picks the next exercise (as on Train's free workout) for everyone, or
// finishes; everyone else waits here for it, and it starts the moment it's picked
// ─────────────────────────────────────────────────────────────────────────────

function PickerScreen({ feed, picked, current, free, isHost, replacing, hostName, onCancelReplace, allSets, participants, myId, onPick, onEnd }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const now = useNow()
  const doneNames = new Set(picked.map(e => e.name))
  const mySets = allSets.filter(s => s.user_id === myId).length
  const rows = standings({ sets: allSets, participants, plan: picked, free, now })
  const filtered = EXERCISES.filter(e => {
    const q = search.toLowerCase()
    return (e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q)) && (filter === 'All' || e.muscle === filter)
  })

  if (!isHost) return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:account-clock-outline" title={picked.length === 0 ? 'First exercise' : 'Next exercise'}
        facts={<>
          <Fact icon="mdi:repeat">{free?.sets ?? 3} sets each</Fact>
          <Fact icon="mdi:timer-outline">{free?.rest ?? 60}s rest</Fact>
          {mySets > 0 && <Fact icon="mdi:check">{mySets} {mySets === 1 ? 'set' : 'sets'} done</Fact>}
        </>} />
      <Card>
        <div className="flex items-center gap-3">
          <span className="relative flex w-2.5 h-2.5 flex-shrink-0" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-neon live-pulse" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-neon" />
          </span>
          <div className="min-w-0">
            <div className="text-base font-semibold text-ink">Waiting for {hostName ? `@${hostName}` : 'the host'}</div>
            <p className="text-sm text-muted">The host picks each exercise. It starts here as soon as they do.</p>
          </div>
        </div>
      </Card>

      {mySets > 0 && <Button full variant="secondary" icon="mdi:flag-checkered" onClick={() => onEnd()}>Finish workout</Button>}

      <LiveBoard rows={rows} myId={myId} title="Live standings" />
      {feed}

      {mySets === 0 && <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} label="End workout" />}
    </div>
  )

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:format-list-checks" title={replacing ? 'Change exercise' : picked.length === 0 ? 'First exercise' : 'Next exercise'}
        facts={<>
          <Fact icon="mdi:repeat">{free?.sets ?? 3} sets each</Fact>
          <Fact icon="mdi:timer-outline">{free?.rest ?? 60}s rest</Fact>
          {mySets > 0 && <Fact icon="mdi:check">{mySets} {mySets === 1 ? 'set' : 'sets'} done</Fact>}
        </>} />

      <p className="text-sm text-muted">Everyone in the room does the exercise you pick.</p>
      {replacing && <Button full variant="secondary" icon="mdi:arrow-left" onClick={onCancelReplace}>Keep {current ?? 'this exercise'}</Button>}
      {!replacing && mySets > 0 && <Button full icon="mdi:flag-checkered" onClick={() => onEnd()}>Finish workout</Button>}

      <Card>
        <input
          className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors mb-3"
          placeholder="Search exercises" aria-label="Search exercises"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {['All', ...MUSCLES.filter(m => m !== 'All')].map(m => (
            <Chip key={m} selected={filter === m} onClick={() => setFilter(m)}>{m}</Chip>
          ))}
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {filtered.map(ex => (
            <ExerciseRow key={ex.name} icon={getExerciseIcon(ex)} name={ex.name} meta={ex.muscle}>
              {doneNames.has(ex.name) && <Fact icon="mdi:check">Done</Fact>}
              <Button size="sm" onClick={() => onPick(ex)} aria-label={`Go: ${ex.name}`}>Go</Button>
            </ExerciseRow>
          ))}
        </div>
      </Card>

      <LiveBoard rows={rows} myId={myId} title="Live standings" />
      {feed}

      {mySets === 0 && <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} label="End workout" />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest: the timer, then everyone's standing
// ─────────────────────────────────────────────────────────────────────────────

function RestScreen({ feed, plan, free, isHost, exIdx, setIdx, restLeft, restSecs, allSets, participants, myId, onSkip, onEnd }) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const now = useNow()
  const ex = plan[exIdx]
  const upNext = setIdx + 1 < (ex?.sets.length ?? 0) ? `${ex.name}, set ${setIdx + 2}` : plan[exIdx + 1]?.name ?? (free ? (isHost ? 'your pick' : "the host's pick") : null)
  const rows = standings({ sets: allSets, participants, plan, free, now })
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
      {feed}

      <EndEarly onEnd={onEnd} confirm={confirmEnd} setConfirm={setConfirmEnd} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done: final standings, updating while others finish
// ─────────────────────────────────────────────────────────────────────────────

function DoneScreen({ allSets, plan, free, autoEnded = false, exercises: planned, participants, myId, startTime, onHome, onPerson, safetySheet, sessionId }) {
  const { fmtVolume } = useUnit()
  const now = useNow()
  const duration = startTime ? Math.round((Math.min(now, startTime + SESSION_LIMIT_MS) - startTime) / 60000) : 0
  const rows = standings({ sets: allSets, participants, plan, free, now })
  // A free room has no end to finish, so nobody counts as still training
  const going = free ? 0 : rows.filter(r => !r.finished).length
  // In a free room everyone did their own exercises: break down every one logged
  const exercises = free
    ? [...new Set(allSets.map(s => s.exercise))].map(n => EXERCISES.find(e => e.name === n) ?? { name: n, muscle: '', icon: 'mdi:dumbbell' })
    : planned
  const leader = rows[0]
  const myName = rows.find(r => r.id === myId)?.name

  return (
    <div className="space-y-5 py-4 slide-up">
      <div className="text-center">
        <Icon icon="mdi:trophy-outline" width={48} className="mx-auto mb-3 text-neon-ink" aria-hidden="true" />
        <div className="font-bold text-3xl text-neon-ink">Group workout complete</div>
        {duration > 0 && <div className="text-muted mt-1 text-sm">Duration: {duration} min</div>}
        {autoEnded && <p className="text-sm text-muted mt-1">Ended automatically after 4 hours. Your sets are saved.</p>}
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

      <ShareRoom allSets={allSets} participants={participants} startTime={startTime} duration={duration} />
      <BeatIt sets={allSets} myId={myId} />
      {sessionId && participants.length > 1 && <NextWeek sessionId={sessionId} startTime={startTime} others={participants.filter(p => p.user_id !== myId)} />}
      <RoomMates participants={participants} myId={myId} onPerson={onPerson} />
      {safetySheet}

      <Button full onClick={onHome}>Back to home</Button>
    </div>
  )
}

// The room as a story image: everyone's names, the totals, each person's best set
function ShareRoom({ allSets, participants, startTime, duration }) {
  const { fmt, fmtVolume } = useUnit()
  const [content, setContent] = useState(null)
  const real = allSets.filter(s => s.user_id)
  if (!real.length) return null
  function open() {
    const names = participants.map(p => p.display_name)
    const volume = real.reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0)
    const best = bestSetEach(real).map(b => `${b.name} · ${b.set.exercise} ${Number(b.set.weight) ? `${fmt(b.set.weight)} × ${b.set.reps}` : `${b.set.reps} reps`}`)
    setContent(cardContent({ kind: 'room', names, date: localDateKey(new Date(startTime || Date.now())), minutes: duration, volume: volume ? fmtVolume(volume) : '', sets: real.length, best }))
  }
  return (
    <>
      <Button full variant="secondary" icon="mdi:share-variant-outline" onClick={open}>Share to your story</Button>
      {content && <ShareSheet content={content} onClose={() => setContent(null)} />}
    </>
  )
}

// For each exercise you did with someone: your best set next to the best partner's
function BeatIt({ sets, myId }) {
  const { fmt } = useUnit()
  const rows = beatItRows(sets.filter(s => !s.pending || s.user_id === myId), myId)
  if (!rows.length) return null
  const show = s => (Number(s.weight) ? `${fmt(s.weight)} × ${s.reps}` : `${s.reps} reps`)
  return (
    <Card className="rise">
      <SectionTitle>Beat it next time</SectionTitle>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.exercise} className="rise bg-raised rounded-xl px-3 py-2.5" style={{ '--i': i }}>
            <div className="text-sm font-semibold text-ink break-words">{r.exercise}</div>
            <div className="grid gap-2 mt-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7rem), 1fr))' }}>
              <div className={`rounded-lg px-2.5 py-1.5 ${r.ahead === 'me' ? 'bg-neon-tint' : 'bg-inset'}`}>
                <div className="text-xs text-muted">You</div>
                <div className="text-sm font-bold text-ink tabular-nums">{show(r.mine)}</div>
              </div>
              <div className={`rounded-lg px-2.5 py-1.5 ${r.ahead === 'them' ? 'bg-neon-tint' : 'bg-inset'}`}>
                <div className="text-xs text-muted break-words">{r.theirs.name}</div>
                <div className="text-sm font-bold text-ink tabular-nums">{show(r.theirs.set)}</div>
              </div>
            </div>
            <div className={`text-xs mt-1.5 ${r.ahead === 'them' ? 'text-neon-ink font-semibold' : 'text-muted'}`}>
              {r.ahead === 'them' ? `${r.theirs.name} is ahead. Your target for next time.` : r.ahead === 'me' ? "You're ahead. Keep it that way." : 'Level. Next time decides it.'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// Same time next week: one tap books it for everyone in the room, with a reminder an hour before
function NextWeek({ sessionId, startTime, others }) {
  const [state, setState] = useState('idle') // idle | busy | booked | hidden | error
  const [error, setError] = useState('')
  const when = new Date((startTime || Date.now()) + 7 * 864e5)
  if (state === 'hidden' || when.getTime() < Date.now() + 3600e3) return null
  const label = when.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  const names = others.map(p => `@${p.display_name}`)
  const withWho = names.length <= 2 ? names.join(' and ') : `${names[0]} and ${names.length - 1} more`

  async function book() {
    setState('busy'); setError('')
    try { await scheduleNextSession(sessionId, when); setState('booked') }
    catch (e) { if (e.missing) setState('hidden'); else { setError(e.message); setState('error') } }
  }

  return (
    <Card tone="neon" className="rise">
      <div className="flex items-start gap-3">
        <Icon icon={state === 'booked' ? 'mdi:calendar-check' : 'mdi:calendar-refresh-outline'} width={26} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-bold text-lg text-ink leading-tight">{state === 'booked' ? 'Booked' : 'Same time next week?'}</div>
          <p className="text-sm text-ink-2 mt-0.5 break-words">
            {state === 'booked'
              ? `${label} with ${withWho}. Everyone gets a reminder an hour before, and it shows on Rooms.`
              : `${label} with ${withWho}, the same workout. Everyone gets a reminder an hour before.`}
          </p>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger mt-2">{error}</p>}
      {state !== 'booked' && (
        <Button full icon="mdi:calendar-plus" className="mt-3" disabled={state === 'busy'} onClick={book}>
          {state === 'busy' ? 'Booking…' : 'Book it'}
        </Button>
      )}
    </Card>
  )
}

// Who you trained with: add them as friends from here (they accept, as with any request)
function RoomMates({ participants, myId, onPerson }) {
  const others = participants.filter(p => p.user_id !== myId && NICKNAME_RE.test(p.display_name || ''))
  const [state, setState] = useState({}) // nickname → 'friends' | 'sent' | 'busy' | 'error'
  useEffect(() => {
    if (!others.length) return
    fetchFriends().then(list => setState(prev => {
      const next = { ...prev }
      for (const f of list) next[f.nickname] = f.status === 'accepted' ? 'friends' : 'sent'
      return next
    })).catch(() => {})
  }, [others.length])
  if (!others.length) return null

  async function add(nick) {
    setState(s => ({ ...s, [nick]: 'busy' }))
    try {
      const res = await sendFriendRequest(nick)
      setState(s => ({ ...s, [nick]: res === 'friends' ? 'friends' : 'sent' }))
    } catch { setState(s => ({ ...s, [nick]: 'error' })) }
  }

  return (
    <Card className="rise">
      <SectionTitle>Trained with</SectionTitle>
      <div className="space-y-2">
        {others.map((p, i) => {
          const st = state[p.display_name]
          return (
            <div key={p.user_id} className="rise flex flex-wrap items-center gap-x-3 gap-y-1 bg-raised rounded-xl px-3 py-2.5" style={{ '--i': i }}>
              <Avatar name={p.display_name} size="md" />
              <div className="grow basis-0 min-w-[5.5rem]">
                <div className="text-sm font-semibold text-ink break-words">@{p.display_name}</div>
                {st === 'error' && <div className="text-xs text-danger">Couldn't send. Try again.</div>}
              </div>
              {onPerson && (
                <IconButton icon="mdi:dots-vertical" label={`More for ${p.display_name}`} className="w-9 h-9 order-last"
                  onClick={() => onPerson({ id: p.user_id, name: p.display_name })} />
              )}
              {st === 'friends' ? (
                <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-neon-ink"><Icon icon="mdi:account-check-outline" width={18} aria-hidden="true" />Friends</span>
              ) : st === 'sent' ? (
                <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted"><Icon icon="mdi:account-clock-outline" width={18} aria-hidden="true" />Requested</span>
              ) : (
                <Button size="sm" variant="secondary" icon="mdi:account-plus-outline" className="ml-auto" disabled={st === 'busy'}
                  aria-label={`Add @${p.display_name} as a friend`} onClick={() => add(p.display_name)}>Add friend</Button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
