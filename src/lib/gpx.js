// A run from a watch or app export: GPX (Garmin, Strava, Apple Health exporters, most watches)
// or TCX (Garmin). Read on the device: distance from the track (or TCX's own total), time from
// the first to the last point, and the day it started. Nothing is uploaded but the result.

const R = 6371008.8 // mean earth radius, metres
const rad = d => (d * Math.PI) / 180

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const byTag = (el, name) => [...el.getElementsByTagNameNS('*', name)]
const text = (el, name) => byTag(el, name)[0]?.textContent?.trim() ?? ''

// → { distance_m, seconds, start: Date } or throws with a message to show
export function parseTrack(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (byTag(doc, 'parsererror').length) throw new Error("This file couldn't be read. Pick a GPX or TCX file.")

  let points = byTag(doc, 'trkpt').map(p => ({ lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'), t: Date.parse(text(p, 'time')) }))
  let total = null
  if (!points.length) {
    const tps = byTag(doc, 'Trackpoint')
    points = tps.map(p => ({ lat: +text(p, 'LatitudeDegrees'), lon: +text(p, 'LongitudeDegrees'), t: Date.parse(text(p, 'Time')) }))
    const laps = byTag(doc, 'Lap').map(l => parseFloat(byTag(l, 'DistanceMeters').find(d => d.parentNode === l)?.textContent))
    if (laps.length && laps.every(n => n > 0)) total = laps.reduce((a, n) => a + n, 0)
  }
  const timed = points.filter(p => Number.isFinite(p.t))
  if (timed.length < 2) throw new Error('No timed track in this file. Export the activity as GPX or TCX.')

  if (total == null) {
    const located = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && (p.lat || p.lon))
    total = 0
    for (let i = 1; i < located.length; i++) total += haversine(located[i - 1], located[i])
  }
  const seconds = Math.round((timed.at(-1).t - timed[0].t) / 1000)
  if (!(total > 0) || seconds <= 0) throw new Error('This track has no distance. Export the activity as GPX or TCX.')
  return { distance_m: Math.round(total * 10) / 10, seconds, start: new Date(timed[0].t) }
}
