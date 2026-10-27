// Live standings for a Train together room, from every set logged in it.
// People are keyed by user_id (display names can repeat); score is volume, then reps.
import { totalSets } from './groupPlan.js'

// Sets from realtime and polling arrive in any order and twice: keep one per id, oldest first
export function mergeSets(prev, rows) {
  const byId = new Map(prev.map(s => [s.id, s]))
  for (const r of rows) if (r?.id) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => (a.logged_at < b.logged_at ? -1 : a.logged_at > b.logged_at ? 1 : 0))
}

// Where someone is: the set after their latest one
function position(last, plan) {
  if (!last) return { exIdx: 0, setNum: 1 }
  const i = plan.findIndex(e => e.name === last.exercise)
  const count = plan[i]?.sets.length ?? 0
  return last.set_num < count ? { exIdx: i, setNum: last.set_num + 1 } : { exIdx: i + 1, setNum: 1 }
}

// plan: see groupPlan.js. Each person rests for the rest of the set they last logged.
// → [{ id, name, volume, reps, done, total, finished, resting, where, latest }], best first
export function standings({ sets, participants, plan, now = Date.now() }) {
  const total = totalSets(plan)
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
    const pos = position(latest, plan)
    const finished = total > 0 && (done >= total || pos.exIdx >= plan.length)
    const lastEx = latest && plan.find(e => e.name === latest.exercise)
    const rest = lastEx?.sets[latest.set_num - 1]?.rest ?? 60
    const resting = !finished && !!latest && now - Date.parse(latest.logged_at) < rest * 1000
    const next = plan[pos.exIdx]
    const where = finished ? 'Finished'
      : !latest ? `Starting ${next?.name ?? ''}`.trim()
      : `${next?.name ?? ''} · set ${pos.setNum}/${next?.sets.length ?? 0}`
    return { id: p.id, name: p.name, volume: p.volume, reps: p.reps, done, total, finished, resting, where, latest }
  }).sort((a, b) => b.volume - a.volume || b.reps - a.reps || b.done - a.done)
}
