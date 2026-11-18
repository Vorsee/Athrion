// Room sets logged without signal. Each set gets its own id on the phone (client_id), shows in
// the room straight away as pending, waits here and is sent in order once back online. The
// server stores a set sent twice only once (035), so a lost answer never makes a duplicate.
const KEY = 'athrion_room_sets'

export function newClientId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function loadQueued(sessionId) {
  let list = []
  try { list = JSON.parse(localStorage.getItem(KEY)) || [] } catch { /* unreadable: start empty */ }
  return sessionId ? list.filter(s => s.sessionId === sessionId) : list
}

function store(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch { /* storage full or blocked: the set still shows in the room until the page closes */ }
}

export function queueSet(set) {
  store([...loadQueued().filter(s => s.clientId !== set.clientId), set])
}

// A queued set edited before it was sent (its weight or reps)
export function editQueued(clientId, patch) {
  store(loadQueued().map(s => (s.clientId === clientId ? { ...s, ...patch } : s)))
}

export function dropQueued(clientId) {
  store(loadQueued().filter(s => s.clientId !== clientId))
}

// No answer at all (offline, timed out), as opposed to the server saying no
export function isNetworkError(err) {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return !err.code && /fetch|network|load failed|timed? ?out/i.test(String(err.message || err))
}

// A queued set as the room shows it before the server has it
export function pendingRow(set, userId) {
  return {
    id: `local-${set.clientId}`,
    client_id: set.clientId,
    session_id: set.sessionId,
    user_id: userId,
    display_name: set.displayName,
    exercise: set.exercise,
    set_num: set.setNum,
    weight: set.weight,
    reps: set.reps,
    logged_at: set.loggedAt,
    pending: true,
  }
}

// Sends one room's queued sets oldest first. Stops at the first set that can't reach the server,
// so they arrive in order; a set the server refuses (you left the room) is dropped.
// Returns the rows the server sent back.
export async function flushQueued(sessionId, send) {
  const sent = []
  for (const set of loadQueued(sessionId)) {
    try {
      const row = await send(set)
      dropQueued(set.clientId)
      if (row) sent.push(row)
    } catch (err) {
      if (isNetworkError(err)) break
      dropQueued(set.clientId)
    }
  }
  return sent
}
