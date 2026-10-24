import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { fetchReminderSettings, saveReminderSettings } from '../lib/progressApi.js'
import { pushSupported, needsHomeScreenInstall, currentSubscription, enablePush, disablePush, sendTestPush } from '../lib/push.js'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5) // 5am – 10pm
const fmtHour = h => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })

function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'bg-neon' : 'bg-[#2a2a2a]'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function ReminderSettings() {
  const [settings, setSettings] = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    Promise.all([fetchReminderSettings().catch(() => null), currentSubscription().catch(() => null)])
      .then(([s, sub]) => {
        setSettings(s ?? { enabled: false, reminder_hour: 18, streak_warnings: true })
        setSubscribed(!!sub)
      })
  }, [])

  if (!settings) return null

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const active = settings.enabled && subscribed

  async function update(patch) {
    const next = { ...settings, ...patch, timezone }
    setSettings(next)
    await saveReminderSettings({
      enabled: next.enabled, reminder_hour: next.reminder_hour,
      streak_warnings: next.streak_warnings, timezone,
    }).catch(e => setMsg(e.message))
  }

  async function toggle(on) {
    setBusy(true); setMsg('')
    try {
      if (on) { await enablePush(); setSubscribed(true) }
      else { await disablePush(); setSubscribed(false) }
      await update({ enabled: on })
      if (on) setMsg(`You'll get a reminder around ${fmtHour(settings.reminder_hour)} on training days.`)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true); setMsg('')
    try {
      await sendTestPush()
      setMsg('Test sent. It should appear within a few seconds.')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon icon="mdi:bell-ring-outline" width={20} className="text-neon flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">Workout reminders</div>
            <div className="text-[11px] text-gray-500">Training-day nudges and streak warnings</div>
          </div>
        </div>
        <Toggle on={active} onChange={toggle} label="Workout reminders" />
      </div>

      {!pushSupported() && <p className="text-[11px] text-gray-500">This browser doesn't support notifications.</p>}
      {pushSupported() && needsHomeScreenInstall() && (
        <p className="text-[11px] text-gray-500">On iPhone, add ATHRION to your Home Screen first (Share → Add to Home Screen), then turn reminders on from there.</p>
      )}

      {active && (
        <div className="space-y-3 pt-1">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">Remind me at</span>
            <select value={settings.reminder_hour} onChange={e => update({ reminder_hour: Number(e.target.value) })}
              className="bg-[#1a1a1a] border border-[#262626] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
              {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">Warn me before I lose my streak</span>
            <Toggle on={settings.streak_warnings} onChange={v => update({ streak_warnings: v })} label="Streak warnings" />
          </div>
          <button onClick={sendTest} disabled={busy}
            className="w-full py-2 rounded-xl border border-[#2a2a2a] text-xs font-semibold text-gray-300 hover:text-neon hover:border-neon/40 disabled:opacity-50 transition-colors">
            Send test notification
          </button>
        </div>
      )}
      {busy && <p className="text-[11px] text-gray-500">Working...</p>}
      {msg && <p className="text-[11px] text-gray-500">{msg}</p>}
    </div>
  )
}
