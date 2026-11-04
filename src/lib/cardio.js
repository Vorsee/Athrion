// Runs and swims: units, pace and records. Stored in metres and seconds; shown in the
// person's units (kg users get km and metres, lb users get miles and yards).
export const KINDS = {
  run:  { label: 'Run',  icon: 'mdi:run' },
  swim: { label: 'Swim', icon: 'mdi:swim' },
}

const MI = 1609.344, YD = 0.9144

// Which side of the Cardio tab opens: the last one used, on this device. A plan's run day
// sets it to run before opening the tab.
const SPORT_KEY = 'athrion_cardio_sport'
export function readCardioSport() {
  try { return localStorage.getItem(SPORT_KEY) === 'run' ? 'run' : 'swim' } catch { return 'swim' }
}
export function rememberCardioSport(sport) {
  try { localStorage.setItem(SPORT_KEY, sport) } catch { /* only a convenience */ }
}

// Distance unit typed and shown, and the stretch pace is given per
export function cardioUnits(kind, unit) {
  const metric = unit === 'kg'
  if (kind === 'swim') return metric
    ? { dist: 'm', per: '100 m', toM: v => v, fromM: m => m, paceM: 100 }
    : { dist: 'yd', per: '100 yd', toM: v => v * YD, fromM: m => m / YD, paceM: 100 * YD }
  return metric
    ? { dist: 'km', per: 'km', toM: v => v * 1000, fromM: m => m / 1000, paceM: 1000 }
    : { dist: 'mi', per: 'mi', toM: v => v * MI, fromM: m => m / MI, paceM: MI }
}

// "1:05:30", "45:00" or "45" (minutes) → seconds; null if it can't be read
export function parseDuration(text) {
  const parts = String(text).trim().split(':').map(p => p.trim())
  if (!parts[0] || parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return null
  const n = parts.map(Number)
  const secs = n.length === 1 ? n[0] * 60 : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2]
  return secs > 0 ? Math.round(secs) : null
}

export function fmtDuration(secs) {
  const t = Math.round(secs) // round first, so 479.99 s reads 8:00, not 7:60
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  const pad = x => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Seconds per km / mi / 100 m / 100 yd
export const paceSecs = (log, u) => (log.seconds / log.distance_m) * u.paceM

export function fmtDistance(m, u) {
  const v = u.fromM(Number(m))
  return u.dist === 'km' || u.dist === 'mi' ? `${(Math.round(v * 100) / 100).toFixed(2)} ${u.dist}` : `${Math.round(v).toLocaleString()} ${u.dist}`
}

// This week's totals (Monday start) and all-time bests for one kind
export function cardioSummary(logs, kind, now = new Date()) {
  const mine = logs.filter(l => l.kind === kind)
  const monday = new Date(now); monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const week = mine.filter(l => new Date(`${l.date}T12:00:00`) >= monday)
  const sum = (list, k) => list.reduce((a, l) => a + Number(l[k]), 0)
  const longest = mine.reduce((b, l) => (!b || Number(l.distance_m) > Number(b.distance_m) ? l : b), null)
  // Fastest pace only counts sessions long enough to mean something
  const minM = kind === 'run' ? 1000 : 100
  const fastest = mine.filter(l => Number(l.distance_m) >= minM)
    .reduce((b, l) => (!b || l.seconds / l.distance_m < b.seconds / b.distance_m ? l : b), null)
  return { count: mine.length, week: { sessions: week.length, distance_m: sum(week, 'distance_m'), seconds: sum(week, 'seconds') }, longest, fastest }
}

// What a plan needs to know about someone's running, from the last 8 weeks of runs: how often
// and how far, their paces (per km, runs of 1 km or more) and the weekdays they usually run.
// Sent with plan generation and weekly adapts (fitnessApi.js → plan.ts); undefined with no runs.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const perKm = (secs, m) => fmtDuration((secs / m) * 1000)
export function runSummary(logs, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 56)
  const runs = (logs ?? []).filter(l => l.kind === 'run' && Number(l.distance_m) > 0 && l.seconds > 0 && new Date(`${l.date}T12:00:00`) >= from)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first
  if (!runs.length) return undefined
  const km = m => Math.round(Number(m) / 100) / 10
  const total = runs.reduce((a, l) => a + Number(l.distance_m), 0)
  const timed = runs.filter(l => Number(l.distance_m) >= 1000)
  const best = timed.reduce((b, l) => (!b || l.seconds / l.distance_m < b.seconds / b.distance_m ? l : b), null)
  const recent = timed.slice(0, 5)
  const recentSecs = recent.reduce((a, l) => a + l.seconds, 0), recentM = recent.reduce((a, l) => a + Number(l.distance_m), 0)
  const byDay = {}
  for (const l of runs) { const d = WEEKDAYS[new Date(`${l.date}T12:00:00`).getDay()]; byDay[d] = (byDay[d] ?? 0) + 1 }
  const last = new Date(`${runs[0].date}T12:00:00`)
  return {
    runsLast8Weeks: runs.length,
    runsPerWeek: Math.round((runs.length / 8) * 10) / 10,
    averageWeeklyKm: Math.round((total / 8 / 100)) / 10,
    longestRunKm: km(Math.max(...runs.map(l => Number(l.distance_m)))),
    bestPacePerKm: best ? perKm(best.seconds, Number(best.distance_m)) : undefined,
    recentPacePerKm: recentM ? perKm(recentSecs, recentM) : undefined,
    usualRunDays: Object.entries(byDay).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([d]) => d),
    daysSinceLastRun: Math.max(0, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12) - last) / 86400000)),
  }
}
