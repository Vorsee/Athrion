import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CODE = /^[A-Z0-9]{6}$/
const QUIET_MS = 12 * 3600 * 1000 // rooms end after 12 quiet hours (034)

// The public preview behind a shared room link (athrion.app/r/<code>), for someone who isn't
// signed in yet: who invited them, the workout and how many are in. Never ids, emails or sets.
//   GET ?code=K7M4QX → { host, title, people, live }   404 when there's no open room
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }
  const code = String(req.query?.code ?? '').trim().toUpperCase()
  if (!CODE.test(code)) return res.status(400).json({ error: 'Bad code' })

  const { data: room, error } = await supabase.from('group_sessions')
    .select('id, host_id, status, plan, exercises, created_at, last_activity_at')
    .eq('code', code).in('status', ['lobby', 'active']).maybeSingle()
  if (error) return res.status(500).json({ error: 'Could not load' })
  const last = room && new Date(room.last_activity_at || room.created_at).getTime()
  if (!room || Date.now() - last > QUIET_MS) return res.status(404).json({ error: 'Not found' })

  const { data: people } = await supabase.from('group_participants').select('user_id, display_name').eq('session_id', room.id)
  const host = (people ?? []).find(p => p.user_id === room.host_id)?.display_name ?? null

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    host,
    title: roomTitle(room),
    people: people?.length ?? 0,
    live: room.status === 'active',
  })
}

// "Squat, Bench Press +2" or "Free workout": the same names the room shows
export function roomTitle(room) {
  const plan = Array.isArray(room.plan) ? room.plan : []
  if (plan[0]?.free) return 'Free workout'
  const names = (plan.length ? plan.map(e => e?.name) : room.exercises ?? []).filter(Boolean)
  if (!names.length) return null
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
}
