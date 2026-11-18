// A Train together room's workout, set by set: [{ name, sets: [{ reps, rest }] }].
// reps is a target (null = any); rest is the seconds after that set, so the last set's
// rest is the break before the next exercise. Rooms made before 013 only have
// exercises / total_sets / rest_secs, which planFrom turns into the same shape.

export const REST_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
export const MAX_SETS = 10

export const makeSets = (n = 3, rest = 60, reps = null) => Array.from({ length: n }, () => ({ reps, rest }))

// A free workout room: no exercises planned ahead. The host sets the sets per exercise and the
// rest between sets (the choices Train's free workout offers), then picks each exercise as
// they go and everyone in the room does the same one. Saved as plan = [{ free: true, sets,
// picks: [names in order] }], so it needs no new column; planFrom leaves it out, freeRoom
// reads it, freePicks turns the picks into everyone's exercises.
export const FREE_SET_OPTIONS = [2, 3, 4, 5]
export const FREE_REST_OPTIONS = [30, 60, 90, 120]
export const freePlan = ({ sets = 3, rest = 60, picks = [] } = {}) => [{ free: true, sets: makeSets(sets, rest), ...(picks.length && { picks }) }]
export function freePicks(plan) {
  const fr = freeRoom(plan)
  const picks = fr && Array.isArray(plan[0].picks) ? plan[0].picks.filter(n => typeof n === 'string' && n) : []
  return picks.map(name => ({ name, sets: makeSets(fr.sets, fr.rest) }))
}
export function freeRoom(plan) {
  const head = Array.isArray(plan) ? plan[0] : null
  return head?.free ? { sets: head.sets?.length || 3, rest: head.sets?.[0]?.rest ?? 60 } : null
}

export function planFrom(sess) {
  if (Array.isArray(sess?.plan) && sess.plan.length) {
    return sess.plan
      .filter(e => e?.name)
      .map(e => ({ name: e.name, sets: (e.sets?.length ? e.sets : makeSets()).map(s => ({ reps: s.reps ?? null, rest: s.rest ?? 60 })) }))
  }
  return (sess?.exercises || []).map(name => ({ name, sets: makeSets(sess.total_sets || 3, sess.rest_secs ?? 60) }))
}

export const totalSets = plan => plan.reduce((n, e) => n + e.sets.length, 0)
export const setsDone = (plan, exIdx, setIdx) => plan.slice(0, exIdx).reduce((n, e) => n + e.sets.length, 0) + setIdx

// Seconds to rest after this set; nothing after the very last set
export function restAfter(plan, exIdx, setIdx) {
  if (exIdx >= plan.length - 1 && setIdx >= (plan[exIdx]?.sets.length ?? 0) - 1) return 0
  return plan[exIdx]?.sets[setIdx]?.rest ?? 60
}

const fmtRest = s => (s < 60 ? `${s}s` : s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60} min`)
export const restLabel = s => (s ? fmtRest(s) : 'No rest')

// "3 sets · 10, 10, 8 reps" for the lobby rows
export function setsSummary(sets) {
  const reps = sets.map(s => s.reps)
  const repsText = reps.every(r => r == null) ? ''
    : reps.every(r => r === reps[0]) ? ` × ${reps[0]}`
    : ` · ${reps.map(r => r ?? 'any').join(', ')} reps`
  return `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}${repsText}`
}

// Train's Train together (R3): today's workout or the last one, as a room plan.
// A plan exercise { name, sets, reps: '6-8', restSeconds } → the reps target is the range's
// first number (null when it isn't a count, like "30 s" or "20-30 min")
export function roomPlanFromExercises(exercises = []) {
  return exercises.filter(e => e?.name).map(e => {
    const n = Math.min(MAX_SETS, Math.max(1, Number(e.sets) || 3))
    const reps = /^\s*\d+(\s*-\s*\d+)?\s*(reps?)?\s*$/i.test(String(e.reps ?? '')) ? parseInt(e.reps, 10) : null
    const rest = REST_OPTIONS.includes(e.restSeconds) ? e.restSeconds : 60
    return { name: e.name, sets: makeSets(n, rest, reps) }
  })
}

// A logged workout's sets [{ ex, set, reps, warmup }] → the same exercises, sets and reps
export function roomPlanFromLog(entry) {
  const order = []
  const byName = new Map()
  for (const s of entry?.sets ?? []) {
    if (!s?.ex || s.warmup) continue
    if (!byName.has(s.ex)) { byName.set(s.ex, []); order.push(s.ex) }
    byName.get(s.ex).push(s)
  }
  return order.map(name => ({
    name,
    sets: byName.get(name).slice(0, MAX_SETS).map(s => ({ reps: Number(s.reps) > 0 ? Number(s.reps) : null, rest: 60 })),
  }))
}
