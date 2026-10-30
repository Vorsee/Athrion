// The coaching around a Pro plan: next session's target for each exercise, a lighter week every
// 5th week, missed workouts moved to a free day this week, and the weekly review. All of it is
// worked out from the plan and the workout log, so it's there without another AI call.
import { buildExerciseHistory, suggestNext, parseRepRange } from './progress.js'
import { fromLb, toLb } from './units.js'
import { localDateKey } from './data.js'
import { DAYS } from './planProgress.js'
import { KEY_LIFTS } from './liftGoals.js'

// Every 5th week of a goal is lighter (inside the usual 4-6 week window): one set less per
// exercise and about 80% of the working weight, so joints and energy catch up
export const DELOAD_EVERY = 5
export const DELOAD_LOAD = 0.8
export const isDeloadWeek = week => week > 0 && week % DELOAD_EVERY === 0

// Same exercise: the same name, or two names for one key lift ("Barbell Bench Press" and "Bench Press")
const liftOf = name => KEY_LIFTS.find(l => l.match.test(name.trim()))?.name
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase() || (!!liftOf(a) && liftOf(a) === liftOf(b))
const timedReps = reps => /\d\s*(s|secs?|seconds?|mins?|minutes?)\b/i.test(String(reps ?? ''))

// A lighter weight on a plate step: 5 lb, or 2.5 kg
export function lighter(lb, unit = 'lb') {
  if (!(lb > 0)) return 0
  if (unit === 'kg') return toLb(Math.max(2.5, Math.round((fromLb(lb, 'kg') * DELOAD_LOAD) / 2.5) * 2.5), 'kg')
  return Math.max(5, Math.round((lb * DELOAD_LOAD) / 5) * 5)
}

/**
 * Next session's target for one plan exercise, from the last time it was logged.
 * @returns null (timed, or never done) or { weight (lb), reps, text, reason, deload }
 */
export function nextTarget(ex, byEx, { unit = 'lb', deload = false } = {}) {
  if (!ex?.name || timedReps(ex.reps)) return null
  const names = Object.keys(byEx)
  const key = names.find(n => n.trim().toLowerCase() === ex.name.trim().toLowerCase()) ?? names.find(n => sameName(n, ex.name))
  const s = key && suggestNext(byEx[key], { ...parseRepRange(ex.reps), unit })
  if (!s || s.secs) return null
  const weight = deload ? lighter(s.weight, unit) : s.weight
  const w = weight > 0 ? `${fromLb(weight, unit)} ${unit}` : 'Bodyweight'
  // suggestNext says "... — add 5 lb", "Same weight — add a rep", "Bodyweight — aim for one more rep..." or "Stay at ..."
  const tail = s.reason.split('— ')[1]
  const reason = deload ? 'lighter week' : tail ? tail.replace(/^aim for /, '').replace(/ than last time$/, '') : 'hold the weight'
  return { weight, reps: s.reps, deload, reason, text: `${w} × ${s.reps}` }
}

// { [exercise name]: target } for a day, from workout_logs rows
export function dayTargets(day, history, opts) {
  const byEx = buildExerciseHistory(history)
  return Object.fromEntries((day?.workout?.exercises ?? []).map(e => [e.name, nextTarget(e, byEx, opts)]).filter(([, t]) => t))
}

// A day as Workout starts it: on a lighter week each exercise has one set less, and carries the
// flag so Workout fills in the lighter weight
export function startableDay(day, deload) {
  if (!deload) return day
  const exercises = (day.workout?.exercises ?? []).map(e => ({ ...e, sets: Math.max(1, (e.sets ?? 3) - 1), deload: true }))
  return { ...day, workout: { ...day.workout, exercises } }
}

/**
 * Missed workouts this week move to the next free days from today on, in order, so the
 * week still gets its sessions. thisWeek: planProgress().thisWeek. Nothing moves onto a day
 * with a workout already done.
 * @returns { schedule (the week with the moves), moves: [{ title, from, to }] }
 */
export function reshuffleWeek(schedule, thisWeek, today = new Date()) {
  const todayKey = localDateKey(today)
  const byDay = Object.fromEntries(schedule.map(d => [d.day, d]))
  const missed = thisWeek.filter(d => d.planned && !d.done && d.date < todayKey).map(d => byDay[d.day]).filter(Boolean)
  if (!missed.length) return { schedule, moves: [] }
  const free = thisWeek.filter(d => d.date >= todayKey && !d.done && byDay[d.day]?.type !== 'workout').map(d => d.day)
  const out = { ...byDay }
  const moves = []
  missed.forEach((m, i) => {
    const to = free[i]
    out[m.day] = { ...m, type: 'rest', title: `Moved to ${to ?? 'next week'}`, movedTo: to ?? null, workout: { warmup: [], exercises: [], cooldown: [] } }
    if (to) out[to] = { ...m, day: to, movedFrom: m.day }
    moves.push({ title: m.title, from: m.day, to: to ?? null })
  })
  return { schedule: DAYS.map(d => out[d]).filter(Boolean), moves }
}

