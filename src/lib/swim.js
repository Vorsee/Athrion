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

// A pace only counts as a PR over at least one length of a short pool
const PR_MIN_M = 25

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

// The coach's leaderboard for one stroke: active swimmers with a PR in it, fastest pace first.
// prs: my_team_prs rows (020), one per swimmer and stroke; roster: my_swim_roster rows.
export function strokeBoard(prs, roster, stroke) {
  const who = Object.fromEntries(roster.filter(r => r.status === 'active').map(r => [r.user_id, r]))
  return prs
    .filter(p => p.stroke === stroke && who[p.user_id] && Number(p.distance_m) > 0)
    .map(p => ({ ...p, swimmer: who[p.user_id], perM: p.seconds / Number(p.distance_m) }))
    .sort((a, b) => a.perM - b.perM || (a.date < b.date ? -1 : 1))
    .map((p, i) => ({ ...p, place: i + 1 }))
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
