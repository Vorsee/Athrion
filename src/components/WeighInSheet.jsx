import { useState } from 'react'
import { WeightSheet } from './GoalProgress.jsx'
import { saveMeasurement } from '../lib/progressApi.js'
import { saveProfileWeight } from '../lib/api.js'
import { todayKey } from '../lib/data.js'

// The weigh-in a reminder opens (/?open=weighin): today's weight saved as on Plan, a
// body_measurements row plus the profile weight
export default function WeighInSheet({ onClose, onProfileChange }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(lb) {
    setSaving(true); setError('')
    try {
      await saveMeasurement({ date: todayKey(), weight_lb: lb })
      await saveProfileWeight(lb).catch(() => {})
      onProfileChange?.()
      onClose()
    } catch (e) {
      setError(e.message || 'Could not save')
      setSaving(false)
    }
  }
  return <WeightSheet onClose={onClose} onSave={save} saving={saving} error={error} />
}
