// Vercel serverless routes in api/: checkout, cancel, Stripe webhook
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb } from '../helpers/supabaseMock.js'

const stripe = {
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { update: vi.fn(), retrieve: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
}
vi.mock('stripe', () => ({ default: vi.fn(() => stripe) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => sb.supabase) }))

function req({ method = 'POST', body, headers = {} } = {}) {
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  return { method, headers, async *[Symbol.asyncIterator]() { if (raw) yield Buffer.from(raw) } }
}
function res() {
  const r = { statusCode: 200, body: undefined, headers: {} }
  r.status = vi.fn(c => { r.statusCode = c; return r })
  r.json = vi.fn(b => { r.body = b; return r })
  r.send = vi.fn(b => { r.body = b; return r })
  r.end = vi.fn(b => { r.body = b; return r })
  r.setHeader = vi.fn((k, v) => { r.headers[k] = v })
  return r
}

let checkout, cancel, webhook
beforeEach(async () => {
  sb.reset()
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
  process.env.STRIPE_PRICE_MONTHLY = 'price_monthly'
  process.env.STRIPE_PRICE_ANNUAL = 'price_annual'
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  checkout = (await import('../../api/create-checkout.js')).default
  cancel = (await import('../../api/cancel-subscription.js')).default
  webhook = (await import('../../api/stripe-webhook.js')).default
})

describe('POST /api/create-checkout', () => {
  const auth = { authorization: 'Bearer jwt-token' }
  it('creates a Pro checkout for the signed-in user, taken from the token', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/s' })
    const r = res()
    await checkout(req({ body: { user_id: 'someone-else', plan: 'monthly' }, headers: auth }), r)
    expect(r.body).toEqual({ url: 'https://checkout.stripe.com/s', trial: true })
    expect(sb.supabase.auth.getUser).toHaveBeenCalledWith('jwt-token')
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: 'subscription', client_reference_id: 'user-1', metadata: { user_id: 'user-1', plan: 'monthly' }, customer_email: 'sam@example.com',
      line_items: [{ price: 'price_monthly', quantity: 1 }], allow_promotion_codes: true,
    })
  })
  it('sells monthly when no plan is sent, and annual when asked', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'x' })
    await checkout(req({ headers: auth }), res())
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items[0].price).toBe('price_monthly')
    await checkout(req({ body: { plan: 'annual' }, headers: auth }), res())
    expect(stripe.checkout.sessions.create.mock.calls[1][0].line_items[0].price).toBe('price_annual')
  })
  it('gives first-time subscribers a 7-day trial', async () => {
    sb.set('subscriptions', { data: { stripe_customer_id: null } })
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'x' })
    await checkout(req({ body: { plan: 'annual' }, headers: auth }), res())
    expect(stripe.checkout.sessions.create.mock.calls[0][0].subscription_data).toMatchObject({ trial_period_days: 7 })
  })
  it('gives no second trial and reuses the Stripe customer for returning subscribers', async () => {
    sb.set('subscriptions', { data: { stripe_customer_id: 'cus_1' } })
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'x' })
    const r = res(); await checkout(req({ body: { plan: 'monthly' }, headers: auth }), r)
    const args = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(args.customer).toBe('cus_1')
    expect(args.subscription_data).toBeUndefined()
    expect(args.customer_email).toBeUndefined()
    expect(r.body.trial).toBe(false)
  })
  it('rejects other methods and bad JSON', async () => {
    let r = res(); await checkout(req({ method: 'GET' }), r); expect(r.statusCode).toBe(405)
    r = res(); await checkout(req({ body: '{oops', headers: auth }), r); expect(r.statusCode).toBe(400)
  })
  it('returns 500 when Stripe fails', async () => {
    stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe down'))
    const r = res(); await checkout(req({ body: {}, headers: auth }), r)
    expect(r.statusCode).toBe(500)
  })
  it('returns 500 instead of selling the wrong price when a plan is not configured', async () => {
    delete process.env.STRIPE_PRICE_ANNUAL
    vi.resetModules()
    const fresh = (await import('../../api/create-checkout.js')).default
    const r = res(); await fresh(req({ body: { plan: 'annual' }, headers: auth }), r)
    expect(r.statusCode).toBe(500)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  describe('regression: fixed in the October 2026 review', () => {
    it('requires the caller to be signed in', async () => {
      let r = res(); await checkout(req({ body: { user_id: 'someone-else', plan: 'monthly' } }), r)
      expect(r.statusCode).toBe(401)
      sb.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad jwt' } })
      r = res(); await checkout(req({ body: {}, headers: { authorization: 'Bearer forged' } }), r)
      expect(r.statusCode).toBe(401)
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    })
    it('only sells the configured plans; a price sent by the browser is ignored', async () => {
      let r = res(); await checkout(req({ body: { plan: 'cheap' }, headers: auth }), r)
      expect(r.statusCode).toBe(400)
      r = res(); await checkout(req({ body: { plan: 'toString' }, headers: auth }), r)
      expect(r.statusCode).toBe(400)
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
      stripe.checkout.sessions.create.mockResolvedValue({ url: 'x' })
      await checkout(req({ body: { price_id: 'price_cheap' }, headers: auth }), res())
      expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items[0].price).toBe('price_monthly')
    })
  })
})

