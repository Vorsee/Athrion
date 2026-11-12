// The end of a Train together room (R7): each person's best set, and for the exercises you
// both did, your best next to a partner's so there's something to beat next time.
// sets: group_sets rows { user_id, display_name, exercise, weight, reps, warmup? }

// Heavier wins; at the same weight, more reps
const better = (a, b) => !b || Number(a.weight) > Number(b.weight) || (Number(a.weight) === Number(b.weight) && Number(a.reps) > Number(b.reps))

// { userId: { name, byExercise: { exercise: best set } } }
function bests(sets) {
  const out = {}
  for (const s of sets) {
    if (!s?.user_id || !s.exercise || s.warmup) continue
    const p = out[s.user_id] ??= { name: s.display_name, byExercise: {} }
    if (better(s, p.byExercise[s.exercise])) p.byExercise[s.exercise] = s
  }
  return out
}

// Each person's single best set (the heaviest), in the order given
export function bestSetEach(sets) {
  return Object.entries(bests(sets)).map(([id, p]) => {
    const top = Object.values(p.byExercise).reduce((a, s) => (better(s, a) ? s : a), null)
    return { id, name: p.name, set: top }
  }).filter(r => r.set)
}

// For each exercise I did that someone else did too: my best and the best partner's
export function beatItRows(sets, myId) {
  const all = bests(sets)
  const mine = all[myId]?.byExercise ?? {}
  const rows = []
  for (const [exercise, me] of Object.entries(mine)) {
    let top = null
    for (const [id, p] of Object.entries(all)) {
      if (id === myId || !p.byExercise[exercise]) continue
      const s = p.byExercise[exercise]
      if (better(s, top?.set)) top = { name: p.name, set: s }
    }
    if (top) rows.push({ exercise, mine: me, theirs: top, ahead: better(me, top.set) ? 'me' : better(top.set, me) ? 'them' : 'tie' })
  }
  return rows
}
