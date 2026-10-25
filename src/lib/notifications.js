// In-app notifications (the bell) and the open-workout mirror the server uses for
// "your workout is still open". Rows are written by the database (supabase/011_notifications.sql).
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'

export async function fetchNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, url, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function markAllRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

// Unread count, kept live: realtime inserts, plus a refetch whenever the app comes back to the front
export function useUnreadCount(signedIn) {
  const [count, setCount] = useState(0)
  const refresh = useCallback(() => {
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      .then(({ count: n }) => setCount(n ?? 0), () => {})
  }, [])

  useEffect(() => {
    if (!signedIn) { setCount(0); return }
    refresh()
    let channel = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase.channel(`notifications-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => setCount(c => c + 1))
        .subscribe()
    })
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [signedIn, refresh])

  return [count, setCount, refresh]
}

// ── Open workout mirror ─────────────────────────────────────────────────────

let lastSync = 0
let lastSets = -1

// Called with the saved workout state (athrion_workout). Writes when a set is logged,
// or at most once a minute otherwise; never throws.
export function syncOpenWorkout(state) {
  if (!state?.startTime) return
  const sets = state.loggedSets?.length ?? 0
  const now = Date.now()
  if (sets === lastSets && now - lastSync < 60000) return
  lastSync = now; lastSets = sets
  const names = state.exerciseNames ?? []
  const done = new Set((state.loggedSets ?? []).map(s => s.ex)).size
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return
    return supabase.from('open_workouts').upsert({
      user_id: user.id,
      name: state.name || 'Workout',
      sets_done: sets,
      exercises_done: done,
      exercises_total: names.length,
      last_activity_at: new Date(now).toISOString(),
      notified_at: null,
    }, { onConflict: 'user_id' })
  }).catch(() => {})
}

export function clearOpenWorkout() {
  lastSync = 0; lastSets = -1
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (user) return supabase.from('open_workouts').delete().eq('user_id', user.id)
  }).catch(() => {})
}
