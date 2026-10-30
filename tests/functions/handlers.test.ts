// The Edge Function request handlers, run in Node with Deno stubbed out
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'
import { anthropic, webpush, installDeno } from '../helpers/denoStubs.js'
import { makeFallbackPlan } from '../../supabase/functions/generate-fitness-plan/plan.ts'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => sb.supabase) }))

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'sk', CRON_SECRET: 'cron-123', VAPID_SUBJECT: 'mailto:a@b.c', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }
async function load(fn: string) {
  vi.resetModules()
  const deno = installDeno(ENV)
  await import(`../../supabase/functions/${fn}/index.ts`)
  return deno.handler as (req: Request) => Promise<Response>
}
const post = (body: any, headers: Record<string, string> = {}) =>
  new Request('https://fn', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

const fp = { primaryGoal: 'improve_strength', workoutDaysPerWeek: 3, workoutLocation: 'gym' }
const nt = { calorieTarget: 2600, proteinGrams: 170, carbGrams: 300, fatGrams: 80 }

beforeEach(() => { sb.reset(); anthropic.result = null; anthropic.calls.length = 0; vi.clearAllMocks() })

describe('generate-fitness-plan', () => {
  const auth = { Authorization: 'Bearer user-jwt' }
  // claimed: whether the per-user rate-limit lock is free
  function db({ active = null, claimed = true, status = 'pro' }: any = {}) {
    sb.set('subscriptions', { data: { status }, error: null })
    sb.set('fitness_profiles', (q: any) => q.ops.some((o: any) => o[0] === 'update')
      ? { data: claimed ? [{ user_id: 'user-1' }] : [], error: null }
      : { data: { user_id: 'user-1' }, error: null })
    sb.set('fitness_plans', (q: any) => {
      if (q.ops.some((o: any) => o[0] === 'insert')) return { data: { id: 'new', plan_data: sb.op(q, 'insert')[0].plan_data, ai_model: sb.op(q, 'insert')[0].ai_model }, error: null }
      if (q.ops.some((o: any) => o[0] === 'update')) return { data: null, error: null }
      if (q.ops.some((o: any) => o[0] === 'eq' && o[1] === 'status')) return { data: active, error: null }
      return { data: null, error: null }
    })
  }

  it('answers CORS preflight', async () => {
    const h = await load('generate-fitness-plan')
    expect((await h(new Request('https://fn', { method: 'OPTIONS' }))).status).toBe(200)
  })
  it('rejects missing auth, bad JSON, missing fields and invalid tokens', async () => {
    const h = await load('generate-fitness-plan')
    expect((await h(post({ fitnessProfile: fp, nutritionTargets: nt }))).status).toBe(401)
    expect((await h(post('{bad', auth))).status).toBe(400)
    expect((await h(post({ fitnessProfile: fp }, auth))).status).toBe(400)
    sb.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } })
    expect((await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).status).toBe(401)
  })
  it('refuses free users without calling Claude', async () => {
    db({ status: 'free' })
    const h = await load('generate-fitness-plan')
    const res = await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))
    expect(res.status).toBe(403)
    expect(anthropic.calls).toHaveLength(0)
  })
  it('rate-limits with an atomic per-user lock (one plan a minute)', async () => {
    db({ claimed: false })
    const h = await load('generate-fitness-plan')
    expect((await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).status).toBe(429)
    expect(anthropic.calls).toHaveLength(0)
    const claim = sb.queriesFor('fitness_profiles').find((q: any) => sb.op(q, 'update'))
    expect(sb.op(claim, 'or')[0]).toMatch(/^plan_requested_at\.is\.null,plan_requested_at\.lt\./)
  })
  it('lets a user without a profile row generate their first plan', async () => {
    db({ claimed: false })
    sb.set('fitness_profiles', (q: any) => ({ data: q.ops.some((o: any) => o[0] === 'update') ? [] : null, error: null }))
    anthropic.result = { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(makeFallbackPlan(fp, nt)) }] }
    const h = await load('generate-fitness-plan')
    expect((await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).status).toBe(200)
  })
  it('saves a valid Claude plan with the calculator nutrition, archiving the old one', async () => {
    db()
    const plan = makeFallbackPlan(fp, nt); plan.nutrition.dailyCalories = 9999
    anthropic.result = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here you go:\n' + JSON.stringify(plan) + '\nEnjoy' }] }
    const h = await load('generate-fitness-plan')
    const body = await (await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).json()
    expect(body.plan.plan_data.nutrition.dailyCalories).toBe(2600)
    expect(body.plan.plan_data.week).toBe(1)
    expect(body.plan.ai_model).toBe('claude-opus-5-5')
    expect(sb.queriesFor('fitness_plans').some((q: any) => sb.op(q, 'update')?.[0]?.status === 'archived')).toBe(true)
    expect(anthropic.calls[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' })
  })
  it('retries once, then saves the fallback plan with the errors recorded', async () => {
    db()
    anthropic.result = { stop_reason: 'max_tokens', content: [] }
    const h = await load('generate-fitness-plan')
    const body = await (await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).json()
    expect(anthropic.calls).toHaveLength(2)
    expect(body.plan.ai_model).toBe('fallback_v2')
    expect(body.plan.plan_data.generationErrors).toEqual(['attempt 1: Claude response was truncated', 'attempt 2: Claude response was truncated'])
  })
  it('adapt mode bumps the week number and sends recent progress', async () => {
    db({ active: { training_days_per_week: 3, plan_data: { week: 2, weeklySchedule: [] } } })
    for (const t of ['progress_checkins', 'workout_logs', 'daily_health', 'body_measurements']) sb.set(t, { data: [], error: null })
    anthropic.result = { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(makeFallbackPlan(fp, nt)) }] }
    const h = await load('generate-fitness-plan')
    const body = await (await h(post({ fitnessProfile: fp, nutritionTargets: nt, mode: 'adapt' }, auth))).json()
    expect(body.plan.plan_data.week).toBe(3)
    expect(JSON.parse(anthropic.calls[0].messages[0].content).recentProgress.previousPlan.week).toBe(2)
  })
})

