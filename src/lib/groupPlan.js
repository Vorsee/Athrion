// A Train together room's workout, set by set: [{ name, sets: [{ reps, rest }] }].
// reps is a target (null = any); rest is the seconds after that set, so the last set's
// rest is the break before the next exercise. Rooms made before 013 only have
// exercises / total_sets / rest_secs, which planFrom turns into the same shape.

export const REST_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
export const MAX_SETS = 10

export const makeSets = (n = 3, rest = 60, reps = null) => Array.from({ length: n }, () => ({ reps, rest }))

// A free workout room: no exercises planned, everyone picks their own as they go, and the
// host sets the sets per exercise and the rest between sets (the choices Train's free
// workout offers). Saved as plan = [{ free: true, sets }], so it needs no new column;
// planFrom leaves it out, freeRoom reads it.
export const FREE_SET_OPTIONS = [2, 3, 4, 5]
export const FREE_REST_OPTIONS = [30, 60, 90, 120]
export const freePlan = ({ sets = 3, rest = 60 } = {}) => [{ free: true, sets: makeSets(sets, rest) }]
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
