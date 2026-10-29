// Monthly points, levels and trophies. The server counts the points (month_points in
// supabase/009_social.sql); these rules must match it.

export const POINT_RULES = [
  ['mdi:dumbbell', '10', 'per workout day (3+ sets, one a day)'],
  ['mdi:calendar-check-outline', '20', 'per week with 3+ workout days'],
  ['mdi:arrow-up-bold-outline', '5', 'per personal record, up to 10 a month'],
  ['mdi:account-group-outline', '15', 'per day you train in a room with someone'],
]

// Workout days in a month that earn that month's target badge
export const MONTHLY_TARGET = 12
// Places on the Everyone board that win a medal and a free month of Pro
export const PRIZE_PLACES = 3

// Lifetime points (all months added up) set the level; each level has 3 stars
export const LEVELS = [
  { name: 'Rookie', min: 0 },
  { name: 'Regular', min: 300 },
  { name: 'Athlete', min: 1000 },
  { name: 'Elite', min: 2500 },
  { name: 'Legend', min: 5000 },
]

export function levelFor(lifetime = 0) {
  const i = LEVELS.findLastIndex(l => lifetime >= l.min)
  const level = LEVELS[Math.max(0, i)]
  const next = LEVELS[i + 1]
  if (!next) return { ...level, stars: 3, next: null, toNext: 0 }
  const progress = (lifetime - level.min) / (next.min - level.min)
  return { ...level, stars: Math.min(3, 1 + Math.floor(progress * 3)), next: next.name, toNext: next.min - lifetime }
}

// '2026-10-01' or a Date → 'October 2026'
export function monthName(month) {
  const d = typeof month === 'string' ? new Date(`${month.slice(0, 7)}-01T12:00:00`) : month
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function daysLeftInMonth(now = new Date()) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return last - now.getDate() + 1 // today still counts
}

// Saved months → trophies to show: medals for places 1-3, a badge for hitting the target
const MEDALS = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' }
export function trophiesFrom(scores = []) {
  const out = []
  for (const s of scores) {
    if (s.rank >= 1 && s.rank <= PRIZE_PLACES) out.push({ key: `${s.month}-medal`, kind: 'medal', place: s.rank, title: `${MEDALS[s.rank]} medal`, month: s.month })
    if (s.workout_days >= MONTHLY_TARGET) out.push({ key: `${s.month}-target`, kind: 'target', title: `${MONTHLY_TARGET}-day month`, month: s.month })
  }
  return out
}

// Nicknames: 3-20 lowercase letters, numbers, ".", "_" or "-", with at least one letter or number
// (the same check as 016_nickname_signs.sql; only signs that are safe in an invite link)
export const NICKNAME_RE = /^(?=.*[a-z0-9])[a-z0-9._-]{3,20}$/
export const NICKNAME_HINT = '3 to 20 letters, numbers, . _ or -'
export const cleanNickname = s => (s || '').trim().replace(/^@+/, '').toLowerCase()
