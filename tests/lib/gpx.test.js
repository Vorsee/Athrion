// Runs from a watch export: GPX tracks and TCX laps, read on the device
import { describe, it, expect } from 'vitest'
import { parseTrack, haversine } from '../../src/lib/gpx.js'

const gpx = pts => `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${
  pts.map(([lat, lon, t]) => `<trkpt lat="${lat}" lon="${lon}"><time>${t}</time></trkpt>`).join('')}</trkseg></trk></gpx>`

describe('gpx', () => {
  it('measures a degree of latitude as about 111 km', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -2)
  })
  it('reads distance, time and start from a GPX track', () => {
    const t = parseTrack(gpx([[40, -74, '2026-11-01T12:00:00Z'], [40.01, -74, '2026-11-01T12:03:00Z'], [40.02, -74, '2026-11-01T12:06:30Z']]))
    expect(t.distance_m).toBeCloseTo(2224, -1)
    expect(t.seconds).toBe(390)
    expect(t.start.toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })
  it('uses the laps\' own distance in a TCX file', () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity><Lap>
      <DistanceMeters>5000</DistanceMeters><Track>
      <Trackpoint><Time>2026-11-01T07:00:00Z</Time><DistanceMeters>0</DistanceMeters></Trackpoint>
      <Trackpoint><Time>2026-11-01T07:27:00Z</Time><DistanceMeters>5000</DistanceMeters></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`
    expect(parseTrack(tcx)).toMatchObject({ distance_m: 5000, seconds: 1620 })
  })
  it('says so when a file has no timed track', () => {
    expect(() => parseTrack(gpx([[40, -74, '']]))).toThrow(/No timed track/)
    expect(() => parseTrack('not xml <')).toThrow(/couldn't be read/)
  })
})
