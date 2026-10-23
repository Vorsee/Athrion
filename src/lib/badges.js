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

export function computeEarnedBadges({ history = [], weighIns = 0, photos = 0 }) {
  const earned = new Set()
  const n = history.length
  if (n >= 1) earned.add('first_workout')
  if (n >= 10) earned.add('workouts_10')
  if (n >= 50) earned.add('workouts_50')
  if (n >= 100) earned.add('workouts_100')

  const streak = weeklyStreak(history)
  if (streak >= 4) earned.add('streak_4')
  if (streak >= 12) earned.add('streak_12')

  const prs = countPRs(history)
  if (prs >= 1) earned.add('first_pr')
  if (prs >= 25) earned.add('prs_25')

  for (const h of history) {
    if ((h.volume ?? 0) >= 10000) earned.add('volume_10k')
    const hour = new Date(h.created_at).getHours()
    if (hour < 7 && hour >= 3) earned.add('early_bird')
    if (hour >= 22) earned.add('night_owl')
  }

  if (weighIns >= 10) earned.add('weigh_in_10')
  if (photos >= 1) earned.add('first_photo')
  return earned
}
