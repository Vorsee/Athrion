// Browser and device integrations: Stripe checkout, web push, Apple Health / Health Connect
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))

const native = { value: false, platform: 'ios' }
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value, getPlatform: () => native.platform } }))
const Health = {
  isAvailable: vi.fn(), requestAuthorization: vi.fn(), checkAuthorization: vi.fn(),
  queryAggregated: vi.fn(), readSamples: vi.fn(),
}
vi.mock('@capgo/capacitor-health', () => ({ Health }))

import { createCheckoutSession, cancelSubscription } from '../../src/lib/stripe.js'
import { syncHealthData, healthSyncAvailable } from '../../src/lib/health.js'

beforeEach(() => { sb.reset(); vi.unstubAllGlobals(); native.value = false })

describe('stripe.js', () => {
  it('creates a checkout session and redirects', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/x' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const loc = { href: '' }
    vi.stubGlobal('location', loc)
    Object.defineProperty(window, 'location', { value: loc, configurable: true })
    await createCheckoutSession()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ user_id: 'user-1', price_id: 'price_test' })
    expect(loc.href).toBe('https://checkout.stripe.com/x')
  })
  it('requires a signed-in user', async () => {
    sb.state.user = null
    await expect(createCheckoutSession()).rejects.toThrow('Not logged in')
    await expect(cancelSubscription()).rejects.toThrow('Not logged in')
  })
  it('cancels with the user token and surfaces server errors', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'No active subscription found' }) }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(cancelSubscription()).rejects.toThrow('No active subscription found')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-token')
  })
})

describe('push.js', () => {
  async function loadPush({ permission = 'granted', existing = null } = {}) {
    vi.resetModules()
    const sub = { endpoint: 'https://push/1', toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn() }
    const pushManager = { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => sub) }
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true })
    vi.stubGlobal('PushManager', function () {})
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => permission) })
    return { mod: await import('../../src/lib/push.js'), pushManager, sub }
  }
  it('subscribes with the VAPID key and saves the subscription', async () => {
    sb.set('push_subscriptions', { data: null, error: null })
    const { mod, pushManager } = await loadPush()
    expect(mod.pushSupported()).toBe(true)
    await mod.enablePush()
    const key = pushManager.subscribe.mock.calls[0][0].applicationServerKey
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key).toHaveLength(65) // uncompressed P-256 public key
    expect(sb.queriesFor('push_subscriptions')).toHaveLength(1)
  })
  it('explains blocked notifications', async () => {
    const { mod } = await loadPush({ permission: 'denied' })
    await expect(mod.enablePush()).rejects.toThrow('Notifications are blocked')
  })
  it('unsubscribes and deletes the saved endpoint', async () => {
    sb.set('push_subscriptions', { data: null, error: null })
    const existing = { endpoint: 'https://push/1', unsubscribe: vi.fn() }
    const { mod } = await loadPush({ existing })
    await mod.disablePush()
    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(sb.op(sb.queriesFor('push_subscriptions')[0], 'eq')).toEqual(['endpoint', 'https://push/1'])
  })
  it('detects iOS Safari outside the home screen', async () => {
    const { mod } = await loadPush()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    window.matchMedia = vi.fn(() => ({ matches: false }))
    expect(mod.needsHomeScreenInstall()).toBe(true)
  })
})

describe('health.js', () => {
  it('is unavailable in the browser', async () => {
    expect(healthSyncAvailable()).toBe(false)
    await expect(syncHealthData()).rejects.toThrow('only available in the ATHRION mobile app')
  })
  it('reads steps, calories, heart rate and sleep into one row per day', async () => {
    native.value = true
    sb.set('daily_health', { data: null, error: null })
    Health.isAvailable.mockResolvedValue({ available: true })
    Health.requestAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'calories', 'restingHeartRate', 'sleep'] })
    Health.queryAggregated.mockImplementation(async ({ dataType }) => ({
      samples: [{ startDate: '2026-10-22T04:00:00.000Z', value: { steps: 8000.4, calories: 450.6, restingHeartRate: 58.2 }[dataType] }],
    }))
    Health.readSamples.mockResolvedValue({ samples: [
      { startDate: '2026-10-22T03:00:00Z', endDate: '2026-10-22T11:00:00Z', stages: [{ stage: 'deep', durationMinutes: 120 }, { stage: 'awake', durationMinutes: 30 }, { stage: 'rem', durationMinutes: 300 }] },
    ] })
    expect(await syncHealthData(3)).toBe(1)
    const [rows] = sb.op(sb.queriesFor('daily_health')[0], 'upsert')
    expect(rows[0]).toMatchObject({ date: '2026-10-22', steps: 8000, active_calories: 451, resting_hr: 58, sleep_hours: 7, source: 'healthkit', user_id: 'user-1' })
  })
  it('does not prompt on silent launch sync and writes nothing without access', async () => {
    native.value = true
    Health.isAvailable.mockResolvedValue({ available: true })
    Health.checkAuthorization.mockResolvedValue({ readAuthorized: [] })
    expect(await syncHealthData(3, { prompt: false })).toBe(0)
    expect(Health.requestAuthorization).not.toHaveBeenCalled()
  })
  it('explains when the device has no health store', async () => {
    native.value = true
    Health.isAvailable.mockResolvedValue({ available: false, reason: 'Health Connect not installed' })
    await expect(syncHealthData()).rejects.toThrow('Health Connect not installed')
  })
})
