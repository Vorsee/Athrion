// Reminder rules with no Deno or database dependencies, so they can be unit tested.

const DAY = 86400000
const MONTHLY_TARGET = 12 // matches src/lib/points.js

export function localParts(timezone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', hourCycle: 'h23', weekday: 'long',
    }).formatToParts(now).map(p => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday }
}

// Consecutive weeks (Monday-based, UTC) with a workout, not counting the current week
export function streakBeforeThisWeek(dates: string[], now = new Date()) {
  const weekKey = (d: Date) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
    return m.getTime()
  }
  const weeks = new Set(dates.map(d => weekKey(new Date(d))))
  let cursor = weekKey(now) - 7 * DAY
  let streak = 0
  while (weeks.has(cursor)) { streak++; cursor -= 7 * DAY }
  return { streak, trainedThisWeek: weeks.has(weekKey(now)) }
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY
const monthOf = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function inZone(tz: string) {
  return (d: string) => { try { return localParts(tz, new Date(d)).date } catch { return localParts('UTC', new Date(d)).date } }
}

// extra: { last: the latest workout log { name, created_at }, month: { workout_days } from points_summary }
// The reminder to send today, or null when there's no reason to send one
export function chooseMessage(planData: any, dates: string[], settings: any, local: ReturnType<typeof localParts>, now = new Date(), extra: any = {}) {
  // Trained on today's date in the user's own timezone (a late workout last night doesn't count)
  const localDate = inZone(settings.timezone || 'UTC')
  const trainedToday = dates.some(d => localDate(d) === local.date)
  const monthLine = extra.month ? `${extra.month.workout_days}/${MONTHLY_TARGET} days in ${monthOf(local.date)}` : ''

  const today = planData?.weeklySchedule?.find((d: any) => d.day === local.weekday)
  if (today?.type === 'workout' && !trainedToday) {
    const n = today.workout?.exercises?.length ?? 0
    return {
      title: 'Time to train',
      body: [`Today: ${today.title}`, n && `${n} exercises`, today.durationMinutes && `~${today.durationMinutes} min`, monthLine].filter(Boolean).join(' · '),
      tag: 'workout-day',
    }
  }

  if (settings.streak_warnings && local.weekday === 'Sunday') {
    const { streak, trainedThisWeek } = streakBeforeThisWeek(dates, now)
    if (streak > 0 && !trainedThisWeek) {
      return {
        title: `Your ${streak}-week streak ends tonight`,
        body: 'One workout today keeps it alive.',
        tag: 'streak',
      }
    }
  }

  // No planned session today: nudge only after two or more days off
  if (!today && extra.last && !trainedToday) {
    const gap = dayNumber(local.date) - dayNumber(localDate(extra.last.created_at))
    if (gap >= 2) {
      return {
        title: 'Time to train',
        body: `Last workout: ${extra.last.name || 'Workout'}, ${gap} days ago.${monthLine ? ` ${monthLine}.` : ''}`,
        tag: 'nudge',
      }
    }
  }
  return null
}

// Monday of the week that holds `date` (YYYY-MM-DD)
export function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// Sunday recap from this week's logs. logs: { created_at, volume, sets: [{ ex, weight }] } over ~100 days.
export function buildRecap(logs: any[], settings: any, local: ReturnType<typeof localParts>, unit = 'lb', summary: any = null) {
  const localDate = inZone(settings.timezone || 'UTC')
  const monday = mondayOf(local.date)
  const week = logs.filter(l => localDate(l.created_at) >= monday && localDate(l.created_at) <= local.date)
  const workouts = new Set(week.map(l => localDate(l.created_at))).size
  if (!workouts) return null

  const lb = week.reduce((a, l) => a + (Number(l.volume) || 0), 0)
  const volume = Math.round(unit === 'kg' ? lb * 0.45359237 : lb)

  // A PR: this week's heaviest set of an exercise beats everything before this week
  const best: Record<string, number> = {}
  for (const l of logs.filter(l => localDate(l.created_at) < monday)) {
    for (const s of l.sets || []) best[s.ex] = Math.max(best[s.ex] ?? 0, Number(s.weight) || 0)
  }
  const top: Record<string, number> = {}
  for (const l of week) for (const s of l.sets || []) top[s.ex] = Math.max(top[s.ex] ?? 0, Number(s.weight) || 0)
  const prs = Object.entries(top).filter(([ex, w]) => w > 0 && best[ex] !== undefined && w > best[ex]).length

  const parts = [`${volume.toLocaleString('en-US')} ${unit} lifted`]
  if (prs) parts.push(plural(prs, 'PR'))
  let tail = ''
  if (summary) {
    tail = ` ${summary.points} pts this month`
    if (summary.friends > 0) tail += `, #${summary.friends_place} of ${summary.friends + 1} with friends`
    tail += '.'
  }
  return { title: `Your week: ${plural(workouts, 'workout')}`, body: `${parts.join(' · ')}.${tail}` }
}

// A workout left open in the app (open_workouts row)
export function openWorkoutMessage(row: any) {
  const progress = row.exercises_total
    ? `${row.exercises_done} of ${plural(row.exercises_total, 'exercise')} done`
    : `${plural(row.sets_done, 'set')} logged`
  return {
    title: `${row.name || 'Your workout'} is still open`,
    body: `${progress}. Pick up where you left off, or finish it to save it.`,
    tag: 'open-workout',
    url: '/?open=workout',
  }
}

// Per-type push switches in reminder_settings; no row means everything is on
const SWITCH: Record<string, string> = {
  friend_request: 'notify_friends', friend_accepted: 'notify_friends',
  month_result: 'notify_achievements', badge: 'notify_achievements', target: 'notify_achievements',
  recap: 'notify_recap', 'open-workout': 'notify_workout_open',
  team_request: 'notify_team', team_joined: 'notify_team', team_accepted: 'notify_team',
  team_declined: 'notify_team', team_removed: 'notify_team', team_left: 'notify_team', team_practice: 'notify_team',
}
export function pushAllowed(kind: string, prefs: any) {
  const key = SWITCH[kind]
  return !key || !prefs || prefs[key] !== false
}
