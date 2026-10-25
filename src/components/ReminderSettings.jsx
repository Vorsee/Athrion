import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { fetchReminderSettings, saveReminderSettings } from '../lib/progressApi.js'
import { pushSupported, needsHomeScreenInstall, currentSubscription, enablePush, disablePush, sendTestPush } from '../lib/push.js'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5) // 5am – 10pm
const fmtHour = h => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })

// Push switches per type (supabase/011_notifications.sql); the in-app bell always lists them
const TYPES = [
  ['notify_friends', 'Friend requests and accepts'],
  ['notify_workout_open', 'A workout left open'],
  ['notify_achievements', 'Medals and month results'],
  ['notify_recap', 'Sunday recap of your week'],
]
const DEFAULTS = { enabled: false, reminder_hour: 18, streak_warnings: true, ...Object.fromEntries(TYPES.map(([k]) => [k, true])) }

export function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'bg-neon' : 'bg-line-strong'}`}>
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
        setSettings({ ...DEFAULTS, ...(s ?? {}) })
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
      ...Object.fromEntries(TYPES.map(([k]) => [k, next[k]])),
    }).catch(e => setMsg(e.message))
  }

  async function toggle(on) {
    setBusy(true); setMsg('')
    try {
      if (on) { await enablePush(); setSubscribed(true) }
      else { await disablePush(); setSubscribed(false) }
      await update({ enabled: on })
      if (on) setMsg(`You'll get a reminder around ${fmtHour(settings.reminder_hour)} when it's time to train.`)
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
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon icon="mdi:bell-ring-outline" width={20} className="text-neon-ink flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-ink">Notifications</div>
            <div className="text-xs text-muted">Reminders, friends, open workouts and your weekly recap</div>
          </div>
        </div>
        <Toggle on={active} onChange={toggle} label="Notifications" />
      </div>

      {!pushSupported() && <p className="text-xs text-muted">This browser doesn't support notifications.</p>}
      {pushSupported() && needsHomeScreenInstall() && (
        <p className="text-xs text-muted">On iPhone, add ATHRION to your Home Screen first (Share, then Add to Home Screen), then turn reminders on from there.</p>
      )}

      {active && (
        <div className="space-y-3 pt-1">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">Remind me at</span>
            <select value={settings.reminder_hour} onChange={e => update({ reminder_hour: Number(e.target.value) })}
              className="bg-raised border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none">
              {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">Warn me before I lose my streak</span>
            <Toggle on={settings.streak_warnings} onChange={v => update({ streak_warnings: v })} label="Streak warnings" />
          </div>
          {TYPES.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{label}</span>
              <Toggle on={settings[key] !== false} onChange={v => update({ [key]: v })} label={label} />
            </div>
          ))}
          <button onClick={sendTest} disabled={busy}
            className="w-full py-2 rounded-xl border border-line-strong text-xs font-semibold text-ink-2 hover:text-neon-ink hover:border-neon-stroke/40 disabled:opacity-50 transition-colors">
            Send test notification
          </button>
        </div>
      )}
      {busy && <p className="text-xs text-muted">Working...</p>}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
