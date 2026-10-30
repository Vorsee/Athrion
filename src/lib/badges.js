// Badge definitions and the rules for earning them. Earned badges are stored in
// user_badges so they stay earned even if history is later deleted.
import { buildExerciseHistory, weeklyStreak } from './progress.js'

export const BADGES = [
  { id: 'first_workout', icon: 'mdi:flag-checkered',  name: 'First Rep',       desc: 'Finish your first workout' },
  { id: 'workouts_10',   icon: 'mdi:numeric-10-box',  name: 'Getting Serious', desc: 'Finish 10 workouts' },
  { id: 'workouts_50',   icon: 'mdi:medal',           name: 'Half Century',    desc: 'Finish 50 workouts' },
  { id: 'workouts_100',  icon: 'mdi:trophy',          name: 'Centurion',       desc: 'Finish 100 workouts' },
  { id: 'streak_4',      icon: 'mdi:fire',            name: 'On Fire',         desc: 'Train every week for 4 weeks' },
  { id: 'streak_12',     icon: 'mdi:fire-circle',     name: 'Unstoppable',     desc: 'Train every week for 12 weeks' },
  { id: 'first_pr',      icon: 'mdi:arrow-up-bold',   name: 'New Best',        desc: 'Set your first personal record' },
  { id: 'prs_25',        icon: 'mdi:chart-line',      name: 'PR Machine',      desc: 'Set 25 personal records' },
  { id: 'volume_10k',    icon: 'mdi:weight',          name: 'Ten Tonner',      desc: 'Move 10,000 lb in one workout' },
  { id: 'early_bird',    icon: 'mdi:weather-sunset-up', name: 'Early Bird',    desc: 'Finish a workout before 7am' },
  { id: 'night_owl',     icon: 'mdi:owl',             name: 'Night Owl',       desc: 'Finish a workout after 10pm' },
  { id: 'weigh_in_10',   icon: 'mdi:scale-bathroom',  name: 'Data Driven',     desc: 'Log 10 weigh-ins' },
  { id: 'first_photo',   icon: 'mdi:camera',          name: 'Snapshot',        desc: 'Add your first progress photo' },
  { id: 'workouts_250',  icon: 'mdi:crown-outline',   name: 'Iron Habit',      desc: 'Finish 250 workouts' },
  { id: 'streak_26',     icon: 'mdi:calendar-star',   name: 'Half a Year',     desc: 'Train every week for 26 weeks' },
  { id: 'volume_25k',    icon: 'mdi:weight-lifter',   name: 'Heavy Hauler',    desc: 'Move 25,000 lb in one workout' },
  { id: 'weigh_in_50',   icon: 'mdi:chart-bell-curve-cumulative', name: 'Steady Tracker', desc: 'Log 50 weigh-ins' },
  // Swim (cardio_logs with kind 'swim')
  { id: 'swim_first',    icon: 'mdi:swim',            name: 'First Lap',       desc: 'Log your first swim' },
  { id: 'swim_mile',     icon: 'mdi:waves',           name: 'Mile Swimmer',    desc: 'Swim 1,500 m or more in one go' },
  { id: 'swim_10k',      icon: 'mdi:map-marker-distance', name: 'Ten K Club',  desc: 'Swim 10 km in total' },
  { id: 'swim_100k',     icon: 'mdi:earth',           name: 'Long Hauler',     desc: 'Swim 100 km in total' },
  { id: 'swim_strokes',  icon: 'mdi:swap-horizontal-circle-outline', name: 'Medley Master', desc: 'Log all five strokes' },
  { id: 'swim_pr',       icon: 'mdi:timer-sand-complete', name: 'Faster',      desc: 'Beat your best pace on a stroke (50 m or more)' },
  { id: 'swim_streak_4', icon: 'mdi:water',           name: 'Water Regular',   desc: 'Swim every week for 4 weeks' },
]

// Count every session that beat that exercise's previous best weight
function countPRs(history) {
  let prs = 0
  for (const sessions of Object.values(buildExerciseHistory(history))) {
    let best = null
    for (const s of sessions) {
      const top = Math.max(...s.sets.map(x => x.weight))
      if (best !== null && top > best) prs++
      best = best === null ? top : Math.max(best, top)
    }
  }
  return prs
}

// Swims (cardio_logs, kind 'swim'): totals, strokes and paces. A pace counts as beaten over 50 m or
// more, the same floor as PRs on the Swim tab.
function swimBadges(swims, earned) {
  if (!swims.length) return
  earned.add('swim_first')
  const metres = swims.reduce((a, l) => a + (Number(l.distance_m) || 0), 0)
  if (metres >= 10000) earned.add('swim_10k')
  if (metres >= 100000) earned.add('swim_100k')
  if (swims.some(l => Number(l.distance_m) >= 1500)) earned.add('swim_mile')
  if (new Set(swims.map(l => l.stroke).filter(Boolean)).size >= 5) earned.add('swim_strokes')
  const best = {}
  for (const l of [...swims].sort((a, b) => (a.date + (a.created_at ?? '')).localeCompare(b.date + (b.created_at ?? '')))) {
    const m = Number(l.distance_m)
    if (!l.stroke || m < 50 || !(l.seconds > 0)) continue
    const pace = l.seconds / m
    if (best[l.stroke] != null && pace < best[l.stroke]) earned.add('swim_pr')
    best[l.stroke] = Math.min(best[l.stroke] ?? Infinity, pace)
  }
  if (weeklyStreak(swims.map(l => ({ created_at: l.created_at ?? `${l.date}T12:00:00` }))) >= 4) earned.add('swim_streak_4')
}

export function computeEarnedBadges({ history = [], weighIns = 0, photos = 0, swims = [] }) {
  const earned = new Set()
  const n = history.length
  if (n >= 1) earned.add('first_workout')
  if (n >= 10) earned.add('workouts_10')
  if (n >= 50) earned.add('workouts_50')
  if (n >= 100) earned.add('workouts_100')
  if (n >= 250) earned.add('workouts_250')

  const streak = weeklyStreak(history)
  if (streak >= 4) earned.add('streak_4')
  if (streak >= 12) earned.add('streak_12')
  if (streak >= 26) earned.add('streak_26')

  const prs = countPRs(history)
  if (prs >= 1) earned.add('first_pr')
  if (prs >= 25) earned.add('prs_25')

  for (const h of history) {
    if ((h.volume ?? 0) >= 10000) earned.add('volume_10k')
    if ((h.volume ?? 0) >= 25000) earned.add('volume_25k')
    const hour = new Date(h.created_at).getHours()
    if (hour < 7 && hour >= 3) earned.add('early_bird')
    if (hour >= 22) earned.add('night_owl')
  }

  if (weighIns >= 10) earned.add('weigh_in_10')
  if (weighIns >= 50) earned.add('weigh_in_50')
  if (photos >= 1) earned.add('first_photo')
  swimBadges(swims, earned)
  return earned
}
