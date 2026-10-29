import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { EmptyState, SkeletonRows, InlineError } from './ui/index.js'
import { fetchNotifications, markAllRead } from '../lib/notifications.js'

const KIND_ICON = {
  friend_request: 'mdi:account-plus-outline',
  friend_accepted: 'mdi:account-check-outline',
  month_result: 'mdi:trophy-outline',
  badge: 'mdi:medal-outline',
  target: 'mdi:calendar-star',
  recap: 'mdi:chart-box-outline',
  coach: 'mdi:whistle-outline',
  sale: 'mdi:cash',
  coach_application: 'mdi:account-clock-outline',
  team_created: 'mdi:swim',
  team_request: 'mdi:account-plus-outline',
  team_joined: 'mdi:account-group-outline',
  team_accepted: 'mdi:account-check-outline',
  team_declined: 'mdi:account-remove-outline',
  team_removed: 'mdi:account-remove-outline',
  team_left: 'mdi:account-arrow-right-outline',
}

export function timeAgo(iso, now = Date.now()) {
  const mins = Math.floor((now - Date.parse(iso)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// The bell's list. Opening it marks everything read; tapping one goes where it points.
export default function NotificationsSheet({ onClose, onGo, onRead }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)

  function load() {
    setError(false)
    fetchNotifications()
      .then(list => {
        setItems(list)
        if (list.some(n => !n.read_at)) markAllRead().then(onRead, () => {})
      })
      .catch(() => setError(true))
  }
  useEffect(load, [])

  return (
    <Sheet title="Notifications" onClose={onClose} bodyClassName="space-y-1.5">
      {error && <InlineError onRetry={load}>Could not load notifications.</InlineError>}
      {!items && !error && <SkeletonRows rows={4} label="Loading notifications" />}
      {items?.length === 0 && (
        <EmptyState icon="mdi:bell-outline" title="Nothing yet">
          Friend requests, badges, month results and your weekly recap show up here.
        </EmptyState>
      )}
      {items?.map(n => (
        <button key={n.id} type="button" onClick={() => onGo(n.url)}
          className={`press w-full flex items-start gap-3 rounded-xl px-3 py-3 text-left border transition-colors ${
            n.read_at ? 'bg-raised border-transparent' : 'bg-neon-tint border-neon-stroke/30'}`}>
          <Icon icon={KIND_ICON[n.kind] || 'mdi:bell-outline'} width={22} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink leading-snug">{n.title}</div>
            {n.body && <div className="text-xs text-ink-2 mt-0.5">{n.body}</div>}
            <div className="text-xs text-muted mt-1">{timeAgo(n.created_at)}</div>
          </div>
          {!n.read_at && <span className="w-2 h-2 rounded-full bg-neon mt-2 flex-shrink-0" aria-label="New" />}
        </button>
      ))}
    </Sheet>
  )
}
