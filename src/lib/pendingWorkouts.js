// Finished workouts that failed to save (e.g. no signal at the gym). They wait
// here and are retried, so a workout is never lost without the person knowing.
const KEY = 'athrion_pending_workouts'

export function loadPending() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

function store(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch { /* storage full or blocked: the in-memory copy still shows */ }
}

export function queueWorkout(entry) {
  store([...loadPending(), entry])
}

// Saves each queued workout in order; anything that still fails stays queued
export async function flushPending(save) {
  const saved = []
  const left = []
  for (const entry of loadPending()) {
    try { saved.push(await save(entry)) } catch { left.push(entry) }
  }
  store(left)
  return { saved, left: left.length }
}
