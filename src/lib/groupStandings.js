// Live standings for a Train together room, from every set logged in it.
// People are keyed by user_id (display names can repeat); score is volume, then reps.

// Sets from realtime and polling arrive in any order and twice: keep one per id, oldest first
export function mergeSets(prev, rows) {
  const byId = new Map(prev.map(s => [s.id, s]))
  for (const r of rows) if (r?.id) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => (a.logged_at < b.logged_at ? -1 : a.logged_at > b.logged_at ? 1 : 0))
}

// Where someone is: the set after their latest one
function position(last, exercises, totalSets) {
  if (!last) return { exIdx: 0, setNum: 1 }
  const i = exercises.findIndex(e => e.name === last.exercise)
  return last.set_num < totalSets ? { exIdx: i, setNum: last.set_num + 1 } : { exIdx: i + 1, setNum: 1 }
}

// → [{ id, name, volume, reps, done, total, finished, resting, where, latest }], best first
export function standings({ sets, participants, exercises, totalSets, restSecs = 60, now = Date.now() }) {
  const total = exercises.length * totalSets
  const people = new Map()
  const person = (id, name) => {
    if (!people.has(id)) people.set(id, { id, name, sets: [], volume: 0, reps: 0 })
    return people.get(id)
  }
  for (const p of participants) person(p.user_id, p.display_name)
  for (const s of sets) {
    const p = person(s.user_id, s.display_name)
    p.sets.push(s)
    p.volume += (Number(s.weight) || 0) * (Number(s.reps) || 0)
    p.reps += Number(s.reps) || 0
  }

  return [...people.values()].map(p => {
    const latest = p.sets[p.sets.length - 1] ?? null
    const done = Math.min(p.sets.length, total)
    const pos = position(latest, exercises, totalSets)
    const finished = total > 0 && (done >= total || pos.exIdx >= exercises.length)
    const resting = !finished && !!latest && now - Date.parse(latest.logged_at) < restSecs * 1000
    const next = exercises[pos.exIdx]
    const where = finished ? 'Finished'
      : !latest ? `Starting ${next?.name ?? ''}`.trim()
      : `${next?.name ?? ''} · set ${pos.setNum}/${totalSets}`
    return { id: p.id, name: p.name, volume: p.volume, reps: p.reps, done, total, finished, resting, where, latest }
  }).sort((a, b) => b.volume - a.volume || b.reps - a.reps || b.done - a.done)
}
