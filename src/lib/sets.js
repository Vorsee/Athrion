// How an exercise is logged, and how a logged set reads.
// mode 'time': seconds held or worked (plank, wall sit, jump rope), optional added weight.
// mode 'bodyweight': reps, optional added weight. mode 'weight': weight × reps.
// A set is { ex, set, weight (lb), reps } or, timed, { ex, set, weight, reps: 0, secs }.

// "30-60s", "45 sec", "2 min", "1:00" are time targets; "8-12" or "10 each side" aren't
export const TIMED = /\d\s*(s|secs?|seconds?|mins?|minutes?)\b|^\s*\d+:\d{2}\s*$/i
const BODYWEIGHT = new Set(['Bodyweight', 'Pull-up Bar', 'Parallel Bars'])

export function exerciseMode(ex) {
  if (ex?.mode) return ex.mode
  if (TIMED.test(String(ex?.reps ?? ''))) return 'time'
  return BODYWEIGHT.has(ex?.equipment) ? 'bodyweight' : 'weight'
}

export const isTimedSet = s => Number(s?.secs) > 0

export function fmtSecs(secs) {
  const t = Math.round(Number(secs) || 0)
  return t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// "45s", "1:30", "20 kg · 45s", "60 kg × 8", "12 reps"; fmt turns lb into the person's unit
export function setText(s, fmt) {
  if (isTimedSet(s)) return s.weight > 0 ? `${fmt(s.weight)} · ${fmtSecs(s.secs)}` : fmtSecs(s.secs)
  return s.weight > 0 ? `${fmt(s.weight)} × ${s.reps}` : `${s.reps} reps`
}

// Compact, for lists of sets: "45s", "60×8", "12"
export function setShort(s, fromLb) {
  if (isTimedSet(s)) return fmtSecs(s.secs)
  return s.weight > 0 ? `${fromLb(s.weight)}×${s.reps}` : `${s.reps}`
}

// "30-60s" → { min: 30, max: 60 }; "2 min" → 120; null when it isn't a time
export function parseTimeTarget(reps) {
  const t = String(reps ?? '')
  if (!TIMED.test(t)) return null
  const clock = t.match(/^\s*(\d+):(\d{2})\s*$/)
  if (clock) { const v = +clock[1] * 60 + +clock[2]; return { min: v, max: v } }
  const mult = /min/i.test(t) ? 60 : 1
  const nums = t.match(/\d+/g).map(n => Number(n) * mult)
  return { min: nums[0], max: nums[1] ?? nums[0] }
}