// Best set (heaviest weight, then reps) per exercise in a set of logs
function bests(logs) {
  const out = {}
  for (const h of logs) for (const s of h.sets ?? []) {
    if (!s?.ex) continue
    const w = Number(s.weight) || 0, r = Number(s.reps) || 0
    const b = out[s.ex]
    if (!b || w > b.weight || (w === b.weight && r > b.reps)) out[s.ex] = { weight: w, reps: r }
  }
  return out
}

/**
 * The weekly review: what went well, what to change, and whether the goal is on track.
 * progress: planProgress(); goal: goalProgress() or null; liftPct: liftProgress().pct or null
 * @returns { wentWell: [], change: [], status: 'on_track' | 'behind' | 'early', headline }
 */
export function weeklyReview({ progress, history = [], goal = null, liftPct = null, deload = false, unit = 'lb', today = new Date() }) {
  const monday = progress.thisWeek[0]?.date
  const dayOf = h => h.date ?? localDateKey(h.created_at)
  const week = history.filter(h => dayOf(h) >= monday)
  const before = history.filter(h => dayOf(h) < monday)
  const lastMonday = localDateKey(new Date(new Date(`${monday}T12:00:00`).getTime() - 7 * 86400000))
  const lastWeek = before.filter(h => dayOf(h) >= lastMonday)
  const vol = logs => logs.reduce((a, h) => a + (Number(h.volume) || 0), 0)

  const wentWell = [], change = []
  const { weekDone: done, weekPlanned: planned } = progress
  const todayKey = localDateKey(today)
  // Planned days already past, and how many of those weren't trained (today isn't missed yet)
  const plannedSoFar = progress.thisWeek.filter(d => d.planned && d.date < todayKey).length
  const missed = progress.thisWeek.filter(d => d.planned && !d.done && d.date < todayKey).length

  if (planned && done >= planned) wentWell.push(`Every planned workout done: ${done} of ${planned}.`)
  else if (done > 0) wentWell.push(`${done} of ${planned} workouts done this week.`)

  const prev = bests(before), now = bests(week)
  const prs = Object.entries(now).filter(([ex, b]) => prev[ex] && b.weight > 0 && (b.weight > prev[ex].weight || (b.weight === prev[ex].weight && b.reps > prev[ex].reps)))
  if (prs.length) {
    const [ex, b] = prs[0]
    wentWell.push(`New best on ${ex}: ${fromLb(b.weight, unit)} ${unit} × ${b.reps}${prs.length > 1 ? `, and ${prs.length - 1} more` : ''}.`)
  }
  const v = vol(week), lv = vol(lastWeek)
  if (v && lv && v > lv * 1.05 && !deload) wentWell.push(`You lifted ${Math.round((v / lv - 1) * 100)}% more than last week.`)

  if (goal?.onTrack === true) wentWell.push('Your weight is moving at the pace you set.')
  if (goal?.onTrack === false) change.push(goal.leftLb > 0
    ? 'Weight is behind the pace you set: log every meal for a week and keep the calories at your target before changing anything else.'
    : 'Weigh in this week so the goal ring is up to date.')
  if (missed) change.push(`${missed} planned ${missed === 1 ? 'workout was' : 'workouts were'} missed. Shorter sessions you can keep beat long ones you skip: rebuild the plan with fewer days if this keeps happening.`)
  if (!prs.length && week.length >= 2 && !deload) change.push('No new bests this week. Use the targets on each exercise: one more rep, or the next weight when every set reaches the top of the range.')
  if (deload) change.push('This is a lighter week: one set less and about 80% of your working weight. Go back to full weights next week.')
  if (!week.length && !missed) change.push('Your first workout of the week is coming up. Start it from Today.')

  const behind = goal?.onTrack === false || (plannedSoFar >= 2 && missed > plannedSoFar / 2)
  const status = goal?.onTrack == null && liftPct == null && plannedSoFar === 0 ? 'early' : behind ? 'behind' : 'on_track'
  const headline = status === 'early' ? 'Your week is just starting'
    : status === 'behind' ? 'A little behind. Here is how to catch up'
    : liftPct != null ? `On track: ${Math.round(liftPct * 100)}% of the way to your lift targets`
    : 'On track'
  return { wentWell, change, status, headline }
}