describe('POST /api/cancel-subscription', () => {
  const auth = { authorization: 'Bearer jwt-token' }
  it('requires a valid user token', async () => {
    let r = res(); await cancel(req(), r); expect(r.statusCode).toBe(401)
    sb.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad jwt' } })
    r = res(); await cancel(req({ headers: auth }), r); expect(r.statusCode).toBe(401)
  })
  it('refuses when there is no active subscription', async () => {
    sb.set('subscriptions', { data: { status: 'free', stripe_subscription_id: null } })
    const r = res(); await cancel(req({ headers: auth }), r)
    expect(r.statusCode).toBe(400)
  })
  it('cancels at period end (older Stripe API shape)', async () => {
    sb.set('subscriptions', { data: { status: 'pro', stripe_subscription_id: 'sub_1' } })
    stripe.subscriptions.update.mockResolvedValue({ cancel_at: 1798761600, current_period_end: 1798761600 })
    const r = res(); await cancel(req({ headers: auth }), r)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true })
    expect(r.body).toMatchObject({ success: true, period_end: '2027-01-01T00:00:00.000Z' })
  })

  it('reports a pending cancellation from Stripe', async () => {
    sb.set('subscriptions', { data: { status: 'pro', stripe_subscription_id: 'sub_1' } })
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: true, cancel_at: 1798761600, items: { data: [{ current_period_end: 1798761600 }] } })
    const r = res(); await cancel(req({ headers: auth, body: { action: 'status' } }), r)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(r.body).toMatchObject({ cancelled: true, cancel_at: '2027-01-01T00:00:00.000Z' })
  })
  it('renews by undoing the pending cancellation', async () => {
    sb.set('subscriptions', { data: { status: 'pro', stripe_subscription_id: 'sub_1' } })
    stripe.subscriptions.update.mockResolvedValue({ status: 'active', cancel_at_period_end: false, cancel_at: null, items: { data: [{ current_period_end: 1798761600 }] } })
    const r = res(); await cancel(req({ headers: auth, body: { action: 'resume' } }), r)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: false })
    expect(r.body).toMatchObject({ cancelled: false, cancel_at: null })
  })
  it('rejects unknown actions', async () => {
    const r = res(); await cancel(req({ headers: auth, body: { action: 'delete' } }), r)
    expect(r.statusCode).toBe(400)
  })

  describe('regression: fixed in the October 2026 review', () => {
    // Since Stripe API 2025-03-31 (used by stripe-node 22), current_period_end moved to
    // subscription items. new Date(NaN).toISOString() throws, so the user sees an error
    // even though the cancellation already went through.
    it('succeeds with the current Stripe API response shape', async () => {
      sb.set('subscriptions', { data: { status: 'pro', stripe_subscription_id: 'sub_1' } })
      stripe.subscriptions.update.mockResolvedValue({ cancel_at: 1798761600, items: { data: [{ current_period_end: 1798761600 }] } })
      const r = res(); await cancel(req({ headers: auth }), r)
      expect(r.statusCode).toBe(200)
    })
  })
})

describe('POST /api/stripe-webhook', () => {
  const event = (type, object) => stripe.webhooks.constructEvent.mockReturnValue({ type, data: { object } })
  const sig = { 'stripe-signature': 't=1,v1=abc' }

  it('rejects bad signatures', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('No signatures found') })
    const r = res(); await webhook(req({ body: '{}', headers: sig }), r)
    expect(r.statusCode).toBe(400)
  })
  it('verifies the raw body', async () => {
    event('ping', {})
    await webhook(req({ body: '{"id":"evt_1"}', headers: sig }), res())
    const [raw, header, secret] = stripe.webhooks.constructEvent.mock.calls[0]
    expect(raw.toString()).toBe('{"id":"evt_1"}')
    expect(header).toBe('t=1,v1=abc')
    expect(secret).toBe('whsec_x')
  })
  it('marks the user Pro after checkout', async () => {
    sb.set('subscriptions', { data: null, error: null })
    event('checkout.session.completed', { client_reference_id: 'user-1', customer: 'cus_1', subscription: 'sub_1' })
    const r = res(); await webhook(req({ body: '{}', headers: sig }), r)
    expect(sb.op(sb.queriesFor('subscriptions')[0], 'upsert')[0]).toMatchObject({ user_id: 'user-1', status: 'pro', stripe_subscription_id: 'sub_1' })
    expect(r.body).toEqual({ received: true })
  })
  it('downgrades when a subscription lapses or is deleted', async () => {
    sb.set('subscriptions', { data: { user_id: 'user-1' }, error: null })
    event('customer.subscription.updated', { id: 'sub_1', status: 'past_due' })
    await webhook(req({ body: '{}', headers: sig }), res())
    expect(sb.op(sb.queriesFor('subscriptions').at(-1), 'update')[0].status).toBe('free')
    event('customer.subscription.deleted', { id: 'sub_1' })
    await webhook(req({ body: '{}', headers: sig }), res())
    expect(sb.op(sb.queriesFor('subscriptions').at(-1), 'update')[0]).toMatchObject({ status: 'free', stripe_subscription_id: null })
  })

  describe('regression: fixed in the October 2026 review', () => {
    // Only the downgrade direction is handled: a past_due subscription that is paid
    // again goes back to "active" in Stripe but the user stays "free" in the app.
    it('restores Pro when a subscription becomes active again', async () => {
      sb.set('subscriptions', { data: { user_id: 'user-1' }, error: null })
      event('customer.subscription.updated', { id: 'sub_1', status: 'active' })
      await webhook(req({ body: '{}', headers: sig }), res())
      expect(sb.op(sb.queriesFor('subscriptions').at(-1) ?? { ops: [] }, 'update')?.[0]?.status).toBe('pro')
    })
  })
})
