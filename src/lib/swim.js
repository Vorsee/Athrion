// Swim strokes and the numbers the Swim tab shows per stroke: PR pace, longest swim and the last
// session. Swims are cardio_logs rows with kind 'swim' (015) and a stroke (017).
export const STROKES = [
  { id: 'free',   label: 'Freestyle',    short: 'FR' },
  { id: 'back',   label: 'Backstroke',   short: 'BK' },
  { id: 'breast', label: 'Breaststroke', short: 'BR' },
  { id: 'fly',    label: 'Butterfly',    short: 'FL' },
  { id: 'im',     label: 'Medley',       short: 'IM' },
]
export const strokeLabel = id => STROKES.find(s => s.id === id)?.label ?? null

// A pace only counts as a PR over at least two lengths of a short pool, so one 25 m sprint
// never stands as a PR (my_team_prs uses the same floor, 026)
export const PR_MIN_M = 50

// { [stroke]: { count, metres, last, pr, longest } } for every stroke, plus `all` for every swim
export function strokeStats(swims) {
  const empty = () => ({ count: 0, metres: 0, last: null, pr: null, longest: null })
  const out = Object.fromEntries([...STROKES.map(s => [s.id, empty()]), ['all', empty()]])
  for (const l of swims) {
    const m = Number(l.distance_m)
    for (const key of l.stroke && out[l.stroke] ? [l.stroke, 'all'] : ['all']) {
      const s = out[key]
      s.count++
      s.metres += m
      if (!s.last || l.date > s.last.date || (l.date === s.last.date && (l.created_at ?? '') > (s.last.created_at ?? ''))) s.last = l
      if (!s.longest || m > Number(s.longest.distance_m)) s.longest = l
      if (m >= PR_MIN_M && (!s.pr || l.seconds / m < s.pr.seconds / Number(s.pr.distance_m))) s.pr = l
    }
  }
  return out
}

// How a coach sees a swimmer: the name they gave the team (026), else their @nickname
export const swimmerName = r => r?.display_name?.trim() || (r?.nickname ? `@${r.nickname}` : 'Swimmer')

// Leaderboard distances, so a 50 sprint is never ranked against a 400. In metres; the yard
// distances (100 yd = 91 m, 500 yd = 457 m) land in the same groups.
export const DISTANCE_BANDS = [
  { id: 'sprint',   label: 'Sprint',   hint: '50 to 100',  min: 0,   max: 150 },
  { id: 'middle',   label: 'Middle',   hint: '200 to 300', min: 150, max: 400 },
  { id: 'distance', label: 'Distance', hint: '400 and up', min: 400, max: Infinity },
]
export const bandOf = m => DISTANCE_BANDS.find(b => Number(m) >= b.min && Number(m) < b.max)?.id ?? 'distance'

// The coach's leaderboard for one stroke and distance: active swimmers with a PR there, fastest
// pace first. prs: my_team_prs rows (020, one per swimmer and stroke; 024, one per distance too);
// roster: my_swim_roster rows.
export function strokeBoard(prs, roster, stroke, band = null) {
  const who = Object.fromEntries(roster.filter(r => r.status === 'active').map(r => [r.user_id, r]))
  return prs
    .filter(p => p.stroke === stroke && who[p.user_id] && Number(p.distance_m) > 0 && (!band || bandOf(p.distance_m) === band))
    .map(p => ({ ...p, swimmer: who[p.user_id], perM: p.seconds / Number(p.distance_m) }))
    .sort((a, b) => a.perM - b.perM || (a.date < b.date ? -1 : 1))
    .map((p, i) => ({ ...p, place: i + 1 }))
}

// Pool length unit, on its own: plenty of people weigh in kg and swim in a yards pool. Kept on
// this device; until it's picked it follows the weight unit.
const POOL_KEY = 'athrion_pool_unit'
const poolListeners = new Set()
export function readPoolUnit() {
  try { const v = localStorage.getItem(POOL_KEY); return v === 'm' || v === 'yd' ? v : null } catch { return null }
}
export function setPoolUnit(v) {
  try { localStorage.setItem(POOL_KEY, v) } catch {}
  poolListeners.forEach(f => f())
}
export function subscribePoolUnit(f) { poolListeners.add(f); return () => poolListeners.delete(f) }

// An interval set, like 10 × 100 on 1:45: the distance, the time (send-off × reps, so rest is in
// it and the pace can never look faster than it was) and a note saying what it was
export function intervalSet({ reps, each, sendOff, dist }) {
  if (!(reps > 0) || !(each > 0) || !(sendOff > 0)) return null
  const m = Math.floor(sendOff / 60), s = Math.round(sendOff % 60)
  return { distance: reps * each, seconds: reps * sendOff, note: `${reps} × ${each} ${dist} on ${m}:${String(s).padStart(2, '0')}` }
}