describe('send-reminders', () => {
  it('requires the cron secret', async () => {
    const h = await load('send-reminders')
    expect((await h(post({}))).status).toBe(401)
    expect((await h(post({}, { 'x-cron-secret': 'wrong' }))).status).toBe(401)
  })
  it('passes the push self-test', async () => {
    const h = await load('send-reminders')
    expect(await (await h(post({ selfTest: true }, { 'x-cron-secret': 'cron-123' }))).json()).toEqual({ ok: true, encryptedBytes: 120 })
  })
  it('sends due reminders, removes expired subscriptions and records the send', async () => {
    const hourNow = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date())
    sb.set('reminder_settings', (q: any) => q.ops.some((o: any) => o[0] === 'update') ? { data: null, error: null } : { data: [
      { user_id: 'u1', timezone: 'UTC', reminder_hour: hourNow, last_sent_date: null, streak_warnings: true },
      { user_id: 'u2', timezone: 'UTC', reminder_hour: (hourNow + 1) % 24 },
    ], error: null })
    sb.set('fitness_plans', { data: { plan_data: { weeklySchedule: [{ day: weekday, type: 'workout', title: 'Legs', workout: { exercises: [{}] } }] } }, error: null })
    sb.set('workout_logs', { data: [], error: null })
    sb.set('push_subscriptions', (q: any) => q.ops.some((o: any) => o[0] === 'delete') ? { data: null, error: null } : { data: [
      { id: 1, endpoint: 'https://push/ok', p256dh: 'p', auth: 'a' }, { id: 2, endpoint: 'https://push/gone', p256dh: 'p', auth: 'a' },
    ], error: null })
    webpush.sendNotification.mockImplementation(async (sub: any) => { if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 }) })
    const h = await load('send-reminders')
    expect(await (await h(post({}, { 'x-cron-secret': 'cron-123' }))).json()).toEqual({ sent: 1, skipped: 1, removed: 1 })
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: 'Time to train', url: '/' })
  })
})

describe('send-reminders from the database', () => {
  const cron = { 'x-cron-secret': 'cron-123' }
  const subs = { data: [{ id: 1, endpoint: 'https://push/ok', p256dh: 'p', auth: 'a' }], error: null }
  it('pushes a new notification once, unless its type is switched off', async () => {
    sb.set('notifications', (q: any) => q.ops.some((o: any) => o[0] === 'update') ? { data: null, error: null }
      : { data: { id: 'n1', user_id: 'u1', kind: 'friend_request', title: 'New friend request', body: '@alex wants to be friends.', url: '/?open=friends', push: true, pushed_at: null }, error: null })
    sb.set('reminder_settings', { data: null, error: null })
    sb.set('push_subscriptions', subs)
    const h = await load('send-reminders')
    expect(await (await h(post({ deliver: 'n1' }, cron))).json()).toEqual({ sent: 1, removed: 0 })
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: 'New friend request', url: '/?open=friends' })
    expect(sb.queriesFor('notifications').some((q: any) => sb.op(q, 'update')?.[0]?.pushed_at)).toBe(true)

    webpush.sendNotification.mockClear()
    sb.set('reminder_settings', { data: { notify_friends: false }, error: null })
    expect(await (await h(post({ deliver: 'n1' }, cron))).json()).toEqual({ sent: 0, muted: true })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
  it('reminds about a workout left open and marks it so it is sent once', async () => {
    sb.set('open_workouts', (q: any) => q.ops.some((o: any) => o[0] === 'update' || o[0] === 'delete') ? { data: null, error: null }
      : { data: [{ user_id: 'u1', name: 'Leg day', exercises_done: 2, exercises_total: 5, sets_done: 6 }], error: null })
    sb.set('reminder_settings', { data: null, error: null })
    sb.set('push_subscriptions', subs)
    const h = await load('send-reminders')
    expect(await (await h(post({ open: true }, cron))).json()).toEqual({ sent: 1 })
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: 'Leg day is still open', url: '/?open=workout' })
    expect(sb.queriesFor('open_workouts').some((q: any) => sb.op(q, 'update')?.[0]?.notified_at)).toBe(true)
  })
})

