// Per-exercise progress built from workout_logs.sets ({ ex, set, weight, reps }).

// Epley estimated one-rep max
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

function round(n, step = 0.5) {
  return Math.round(n / step) * step
}

// { [exerciseName]: [{ date, createdAt, sets: [{ weight, reps }] }] } oldest first
export function buildExerciseHistory(history) {
  const byEx = {}
  const sessions = [...(history || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  for (const session of sessions) {
    const grouped = {}
    for (const s of session.sets || []) {
      if (!s?.ex) continue
      ;(grouped[s.ex] ??= []).push({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })
    }
    for (const [name, sets] of Object.entries(grouped)) {
      ;(byEx[name] ??= []).push({ date: session.date, createdAt: session.created_at, sets })
    }
  }
  return byEx
}

// Best numbers ever recorded for one exercise
export function getRecords(sessions) {
  const rec = { maxWeight: 0, maxWeightReps: 0, bestE1rm: 0, maxReps: 0, bestVolume: 0 }
  for (const s of sessions || []) {
    let volume = 0
    for (const set of s.sets) {
      volume += set.weight * set.reps
      if (set.weight > rec.maxWeight || (set.weight === rec.maxWeight && set.reps > rec.maxWeightReps)) {
        rec.maxWeight = set.weight
        rec.maxWeightReps = set.reps
      }
      rec.bestE1rm = Math.max(rec.bestE1rm, e1rm(set.weight, set.reps))
      rec.maxReps = Math.max(rec.maxReps, set.reps)
    }
    rec.bestVolume = Math.max(rec.bestVolume, volume)
  }
  return rec
}

// Double progression: build reps across the range, then add weight and drop back
// to the bottom of the range. Bodyweight moves progress by reps only.
export function suggestNext(sessions, { minReps = 8, maxReps = 12 } = {}) {
  const last = sessions?.[sessions.length - 1]
  if (!last?.sets.length) return null

  const top = last.sets.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a))
  const allHitTop = last.sets.every(s => s.reps >= maxReps)
  const anyBelowMin = last.sets.some(s => s.reps < minReps)

  if (top.weight === 0) {
    return { weight: 0, reps: top.reps + 1, reason: 'Bodyweight — aim for one more rep than last time' }
  }
  if (allHitTop) {
    const jump = top.weight < 40 ? 2.5 : 5
    return { weight: round(top.weight + jump), reps: minReps, reason: `You hit ${maxReps}+ reps on every set — add ${jump} lb` }
  }
  if (anyBelowMin) {
    return { weight: top.weight, reps: minReps, reason: `Stay at ${top.weight} lb until every set reaches ${minReps} reps` }
  }
  return { weight: top.weight, reps: Math.min(top.reps + 1, maxReps), reason: 'Same weight — add a rep' }
}

// Parse a plan rep string like "8-12" or "10" into a range
export function parseRepRange(reps) {
  const nums = String(reps ?? '').match(/\d+/g)?.map(Number) ?? []
  // Timed targets ("30s", "45 sec", "2 min") aren't rep ranges; words like "reps" or "each side" are fine
  const timed = /\d\s*(s|secs?|seconds?|mins?|minutes?|m)\b/i.test(String(reps))
  if (!nums.length || timed) return { minReps: 8, maxReps: 12 }
  return { minReps: nums[0], maxReps: nums[1] ?? nums[0] }
}

// PRs set in a just-finished workout compared with all earlier history
export function findNewPRs(loggedSets, history) {
  const before = buildExerciseHistory(history)
  const grouped = {}
  for (const s of loggedSets || []) (grouped[s.ex] ??= []).push({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })

  const prs = []
  for (const [name, sets] of Object.entries(grouped)) {
    const past = before[name]
    if (!past?.length) continue // first time doing it isn't a PR
    const rec = getRecords(past)
    const now = getRecords([{ sets }])
    if (now.maxWeight > rec.maxWeight) prs.push({ name, type: 'Heaviest weight', value: `${now.maxWeight} lb × ${now.maxWeightReps}` })
    else if (now.bestE1rm > rec.bestE1rm + 0.5) prs.push({ name, type: 'Estimated 1RM', value: `${Math.round(now.bestE1rm)} lb` })
    else if (now.maxWeight === 0 && now.maxReps > rec.maxReps) prs.push({ name, type: 'Most reps', value: `${now.maxReps} reps` })
  }
  return prs
}

// Consecutive ISO weeks (ending this week or last) with at least `perWeek` workouts.
// Weeks are stepped by calendar date, not 7×24h, so daylight-saving changes don't break streaks.
export function weeklyStreak(history, perWeek = 1) {
  const mondayOf = d => {
    const m = new Date(d)
    m.setHours(0, 0, 0, 0)
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
    return m
  }
  const key = m => `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`
  const counts = {}
  for (const h of history || []) {
    const k = key(mondayOf(h.created_at))
    counts[k] = (counts[k] ?? 0) + 1
  }
  const cursor = mondayOf(Date.now())
  const stepBack = () => cursor.setDate(cursor.getDate() - 7)
  // The current week doesn't break the streak until it's over
  if ((counts[key(cursor)] ?? 0) < perWeek) stepBack()
  let streak = 0
  while ((counts[key(cursor)] ?? 0) >= perWeek) { streak++; stepBack() }
  return streak
}
