import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = ''
  for await (const chunk of req) raw += chunk
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

// Bans need the login locked too, which only the service key can do. An admin's token:
//   { action: 'ban', report_id }  → admin_resolve_report(…, 'ban') and the login banned
//   { action: 'unban', user_id }  → off the ban list, the login unlocked
// Dismiss, warn and remove are plain database calls from the app (admin_resolve_report).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: admin } = await supabase.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!admin) return res.status(403).json({ error: 'Admins only' })

  const body = await readBody(req)
  try {
    if (body.action === 'ban') {
      if (typeof body.report_id !== 'string') return res.status(400).json({ error: 'report_id needed' })
      const { data: report } = await supabase.from('user_reports').select('reported').eq('id', body.report_id).maybeSingle()
      if (!report) return res.status(404).json({ error: 'Report not found' })
      if (report.reported === user.id) return res.status(400).json({ error: 'You can\'t ban yourself' })
      const { error } = await supabase.rpc('admin_resolve_report', { p_id: body.report_id, p_action: 'ban' })
      if (error) throw error
      const { error: banErr } = await supabase.auth.admin.updateUserById(report.reported, { ban_duration: '876000h' })
      if (banErr) throw banErr
      return res.status(200).json({ ok: true, banned: report.reported })
    }
    if (body.action === 'unban') {
      if (typeof body.user_id !== 'string') return res.status(400).json({ error: 'user_id needed' })
      const { error } = await supabase.rpc('admin_unban', { p_user: body.user_id })
      if (error) throw error
      const { error: banErr } = await supabase.auth.admin.updateUserById(body.user_id, { ban_duration: 'none' })
      if (banErr) throw banErr
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