describe('send-reminders test notification', () => {
  const auth = { Authorization: 'Bearer user-jwt' }
  it('needs a signed-in user', async () => {
    const h = await load('send-reminders')
    expect((await h(post({ test: true }))).status).toBe(401)
    sb.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await h(post({ test: true }, auth))).status).toBe(401)
  })
  it('explains when no device is subscribed', async () => {
    sb.set('push_subscriptions', { data: [], error: null })
    const h = await load('send-reminders')
    const res = await h(post({ test: true }, auth))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/no device/)
  })
  it('pushes only to the caller\'s own devices', async () => {
    sb.set('push_subscriptions', (q: any) => q.ops.some((o: any) => o[0] === 'delete') ? { data: null, error: null } : { data: [{ id: 1, endpoint: 'https://push/me', p256dh: 'p', auth: 'a' }], error: null })
    webpush.sendNotification.mockResolvedValue({})
    const h = await load('send-reminders')
    expect(await (await h(post({ test: true }, auth))).json()).toEqual({ sent: 1, removed: 0 })
    const q = sb.queriesFor('push_subscriptions')[0]
    expect(sb.op(q, 'eq')).toEqual(['user_id', 'user-1'])
    expect(JSON.parse(webpush.sendNotification.mock.calls.at(-1)[1])).toMatchObject({ title: 'Test notification', tag: 'test' })
  })
})

describe('analyze-meal', () => {
  const auth = { Authorization: 'Bearer user-jwt' }
  const photo = { base64: 'aGk=', mediaType: 'image/png' }
  function proUser(status = 'pro') { sb.set('subscriptions', { data: { status }, error: null }) }

  it('forwards a Pro user\'s photo to Claude and returns its answer', async () => {
    proUser()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }] })))
    vi.stubGlobal('fetch', fetchMock)
    const h = await load('analyze-meal')
    const res = await h(post(photo, auth))
    vi.unstubAllGlobals()
    expect(res.status).toBe(200)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[0].source.media_type).toBe('image/png')
  })
  it('gives a free account one scan a day, and gives it back when the scan fails', async () => {
    proUser('free')
    const h = await load('analyze-meal')
    const rpc = sb.supabase.rpc as any
    // Today's scan is free: claimed, then the photo goes to Claude
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'claim_meal_scan' ? true : null, error: null }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [] }))))
    expect((await h(post(photo, auth))).status).toBe(200)
    // Used: 429 with a code the app turns into a Get Pro offer
    rpc.mockImplementation(async () => ({ data: false, error: null }))
    const used = await h(post(photo, auth))
    expect(used.status).toBe(429)
    expect((await used.json()).error.code).toBe('daily_limit')
    // The AI call fails: the scan is handed back
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'claim_meal_scan' ? true : null, error: null }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect((await h(post(photo, auth))).status).toBe(502)
    expect(rpc).toHaveBeenCalledWith('release_meal_scan')
    // Before 026 (no claim function): Pro-only, as before
    rpc.mockImplementation(async () => ({ data: null, error: { message: 'missing' } }))
    expect((await h(post(photo, auth))).status).toBe(403)
    vi.unstubAllGlobals()
  })
  it('requires a supported image type and a size under 5 MB', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const h = await load('analyze-meal')
    proUser()
    expect((await h(post({ base64: 'aGk=', mediaType: 'application/pdf' }, auth))).status).toBe(400)
    expect((await h(post({ base64: 'a'.repeat(7_000_001), mediaType: 'image/jpeg' }, auth))).status).toBe(413)
    expect((await h(post({ mediaType: 'image/jpeg' }, auth))).status).toBe(400)
    vi.unstubAllGlobals()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('regression: fixed in the October 2026 review', () => {
    it('rejects callers who are not signed in', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const h = await load('analyze-meal')
      expect((await h(post(photo))).status).toBe(401)
      // The public anon key is a valid JWT but not a user
      sb.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'no user' } })
      expect((await h(post(photo, { Authorization: 'Bearer anon' }))).status).toBe(401)
      vi.unstubAllGlobals()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
