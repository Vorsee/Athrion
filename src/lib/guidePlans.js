// The free 7-day plan at /guide (the "comment GUIDE" link from Instagram).
// Fixed plans, no AI: pick a goal and a place, get three sessions plus rest and cardio days.
// Every exercise name must exist in EXERCISES (data.js) so the saved workouts start normally.

export const GUIDE_GOALS = [['muscle', 'Build muscle'], ['fat', 'Lose fat'], ['fit', 'Get fit']]
export const GUIDE_PLACES = [['gym', 'Gym'], ['home', 'Home']]

// [name, main lift?, reps override]. Main lifts come first and get the heavier scheme.
const SESSIONS = {
  gym: [
    ['Full body A', [['Squat', 1], ['Bench Press', 1], ['Seated Cable Row'], ['Lateral Raise'], ['Plank', 0, '30–45 s']]],
    ['Full body B', [['Romanian Deadlift', 1], ['Lat Pulldown', 1], ['Incline Dumbbell Press'], ['Walking Lunge', 0, '10 each leg'], ['Cable Crunch']]],
    ['Full body C', [['Leg Press', 1], ['Overhead Press', 1], ['Barbell Row'], ['Hip Thrust'], ['Dumbbell Curl']]],
  ],
  home: [
    ['Full body A', [['Reverse Lunge', 1, '10 each leg'], ['Push-Up', 1], ['Glute Bridge'], ['Pike Push-Up'], ['Plank', 0, '30–45 s']]],
    ['Full body B', [['Bulgarian Split Squat', 1, '8–12 each leg'], ['Diamond Push-Up', 1], ['Single-Leg Hip Thrust', 0, '10 each leg'], ['Bird Dog', 0, '8 each side'], ['Side Plank', 0, '20–30 s each side']]],
    ['Full body C', [['Step-Up', 1, '10 each leg'], ['Decline Push-Up', 1], ['Walking Lunge', 0, '12 each leg'], ['Hollow Body Hold', 0, '20–30 s'], ['Russian Twist', 0, '20 total']]],
  ],
}

// Sets, reps and rest per goal; home reps run higher since there's no load to add
const SCHEMES = {
  muscle: { main: [4, '6–10', '8–15', '2 min'], acc: [3, '10–12', '12–20', '75 s'] },
  fat:    { main: [3, '10–12', '12–20', '60 s'], acc: [3, '12–15', '15–20', '45 s'] },
  fit:    { main: [3, '8–12', '10–15', '90 s'], acc: [3, '12', '12–15', '60 s'] },
}

const CARDIO = {
  muscle: 'Optional: 20–30 min easy walk. Recovery is where the muscle gets built.',
  fat:    '30–40 min brisk walk, bike or incline treadmill. You should be able to talk, just.',
  fit:    '25–30 min of easy cardio you enjoy: run, bike, swim or a long walk.',
}

const INTROS = {
  muscle: 'Three full-body sessions that hit every muscle twice or more a week. Heavy main lifts first, then volume.',
  fat:    'Three full-body strength sessions to keep your muscle, plus cardio days. Pair it with a small calorie deficit.',
  fit:    'Three balanced full-body sessions and one cardio day. Strength, stamina and a habit that sticks.',
}

export function guidePlan(goal = 'muscle', place = 'gym') {
  if (!SCHEMES[goal]) goal = 'muscle'
  if (!SESSIONS[place]) place = 'gym'
  const scheme = SCHEMES[goal]
  const home = place === 'home'
  const sessions = SESSIONS[place].map(([title, list]) => ({
    type: 'workout', title,
    exercises: list.map(([name, main, reps]) => {
      const [sets, gymReps, homeReps, rest] = main ? scheme.main : scheme.acc
      return { name, sets, reps: reps ?? (home ? homeReps : gymReps), rest }
    }),
  }))
  const cardio = { type: 'cardio', title: goal === 'muscle' ? 'Rest or walk' : 'Cardio', note: CARDIO[goal] }
  const rest = { type: 'rest', title: 'Rest', note: 'Full rest. Sleep 7–9 hours and eat your protein.' }
  const [a, b, c] = sessions
  const days = [a, goal === 'fat' ? cardio : rest, b, goal === 'muscle' ? rest : cardio, c, goal === 'fat' ? cardio : rest, rest]
  return { goal, place, intro: INTROS[goal], days: days.map((d, i) => ({ ...d, day: i + 1 })) }
}

// Saved-workout names for the three sessions, e.g. "Free week: Full body A"
export const guideWorkoutName = title => `Free week: ${title}`

// The choice survives sign-up, so the plan is waiting once the account exists
const KEY = 'athrion_guide_pick'
export function rememberGuidePick(goal, place) {
  try { localStorage.setItem(KEY, JSON.stringify({ goal, place })) } catch {}
}
export function readGuidePick() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null }
}
export function clearGuidePick() {
  try { localStorage.removeItem(KEY) } catch {}
}
