import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import { localParts, chooseMessage } from "./reminders.ts"

// Runs hourly from pg_cron (see supabase/005_reminder_cron.sql). Sends each user at most
// one reminder a day, at their chosen local hour, and only when there's a reason to.

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const DAY = 86400000

async function buildMessage(userId: string, settings: any, local: ReturnType<typeof localParts>) {
  const [{ data: plan }, { data: logs }] = await Promise.all([
    admin.from('fitness_plans').select('plan_data').eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('workout_logs').select('created_at').eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 100 * DAY).toISOString()),
  ])
  return chooseMessage(plan?.plan_data, (logs ?? []).map((l: any) => l.created_at), settings, local)
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
  const message = { title: 'Test notification ✅', body: 'Workout reminders are working on this device.', tag: 'test', url: '/' }
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

    const message = await buildMessage(s.user_id, s, local)
    if (!message) { skipped++; continue }

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', s.user_id)
    let delivered = false
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...message, url: '/' }),
          { TTL: 4 * 3600 },
        )
        delivered = true
      } catch (e: any) {
        // The browser unsubscribed or the subscription expired
        if (e.statusCode === 404 || e.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
          removed++
        } else {
          console.error('push failed', s.user_id, e.statusCode, e.body ?? e.message)
        }
      }
    }
    if (delivered) {
      sent++
      await admin.from('reminder_settings').update({ last_sent_date: local.date }).eq('user_id', s.user_id)
    }
  }

  return Response.json({ sent, skipped, removed })
})
