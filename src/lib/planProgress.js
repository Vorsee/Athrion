// How a plan is going, from the workouts logged since it started: this week day by day, and
// workouts done against workouts planned so far. Dates are local YYYY-MM-DD keys.
import { localDateKey } from './data.js'

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MS = 86400000

const atNoon = key => new Date(`${key}T12:00:00`)
const mondayOf = d => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m }

// When this goal's journey began: the goal's own start date, else the first week of the plan
export function journeyStart({ goalStartDate, plan }) {
  if (goalStartDate) return goalStartDate
  if (!plan?.created_at) return null
  const week = plan.plan_data?.week ?? 1
  return localDateKey(new Date(new Date(plan.created_at).getTime() - (week - 1) * 7 * DAY_MS))
}

/**
 * @param schedule  plan_data.weeklySchedule ([{ day, type, title }])
 * @param history   workout_logs rows ({ date | created_at })
 * @param start     journey start key; weeks the plan should run
 * @returns { week, weeks, startDate, endDate, perWeek, thisWeek: [{ day, date, planned, done, today, title }],
 *            weekDone, weekPlanned, done, planned, pct }
 */
export function planProgress({ schedule = [], history = [], start, weeks = 8, today = new Date() }) {
  const todayKey = localDateKey(today)
  const startKey = start ?? todayKey
  const doneDays = new Set(history.map(h => h.date ?? localDateKey(h.created_at)).filter(d => d >= startKey && d <= todayKey))
  const plannedDay = Object.fromEntries(schedule.map(d => [d.day, d]))
  const perWeek = schedule.filter(d => d.type === 'workout').length

  const monday = mondayOf(today)
  const thisWeek = DAYS.map((day, i) => {
    const date = localDateKey(new Date(monday.getTime() + i * DAY_MS))
    return { day, date, planned: plannedDay[day]?.type === 'workout', title: plannedDay[day]?.title ?? null, done: doneDays.has(date), today: date === todayKey }
  })

  // Planned so far: every planned day from the start up to today
  let planned = 0
  for (let d = atNoon(startKey); localDateKey(d) <= todayKey; d = new Date(d.getTime() + DAY_MS)) {
    if (plannedDay[DAYS[(d.getDay() + 6) % 7]]?.type === 'workout') planned++
  }
  const done = doneDays.size
  const week = Math.max(1, Math.floor((mondayOf(today) - mondayOf(atNoon(startKey))) / (7 * DAY_MS)) + 1)
  return {
    week, weeks, startDate: startKey,
    endDate: localDateKey(new Date(atNoon(startKey).getTime() + weeks * 7 * DAY_MS)),
    perWeek, thisWeek,
    weekDone: thisWeek.filter(d => d.done).length,
    weekPlanned: thisWeek.filter(d => d.planned).length,
    done, planned,
    pct: planned ? Math.min(1, done / planned) : 0,
  }
}

// Weigh-ins from body measurements and check-ins, one per day (measurements win), oldest first
export function mergeWeights(measurements = [], checkins = []) {
  const byDate = {}
  for (const c of checkins) if (c.weight_lb != null) byDate[c.date] = Number(c.weight_lb)
  for (const m of measurements) if (m.weight_lb != null) byDate[m.date] = Number(m.weight_lb)
  return Object.entries(byDate).map(([date, weight_lb]) => ({ date, weight_lb })).sort((a, b) => a.date.localeCompare(b.date))
}
