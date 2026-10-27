// Import workout history from a Strong or Hevy CSV export into workout_logs.
// Weights are stored in lb like everything else; names are matched to ATHRION's exercises
// where they're the same lift ("Bench Press (Barbell)" → "Bench Press") so history and PRs line up.
import { supabase } from './supabase.js'
import { EXERCISES, localDateKey } from './data.js'
import { toLb } from './units.js'

// RFC 4180-ish: quoted fields, doubled quotes, commas or semicolons, CRLF
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.indexOf('\n') + 1 || undefined)
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  const [head = [], ...body] = rows
  const keys = head.map(h => h.trim())
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

// Strong: "2024-03-05 18:30:00". Hevy: "5 Mar 2024, 18:30" (older exports use ISO too)
export function parseWhen(s) {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5])
  const hevy = s.match(/^(\d{1,2}) ([A-Za-z]{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/)
  if (hevy && MONTHS[hevy[2].toLowerCase()] != null) return new Date(+hevy[3], MONTHS[hevy[2].toLowerCase()], +hevy[1], +hevy[4], +hevy[5])
  const d = new Date(s)
  return isNaN(d) ? null : d
}

const squash = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const KNOWN = new Map(EXERCISES.map(e => [squash(e.name), e.name]))

// "Bench Press (Barbell)" → "Bench Press" when ATHRION has it; otherwise keep their name
export function matchExercise(name) {
  return KNOWN.get(squash(name)) ?? KNOWN.get(squash(name.replace(/\s*\([^)]*\)\s*$/, ''))) ?? name
}

// 'strong' | 'hevy' | null, from the header row
export function detectFormat(rows) {
  const k = Object.keys(rows[0] ?? {})
  if (k.includes('Exercise Name') && k.includes('Set Order')) return 'strong'
  if (k.includes('exercise_title') && k.includes('start_time')) return 'hevy'
  return null
}

const minutes = s => {
  const h = s.match(/(\d+)\s*h/)?.[1] ?? 0, m = s.match(/(\d+)\s*m(?!s)/)?.[1] ?? 0
  return +h * 60 + +m
}

// → [{ date, name, duration, volume, sets, created_at }], oldest first.
// strongUnit: the weight unit set in the Strong app (Strong's export doesn't say)
export function toWorkouts(rows, { strongUnit = 'lb' } = {}) {
  const format = detectFormat(rows)
  if (!format) throw new Error("This doesn't look like a Strong or Hevy export.")
  const byWorkout = new Map()
  for (const r of rows) {
    const strong = format === 'strong'
    if (!strong && r.set_type === 'warmup') continue
    const when = parseWhen(strong ? r.Date : r.start_time)
    const reps = parseInt(strong ? r.Reps : r.reps) || 0
    if (!when || reps <= 0) continue // cardio, timed holds and rest timers have no reps
    const rawWeight = parseFloat(strong ? r.Weight : (r.weight_lbs ?? r.weight_kg)) || 0
    const unit = strong ? strongUnit : r.weight_lbs != null ? 'lb' : 'kg'
    const key = `${when.getTime()}|${strong ? r['Workout Name'] : r.title}`
    if (!byWorkout.has(key)) {
      const end = !strong && parseWhen(r.end_time || '')
      byWorkout.set(key, {
        when,
        name: (strong ? r['Workout Name'] : r.title) || 'Workout',
        mins: strong ? minutes(r.Duration || '') : end ? Math.round((end - when) / 60000) : 0,
        sets: [],
      })
    }
    const w = byWorkout.get(key)
    const ex = matchExercise(strong ? r['Exercise Name'] : r.exercise_title)
    w.sets.push({ ex, set: w.sets.filter(s => s.ex === ex).length + 1, weight: Math.round(toLb(rawWeight, unit) * 10) / 10, reps })
  }
  return [...byWorkout.values()]
    .filter(w => w.sets.length)
    .sort((a, b) => a.when - b.when)
    .map(w => ({
      date: localDateKey(w.when),
      name: w.name,
      duration: w.mins > 0 ? `${w.mins}min` : null,
      volume: Math.round(w.sets.reduce((a, s) => a + s.weight * s.reps, 0)),
      sets: w.sets,
      created_at: w.when.toISOString(),
    }))
}

// Saves workouts not already logged (same day and name), in batches. Returns how many were added.
export async function importWorkouts(workouts, existing = []) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const have = new Set(existing.map(w => `${w.date}|${w.name}`))
  const fresh = workouts.filter(w => !have.has(`${w.date}|${w.name}`))
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await supabase.from('workout_logs').insert(fresh.slice(i, i + 200).map(w => ({ ...w, user_id: user.id })))
    if (error) throw error
  }
  return fresh.length
}
