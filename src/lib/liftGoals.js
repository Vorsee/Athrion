// Lift targets for building muscle or strength: "my best set of 5 on the bench, from 80 to 90 kg".
// Progress is read from logged workouts. Weights in lb (as stored); 5 reps keeps it about real
// working sets, not one-off maxes.
import { localDateKey } from './data.js'

export const GOAL_REPS = 5
export const LIFT_GOALS = ['build_muscle', 'improve_strength', 'gain_weight']
export const MAX_LIFTS = 3

// The lifts people set targets on, and the names a plan or log might use for them
export const KEY_LIFTS = [
  { name: 'Bench Press',     match: /^(barbell |flat |flat barbell )?bench press$/i },
  { name: 'Squat',           match: /^(barbell |back |barbell back )?squat$/i },
  { name: 'Deadlift',        match: /^(barbell |conventional )?deadlift$/i },
  { name: 'Overhead Press',  match: /^(barbell |standing )?(overhead|military) press$/i },
  { name: 'Barbell Row',     match: /^(barbell |bent[- ]over (barbell )?)row$/i },
  { name: 'Leg Press',       match: /^(machine )?leg press$/i },
  { name: 'Hip Thrust',      match: /^(barbell )?hip thrust$/i },
  { name: 'Dumbbell Bench Press', match: /^(flat )?dumbbell bench press$/i },
  { name: 'Romanian Deadlift', match: /^(barbell )?romanian deadlift$/i },
  { name: 'Lat Pulldown',    match: /^(wide[- ]grip )?lat pulldown$/i },
]
export const hasLiftGoal = goal => LIFT_GOALS.includes(goal)
const liftOf = name => KEY_LIFTS.find(l => l.name === name)

/**
 * The heaviest weight lifted for at least GOAL_REPS reps on this lift, optionally only from a date on.
 * history: workout_logs rows ({ date, created_at, sets: [{ ex, weight, reps }] })
 */
export function bestSet(history, liftName, { since = null, minReps = GOAL_REPS } = {}) {
  const lift = liftOf(liftName)
  const re = lift?.match
  let best = 0, date = null
  for (const h of history || []) {
    const d = h.date ?? (h.created_at && localDateKey(h.created_at))
    if (since && d < since) continue
    for (const s of h.sets || []) {
      if (!s?.ex || !(re ? re.test(s.ex.trim()) : s.ex === liftName)) continue
      const w = Number(s.weight) || 0
      if (Number(s.reps) >= minReps && w > best) { best = w; date = d }
    }
  }
  return best ? { lb: best, date } : null
}

// A sensible first target: about 10% more, rounded to a plate step (2.5 kg or 5 lb)
export function suggestTarget(currentLb, unit = 'lb') {
  if (!(currentLb > 0)) return null
  const step = unit === 'kg' ? 2.5 * 2.20462 : 5
  const t = Math.round((currentLb * 1.1) / step) * step
  return t > currentLb ? t : t + step
}

/**
 * Where each lift target stands and the average across them.
 * lifts: [{ name, startLb, targetLb }] from fitness_profiles.goal_lifts
 * @returns { lifts: [{ name, startLb, targetLb, currentLb, pct, lastDate }], pct } or null
 */
export function liftProgress(lifts, history, since = null) {
  if (!lifts?.length) return null
  const rows = lifts.map(l => {
    const now = bestSet(history, l.name, { since })
    const currentLb = Math.max(Number(l.startLb) || 0, now?.lb ?? 0)
    const span = Number(l.targetLb) - Number(l.startLb)
    const pct = span > 0 ? Math.max(0, Math.min(1, (currentLb - l.startLb) / span)) : currentLb >= l.targetLb ? 1 : 0
    return { name: l.name, startLb: Number(l.startLb), targetLb: Number(l.targetLb), currentLb, pct, lastDate: now?.date ?? null }
  })
  return { lifts: rows, pct: rows.reduce((a, r) => a + r.pct, 0) / rows.length }
}
