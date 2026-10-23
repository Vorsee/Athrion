// Exercise demos from free-exercise-db (public domain, github.com/yuhonas/free-exercise-db).
// Pinned to a commit so images and names don't shift under us.
const BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'

let dbPromise = null

export function loadExerciseDb() {
  dbPromise ??= fetch(`${BASE}/dist/exercises.json`)
    .then(r => { if (!r.ok) throw new Error(`Exercise library unavailable (${r.status})`); return r.json() })
    .then(list => list.map(prepare))
    .catch(err => { dbPromise = null; throw err })
  return dbPromise
}

export const imageUrl = path => `${BASE}/exercises/${path}`

// Filler words, ignored everywhere
const STOP = new Set(['the', 'a', 'with', 'and', 'or', 'on', 'to', 'of', 'for'])
// Words in our plan names that describe effort or loading, not the movement.
// Only ignored in queries: library names like "Weighted Squat" keep them.
const QUERY_STOP = new Set(['each', 'light', 'heavy', 'steady', 'state', 'easy', 'brisk', 'fast', 'slow', 'weighted', 'standard', 'conventional', 'zone', 'interval', 'block', 'tempo', 'progression'])

// Same movement, different spelling
const SYNONYMS = {
  db: 'dumbbell', kb: 'kettlebell', bb: 'barbell', rdl: 'romanian',
  flye: 'fly', treadmill: 'jogging', jog: 'jogging', run: 'jogging', running: 'jogging',
  bike: 'bicycling', cycling: 'bicycling', rower: 'rowing', tricep: 'tricep', triceps: 'tricep', bicep: 'bicep', biceps: 'bicep',
}

// Common gym names → the dataset's name for that movement: [match, dataset name, unless].
// Checked in order, after an exact name match.
const ALIASES = [
  [/\b(overhead|military) press\b/, 'Standing Military Press', /dumbbell|machine|seated|arnold|z press|landmine|kettlebell|cable|tricep/],
  [/^(barbell |flat )?bench press$/, 'Barbell Bench Press - Medium Grip'],
  [/^(barbell |conventional )?deadlift$/, 'Barbell Deadlift'],
  [/^(barbell |bent.over |pendlay )?(barbell )?row$/, 'Bent Over Barbell Row'],
  [/farmer|suitcase carry/, "Farmer's Walk"],
  [/jump rope|skipping/, 'Rope Jumping'],
  [/battle rope/, 'Battling Ropes'],
  [/rower|rowing machine|\berg\b/, 'Rowing, Stationary'],
  [/assault bike|air bike/, 'Air Bike'],
  [/\bbike\b|cycling|spin class/, 'Bicycling, Stationary'],
  [/\b(walk|walking|hike)\b/, 'Walking, Treadmill', /lunge|band|monster|bear|plank|crab|duck|farmer|lateral/],
  [/treadmill|\brun\b|jog|tempo run/, 'Jogging, Treadmill'],
  [/pec deck|machine fly/, 'Butterfly', /reverse|rear/],
  [/cat.?cow/, 'Cat Stretch'],
  [/kettlebell swing/, 'One-Arm Kettlebell Swings'],
  [/^(wide.grip )?lat pulldown|pull.?up or lat pulldown/, 'Wide-Grip Lat Pulldown'],
  [/tricep(s)? dip|bench dip/, 'Bench Dips'],
  [/^push.?ups?$/, 'Pushups'],
  [/side plank/, 'Side Bridge'],
  [/(tricep(s)?|rope) pushdown/, 'Triceps Pushdown'],
  [/sprint/, 'Wind Sprints', /bike|rower|row|swim|cycl/],
  [/box jump/, 'Front Box Jump'],
  [/hip thrust/, 'Barbell Hip Thrust'],
  [/^(dumbbell )?(bicep )?curl$/, 'Dumbbell Bicep Curl'],
  [/lateral raise/, 'Side Lateral Raise', /bent|rear|reverse|lying|prone/],
  [/calf raise/, 'Standing Calf Raises', /seated|donkey|leg press/],
  [/seated (cable )?row|cable row/, 'Seated Cable Rows'],
  [/goblet squat/, 'Goblet Squat'],
  [/^(barbell )?(back )?squat$/, 'Barbell Squat'],
  [/^(hanging )?(straight )?leg raise/, 'Hanging Leg Raise'],
]

