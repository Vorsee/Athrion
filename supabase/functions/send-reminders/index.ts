import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import { localParts, chooseMessage, buildRecap, openWorkoutMessage, pushAllowed } from "./reminders.ts"

// Called by pg_cron and database triggers, always with the cron secret:
//   {}               hourly (005): each user's daily reminder at their hour, and the Sunday recap
//   { open: true }   every 15 min (011): "your workout is still open"
//   { deliver: id }  a new row in notifications (011) that should also be pushed
// Plus { test: true } from the app, for the signed-in user's own devices.

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const DAY = 86400000

async function loadContext(userId: string) {
  const [{ data: plan }, { data: logs }, { data: summary }] = await Promise.all([
    admin.from('fitness_plans').select('plan_data').eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('workout_logs').select('created_at, name, volume, sets').eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 100 * DAY).toISOString()),
    admin.rpc('points_summary', { p_user: userId }),
  ])
  const sorted = [...(logs ?? [])].sort((a: any, b: any) => a.created_at < b.created_at ? 1 : -1)
  return { plan: plan?.plan_data, logs: sorted, summary: Array.isArray(summary) ? summary[0] : summary }
}

// Push one message to every device of a user; drops subscriptions the browser has ended
async function pushTo(userId: string, message: any, ttl: number) {
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  let delivered = false, removed = 0
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ url: '/', ...message }),
        { TTL: ttl },
      )
      delivered = true
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
        removed++
      } else {
        console.error('push failed', userId, e.statusCode, e.body ?? e.message)
      }
    }
  }
  return { delivered, removed }
}

const prefsFor = async (userId: string) =>
  (await admin.from('reminder_settings').select('*').eq('user_id', userId).maybeSingle()).data

// A notification row the database asked us to push (friend requests, month results, recaps)
async function deliver(id: string) {
  const { data: n } = await admin.from('notifications').select('*').eq('id', id).maybeSingle()
  if (!n || !n.push || n.pushed_at) return Response.json({ sent: 0 })
  if (!pushAllowed(n.kind, await prefsFor(n.user_id))) return Response.json({ sent: 0, muted: true })
  const { delivered, removed } = await pushTo(n.user_id, { title: n.title, body: n.body, tag: n.kind, url: n.url }, 24 * 3600)
  await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id)
  return Response.json({ sent: delivered ? 1 : 0, removed })
}

// Workouts left open 45 minutes to 6 hours ago, one push each; day-old rows are cleared
async function openWorkouts() {
  const now = Date.now()
  const { data: rows } = await admin.from('open_workouts').select('*')
    .is('notified_at', null)
    .lt('last_activity_at', new Date(now - 45 * 60000).toISOString())
    .gt('last_activity_at', new Date(now - 6 * 3600000).toISOString())
  let sent = 0
  for (const row of rows ?? []) {
    if (pushAllowed('open-workout', await prefsFor(row.user_id))) {
      const { delivered } = await pushTo(row.user_id, openWorkoutMessage(row), 3 * 3600)
      if (delivered) sent++
    }
    await admin.from('open_workouts').update({ notified_at: new Date().toISOString() }).eq('user_id', row.user_id)
  }
  await admin.from('open_workouts').delete().lt('last_activity_at', new Date(now - DAY).toISOString())
  return Response.json({ sent })
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// "Send test notification" from the app: pushes to the signed-in user's own devices only
async function sendTestPush(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401, headers: cors })

  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id)
  if (!subs?.length) {
    return Response.json({ error: 'This account has no device with reminders turned on.' }, { status: 404, headers: cors })
  }
  const message = { title: 'Test notification', body: 'Notifications are working on this device.', tag: 'test', url: '/' }
  let sent = 0, removed = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 600 })
      sent++
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
        removed++
      } else {
        console.error('test push failed', user.id, e.statusCode, e.body ?? e.message)
      }
    }
  }
  if (!sent) return Response.json({ error: 'The push service rejected every device. Turn reminders off and on again.', removed }, { status: 502, headers: cors })
  return Response.json({ sent, removed }, { headers: cors })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => ({}))
  if (body.test === true) return sendTestPush(req)

  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (body.deliver) return deliver(String(body.deliver))
  if (body.open === true) return openWorkouts()

  // Verifies push encryption works in this runtime without contacting a push service
  if (body.selfTest) {
    const { publicKey } = webpush.generateVAPIDKeys()
    const details = webpush.generateRequestDetails(
      { endpoint: 'https://example.invalid/push', keys: { p256dh: publicKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } },
      JSON.stringify({ title: 'test' }),
    )
    return Response.json({ ok: true, encryptedBytes: details.body.length })
  }

  const { data: settingsRows, error } = await admin.from('reminder_settings').select('*').eq('enabled', true)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let sent = 0, skipped = 0, removed = 0
  for (const s of settingsRows ?? []) {
    let local
    try { local = localParts(s.timezone) } catch { local = localParts('UTC') }
    if (local.hour !== s.reminder_hour || s.last_sent_date === local.date) { skipped++; continue }

    const ctx = await loadContext(s.user_id)

    // Sunday: a week that had training gets a recap (into the inbox; the trigger pushes it)
    if (local.weekday === 'Sunday' && s.notify_recap !== false && s.last_recap_date !== local.date) {
      const { data: prof } = await admin.from('user_profiles').select('weight_unit').eq('user_id', s.user_id).maybeSingle()
      const recap = buildRecap(ctx.logs, s, local, prof?.weight_unit || 'lb', ctx.summary)
      if (recap) {
        await admin.from('notifications').insert({ user_id: s.user_id, kind: 'recap', ...recap, url: '/?open=progress' })
        await admin.from('reminder_settings').update({ last_recap_date: local.date, last_sent_date: local.date }).eq('user_id', s.user_id)
        sent++
        continue
      }
    }

    const message = chooseMessage(ctx.plan, ctx.logs.map((l: any) => l.created_at), s, local, new Date(),
      { last: ctx.logs[0], month: ctx.summary })
    if (!message) { skipped++; continue }

    const { delivered, removed: gone } = await pushTo(s.user_id, message, 4 * 3600)
    removed += gone
    if (delivered) {
      sent++
      await admin.from('reminder_settings').update({ last_sent_date: local.date }).eq('user_id', s.user_id)
    }
  }

  return Response.json({ sent, skipped, removed })
})
