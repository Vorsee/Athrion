import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Bans from the moderation screen (047). A ban also locks the login, which only the service key
// can do. The caller must be in app_admins.
//   { action: 'ban', report_id }  → admin_resolve_report(…, 'ban') and the login banned
//   { action: 'unban', user_id }  → off the ban list, the login unlocked
// Dismiss, warn and remove are plain database calls from the app (admin_resolve_report).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return json({ error: 'Invalid token' }, 401)
  const { data: isAdmin } = await admin.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return json({ error: 'Admins only' }, 403)

  const body = await req.json().catch(() => ({}))
  try {
    if (body.action === 'ban') {
      if (typeof body.report_id !== 'string') return json({ error: 'report_id needed' }, 400)
      const { data: report } = await admin.from('user_reports').select('reported').eq('id', body.report_id).maybeSingle()
      if (!report) return json({ error: 'Report not found' }, 404)
      if (report.reported === user.id) return json({ error: "You can't ban yourself" }, 400)
      const { error } = await admin.rpc('admin_resolve_report', { p_id: body.report_id, p_action: 'ban' })
      if (error) throw error
      const { error: banErr } = await admin.auth.admin.updateUserById(report.reported, { ban_duration: '876000h' })
      if (banErr) throw banErr
      return json({ ok: true, banned: report.reported })
    }
    if (body.action === 'unban') {
      if (typeof body.user_id !== 'string') return json({ error: 'user_id needed' }, 400)
      const { error } = await admin.rpc('admin_unban', { p_user: body.user_id })
      if (error) throw error
      const { error: banErr } = await admin.auth.admin.updateUserById(body.user_id, { ban_duration: 'none' })
      if (banErr) throw banErr
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Something went wrong' }, 500)
  }
})