function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 3 && t.endsWith('es') && /(ss|sh|ch|x)es$/.test(t)) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

export function tokenize(name, { query = false } = {}) {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')              // drop parentheticals like "(rower, bike)"
    .replace(/(pull|push|chin|sit)[\s-]?ups?/g, '$1up')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stem)
    .filter(t => t && !STOP.has(t) && !(query && QUERY_STOP.has(t)) && !/^\d+$/.test(t))
    .map(t => SYNONYMS[t] ?? t)
}

function prepare(e) {
  // Text after " - " is a variant ("Medium Grip", "With Bands"), not a different exercise
  const [core, ...rest] = e.name.split(' - ')
  return { ...e, tokens: tokenize(core), qualifiers: tokenize(rest.join(' ')) }
}

function score(query, entry) {
  const q = new Set(query), core = new Set(entry.tokens)
  let hit = 0
  for (const t of q) if (core.has(t)) hit++
  if (!hit) return 0
  const extra = core.size - hit
  // Cover the query; penalise extra words in the library name; qualifiers barely count
  return hit / q.size - 0.16 * extra - 0.03 * entry.qualifiers.length
}

const cache = new Map()

// Best demo for an exercise name, or null when nothing is close enough
export async function findDemo(name) {
  if (cache.has(name)) return cache.get(name)
  const db = await loadExerciseDb()
  const lower = String(name).toLowerCase().replace(/\(.*?\)/g, '').trim()

  const q = tokenize(name, { query: true })
  const key = [...new Set(q)].sort().join(' ')
  const sameWords = e => [...new Set(e.tokens)].sort().join(' ') === key

  // 1. Same words as a library name (ignoring order and plurals)
  let result = db.find(e => sameWords(e) && !e.qualifiers.length) ?? null

  // 2. Known gym-name aliases
  if (!result) {
    const alias = ALIASES.find(([re, , unless]) => re.test(lower) && !unless?.test(lower))
    if (alias) result = db.find(e => e.name === alias[1]) ?? null
  }

  // 3. Same words plus a variant qualifier ("Bench Press - With Bands")
  result ??= db.find(sameWords) ?? null

  // 4. Closest word overlap, only when it's clearly the same movement
  if (!result) {
    let bestScore = 0
    for (const e of db) {
      const sc = score(q, e)
      if (sc > bestScore) { result = e; bestScore = sc }
    }
    if (bestScore < 0.7) result = null
  }
  cache.set(name, result)
  return result
}

const OLYMPIC = /\b(clean|snatch|jerk)\b/i

// Exercises that train the same primary muscle, preferring the same equipment
export async function findAlternatives(name, { limit = 6 } = {}) {
  const db = await loadExerciseDb()
  const base = await findDemo(name)
  if (!base) return []
  const muscle = base.primaryMuscles[0]
  const secondary = new Set(base.secondaryMuscles)
  const similarity = e =>
    3 * (e.force === base.force) +
    2 * (e.mechanic === base.mechanic) +
    1.5 * (e.equipment === base.equipment) +
    0.5 * e.secondaryMuscles.filter(m => secondary.has(m)).length +
    (e.level === 'beginner' ? 0.5 : 0)
  return db
    // Olympic lifts are technical; only suggest them in place of another Olympic lift
    .filter(e => !OLYMPIC.test(e.name) || OLYMPIC.test(base.name))
    .filter(e => e.id !== base.id && e.primaryMuscles[0] === muscle && e.category === base.category && e.level !== 'expert')
    .sort((a, b) => similarity(b) - similarity(a) || a.name.length - b.name.length)
    .slice(0, limit)
}

export function youtubeSearchUrl(name) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${name} exercise form`)}`
}
