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
  function db({ recent = null, active = null }: any = {}) {
    sb.set('fitness_plans', (q: any) => {
      if (q.ops.some((o: any) => o[0] === 'insert')) return { data: { id: 'new', plan_data: sb.op(q, 'insert')[0].plan_data, ai_model: sb.op(q, 'insert')[0].ai_model }, error: null }
      if (q.ops.some((o: any) => o[0] === 'update')) return { data: null, error: null }
      if (q.ops.some((o: any) => o[0] === 'eq' && o[1] === 'status')) return { data: active, error: null }
      return { data: recent, error: null }
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
  it('rate-limits to one plan per 30 seconds', async () => {
    db({ recent: { created_at: new Date().toISOString() } })
    const h = await load('generate-fitness-plan')
    expect((await h(post({ fitnessProfile: fp, nutritionTargets: nt }, auth))).status).toBe(429)
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
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: 'Time to train 💪', url: '/' })
  })
})

describe('analyze-meal', () => {
  it('forwards the photo to Claude and returns its answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }] })))
    vi.stubGlobal('fetch', fetchMock)
    const h = await load('analyze-meal')
    const res = await h(post({ base64: 'aGk=', mediaType: 'image/png' }, { Authorization: 'Bearer user-jwt' }))
    expect(res.status).toBe(200)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[0].source.media_type).toBe('image/png')
    vi.unstubAllGlobals()
  })

  describe('known bugs (security)', () => {
    // No user check, no Pro check, no size limit: the public anon key is enough to spend
    // the Anthropic budget. Confirmed against the live function.
    it.fails('BUG: rejects callers who are not signed in', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
      const h = await load('analyze-meal')
      const res = await h(post({ base64: 'aGk=', mediaType: 'image/png' }, { Authorization: 'Bearer anon' }))
      vi.unstubAllGlobals()
      expect(res.status).toBe(401)
    })
  })
})