// "today", "yesterday", "3 days ago", or the date
export function daysAgo(date, now = new Date()) {
  if (!date) return null
  const d = new Date(`${date}T12:00:00`)
  const t = new Date(now); t.setHours(12, 0, 0, 0)
  const n = Math.round((t - d) / 86400000)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 14) return `${n} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// athrion.app/swim/<code>: a team invite
export const SWIM_INVITE_PATH = /^\/swim\/([a-z0-9]{6,20})\/?$/i
export const swimInviteLink = code => `${window.location.origin}/swim/${code}`
const KEY = 'athrion_swim_invite'
export function rememberSwimInvite(code) {
  try { localStorage.setItem(KEY, code) } catch {}
}
export function readSwimInvite() {
  try { return localStorage.getItem(KEY) } catch { return null }
}
export function clearSwimInvite() {
  try { localStorage.removeItem(KEY) } catch {}
}

// "Start swimming" on the landing page: sign-up says so, and the app opens on Swim afterwards
// (kept through an email confirmation that reopens the site)
const START_KEY = 'athrion_start_swim'
export function rememberSwimStart() {
  try { localStorage.setItem(START_KEY, '1') } catch {}
}
export function readSwimStart() {
  try { return localStorage.getItem(START_KEY) === '1' } catch { return false }
}
export function clearSwimStart() {
  try { localStorage.removeItem(START_KEY) } catch {}
}

// ── Team practices (025): the coach's sets for a day ────────────────────────
// Pool item: { part, reps, distance, unit ('m' | 'yd'), stroke, send_off ("1:45" or ""), note }
// Dryland item (on land, before the warm-up): { part: 'dryland', name, reps (sets), amount ("12" or "30 s"), note }
export const PRACTICE_PARTS = [['dryland', 'Dryland'], ['warmup', 'Warm-up'], ['main', 'Main set'], ['cooldown', 'Cool-down']]
export const isDryland = i => i?.part === 'dryland'
export const blankItem = (part, unit = 'm') => (part === 'dryland'
  ? { part, name: '', reps: 2, amount: '12', note: '' }
  : { part, reps: part === 'main' ? 8 : 1, distance: part === 'main' ? 100 : 200, unit, stroke: 'free', send_off: '', note: '' })
// Common dryland moves for swimmers: shoulders, core, and legs for starts and turns
export const DRYLAND_MOVES = [
  ['Band pull-aparts', '15'], ['Band external rotation', '12'], ['Push-ups', '10'], ['Plank', '30 s'],
  ['Dead bugs', '10'], ['Squat jumps', '8'], ['Streamline jumps', '8'], ['Arm circles', '30 s'],
]
const DRY = [['dryland', 2, 'Band pull-aparts', '15'], ['dryland', 2, 'Squat jumps', '8'], ['dryland', 2, 'Plank', '30 s']]

// Starting points the coach can edit, in their pool unit
export const PRACTICE_TEMPLATES = [
  { title: 'Aerobic base', items: [...DRY, ['warmup', 1, 400, 'free', '', 'Easy, long strokes'], ['warmup', 4, 50, 'free', '1:00', 'Drill: catch-up'],
    ['main', 5, 200, 'free', '3:10', 'Steady, same time every 200'], ['main', 4, 100, 'back', '1:50', ''], ['cooldown', 1, 200, 'free', '', 'Easy']] },
  { title: 'Sprint', items: [...DRY, ['warmup', 1, 300, 'free', '', 'Easy'], ['warmup', 6, 25, 'free', '0:40', 'Build to fast'],
    ['main', 8, 50, 'free', '1:30', 'All out, full recovery'], ['main', 4, 25, 'fly', '0:45', 'Fast'], ['cooldown', 1, 200, 'back', '', 'Easy']] },
  { title: 'Technique', items: [...DRY, ['warmup', 1, 300, 'free', '', 'Easy'], ['main', 6, 50, 'free', '1:05', 'Fingertip drag'],
    ['main', 6, 50, 'breast', '1:15', 'Two kicks, one pull'], ['main', 4, 100, 'im', '2:00', 'Smooth turns'], ['cooldown', 1, 200, 'free', '', 'Easy']] },
].map(t => ({ title: t.title, build: unit => t.items.map(([part, reps, distance, stroke, send_off, note]) => (part === 'dryland'
  ? { part, reps, name: distance, amount: stroke, note: '' }
  : { part, reps, distance, unit, stroke, send_off, note })) }))

const secsOf = t => { const m = /^(\d+):(\d{2})$/.exec(t ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
// Total distance (in the practice's unit) and, when every pool set has a send-off, the time it
// takes. Dryland is on land, so it adds no distance.
export function practiceTotals(items = []) {
  const pool = items.filter(i => !isDryland(i))
  const distance = pool.reduce((a, i) => a + (Number(i.reps) || 0) * (Number(i.distance) || 0), 0)
  const timed = pool.length > 0 && pool.every(i => secsOf(i.send_off))
  const seconds = timed ? pool.reduce((a, i) => a + (Number(i.reps) || 0) * secsOf(i.send_off), 0) : null
  return { distance, seconds, unit: pool[0]?.unit ?? 'm' }
}
// "8 × 100 m freestyle on 1:45", "400 m backstroke", or on land "2 × 15 band pull-aparts"
export function practiceLine(i) {
  if (isDryland(i)) return `${Number(i.reps) > 1 ? `${i.reps} × ` : ''}${i.amount ? `${i.amount} ` : ''}${(i.name ?? '').toLowerCase()}`.trim()
  const s = STROKES.find(x => x.id === i.stroke)?.label.toLowerCase() ?? ''
  return `${Number(i.reps) > 1 ? `${i.reps} × ` : ''}${Number(i.distance).toLocaleString()} ${i.unit ?? 'm'} ${s}${i.send_off ? ` on ${i.send_off}` : ''}`
}
// The stroke most of the practice is swum in, for logging it as one swim
export function mainStroke(items = []) {
  const by = {}
  for (const i of items.filter(x => !isDryland(x))) by[i.stroke] = (by[i.stroke] ?? 0) + (Number(i.reps) || 0) * (Number(i.distance) || 0)
  return Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'free'
}
