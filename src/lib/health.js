// Health data sync. In the browser there is no health API, so only manual entry
// works; inside the native app (Capacitor) this reads HealthKit / Health Connect.
import { Capacitor } from '@capacitor/core'
import { saveDailyHealth } from './progressApi.js'

const READ_TYPES = ['steps', 'sleep', 'restingHeartRate', 'calories']
const ASLEEP = new Set(['asleep', 'rem', 'deep', 'light'])

export function healthSyncAvailable() {
  return Capacitor.isNativePlatform()
}

async function plugin() {
  const { Health } = await import('@capgo/capacitor-health')
  return Health
}

const localDate = iso => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Reads the last `days` days and saves one daily_health row per day. Returns days written.
export async function syncHealthData(days = 14, { prompt = true } = {}) {
  if (!healthSyncAvailable()) throw new Error('Health sync is only available in the ATHRION mobile app')
  const Health = await plugin()

  const { available, reason } = await Health.isAvailable()
  if (!available) throw new Error(reason || 'Apple Health / Health Connect is not available on this device')

  const auth = prompt
    ? await Health.requestAuthorization({ read: READ_TYPES })
    : await Health.checkAuthorization({ read: READ_TYPES })
  if (!auth.readAuthorized.length) {
    if (prompt) throw new Error('Health access was not granted')
    return 0
  }

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const range = { startDate: start.toISOString(), endDate: new Date().toISOString() }
  const rows = {}
  const row = date => (rows[date] ??= { date, source: Capacitor.getPlatform() === 'ios' ? 'healthkit' : 'health_connect' })
  const granted = new Set(auth.readAuthorized)

  if (granted.has('steps')) {
    const { samples } = await Health.queryAggregated({ ...range, dataType: 'steps', bucket: 'day', aggregation: 'sum' })
    for (const s of samples) row(localDate(s.startDate)).steps = Math.round(s.value)
  }
  if (granted.has('calories')) {
    const { samples } = await Health.queryAggregated({ ...range, dataType: 'calories', bucket: 'day', aggregation: 'sum' })
    for (const s of samples) row(localDate(s.startDate)).active_calories = Math.round(s.value)
  }
  if (granted.has('restingHeartRate')) {
    const { samples } = await Health.queryAggregated({ ...range, dataType: 'restingHeartRate', bucket: 'day', aggregation: 'average' })
    for (const s of samples) row(localDate(s.startDate)).resting_hr = Math.round(s.value)
  }
  if (granted.has('sleep')) {
    // Sum time actually asleep, credited to the morning the night ended
    const { samples } = await Health.readSamples({ ...range, dataType: 'sleep', limit: 1000 })
    const minutes = {}
    for (const s of samples) {
      if (s.stages?.length) {
        for (const st of s.stages) if (ASLEEP.has(st.stage)) minutes[localDate(s.endDate)] = (minutes[localDate(s.endDate)] ?? 0) + st.durationMinutes
      } else if (!s.sleepState || ASLEEP.has(s.sleepState)) {
        const mins = (new Date(s.endDate) - new Date(s.startDate)) / 60000
        minutes[localDate(s.endDate)] = (minutes[localDate(s.endDate)] ?? 0) + mins
      }
    }
    for (const [date, m] of Object.entries(minutes)) row(date).sleep_hours = Math.round((m / 60) * 10) / 10
  }

  const list = Object.values(rows)
  if (list.length) await saveDailyHealth(list)
  return list.length
}
