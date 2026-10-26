import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { cancelSubscription, resumeSubscription, fetchSubscriptionDetails } from '../lib/stripe.js'
import { signOut } from '../lib/session.js'
import { fetchProState } from '../lib/api.js'
import { downloadMyData, deleteAccount } from '../lib/account.js'
import { Icon } from '@iconify/react'
import { tok } from '../lib/tokens.js'
import Sheet from './Sheet.jsx'
import { Button, Segmented, ListRow, Card, Tag, Skeleton, InlineError } from './ui/index.js'
import ReminderSettings from './ReminderSettings.jsx'
import { fmtWeight } from '../lib/units.js'
import { PRO_FEATURES, annualPerMonth, money } from '../lib/pricing.js'


function fmtHeight(cm) {
  const totalIn = Math.round(cm / 2.54)
  const ft = Math.floor(totalIn / 12)
  const inches = totalIn % 12
  return `${ft}' ${inches}"`
}

function calcBMI(height_cm, weight_lb) {
  const kg = weight_lb / 2.20462
  const m  = height_cm / 100
  return kg / (m * m)
}

function bmiInfo(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: 'info' }
  if (bmi < 25)   return { label: 'Normal',      color: 'neon-ink' }
  if (bmi < 30)   return { label: 'Overweight',  color: 'warn' }
  return               { label: 'Obese',       color: 'danger' }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Subscription sub-screen ───────────────────────────────────────────────────
// Stripe is the source of truth: the screen asks it on open, so a cancel made
// here or in Stripe shows as cancelled, with Renew instead of Cancel.

function SubscriptionScreen({ onBack }) {
  const [details, setDetails] = useState(null)    // { cancelled, cancel_at, period_end }
  const [step, setStep]       = useState('loading') // loading | idle | confirm | working | error
  const [errMsg, setErrMsg]   = useState('')

  async function run(fn) {
    setStep(details ? 'working' : 'loading')
    setErrMsg('')
    try {
      setDetails(await fn())
      setStep('idle')
    } catch (e) {
      setErrMsg(e.message || 'Something went wrong')
      setStep('error')
    }
  }

  // A free month won on the leaderboard has no Stripe subscription behind it
  async function loadDetails() {
    const { paid, prizeUntil } = await fetchProState()
    if (!paid && prizeUntil) return { prize: true, period_end: prizeUntil }
    return fetchSubscriptionDetails()
  }

  useEffect(() => { run(loadDetails) }, [])

  const prize = details?.prize
  const cancelled = details?.cancelled
  const endDate = details && (details.cancel_at ?? details.period_end)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Back"
          className="press w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised transition-colors">
          <Icon icon="mdi:chevron-left" width={24} />
        </button>
        <div className="font-bold text-base">Subscription</div>
      </div>

      {/* Plan card */}
      <Card hero={!cancelled} tone={cancelled ? 'warn' : 'default'} className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="font-bold text-2xl text-ink leading-tight">ATHRION Pro</div>
          {details && (cancelled
            ? <Tag tone="warn"><Icon icon="mdi:close-circle-outline" width={14} aria-hidden="true" />Cancelled</Tag>
            : <span className="bg-neon text-on-neon text-xs font-bold px-3 py-1 rounded-full">{prize ? 'Prize' : 'Active'}</span>)}
        </div>
        {step === 'loading' ? (
          <Skeleton className="h-5 w-40 mt-3" />
        ) : endDate ? (
          <div className="mt-2 text-sm text-ink-2">
            {prize ? 'Free Pro until ' : cancelled ? 'Pro until ' : 'Renews '}
            <span className="font-semibold text-ink">{fmtDate(endDate)}</span>
          </div>
        ) : null}
        {cancelled && <p className="text-xs text-muted mt-1">No further charges. Renew any time before then to keep Pro.</p>}
        {prize && <p className="text-xs text-muted mt-1">Won on the monthly leaderboard. Nothing to pay or cancel.</p>}
        <div className="space-y-1.5 mt-4">
          {PRO_FEATURES.map(f => (
            <div key={f.title} className="flex items-center gap-2 text-sm text-ink-2">
              <Icon icon="mdi:check" width={16} className={`${cancelled ? 'text-muted' : 'text-neon-ink'} flex-shrink-0`} aria-hidden="true" />
              <span>{f.title}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Actions: Renew when cancelled, Cancel when active */}
      {step === 'error' && (
        <InlineError className="mb-3" onRetry={() => run(loadDetails)}>{errMsg}</InlineError>
      )}

      {details && !prize && cancelled && (step === 'idle' || step === 'working' || step === 'error') && (
        <Button full icon="mdi:refresh" onClick={() => run(resumeSubscription)} disabled={step === 'working'}>
          {step === 'working' ? 'Renewing…' : 'Renew subscription'}
        </Button>
      )}

      {details && !prize && !cancelled && (step === 'idle' || step === 'error') && (
        <Button variant="danger" full onClick={() => setStep('confirm')}>Cancel subscription</Button>
      )}

      {details && !cancelled && step === 'confirm' && (
        <div className="bg-danger/12 border border-danger/25 rounded-2xl p-4">
          <div className="font-bold text-sm text-danger mb-1">Cancel ATHRION Pro?</div>
          <p className="text-sm text-ink-2 mb-4">
            You keep Pro until {endDate ? fmtDate(endDate) : 'the end of this billing period'}, then move to Free.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('idle')}>Keep Pro</Button>
            <Button variant="danger" className="flex-1" onClick={() => run(cancelSubscription)}>Yes, cancel</Button>
          </div>
        </div>
      )}

      {details && !cancelled && step === 'working' && (
        <Button variant="danger" full disabled>Cancelling…</Button>
      )}

      <p className="text-center text-xs text-muted mt-4">
        Need help? Email athrionsportapp@gmail.com
      </p>
    </div>
  )
}

// ── Delete account sub-screen ─────────────────────────────────────────────────
// Asks them to type DELETE, since nothing can be brought back afterwards.

function DeleteAccountScreen({ isPro, onBack }) {
  const [typed, setTyped]   = useState('')
  const [step, setStep]     = useState('idle') // idle | working | error
  const [errMsg, setErrMsg] = useState('')

  async function confirm() {
    setStep('working')
    setErrMsg('')
    try {
      await deleteAccount() // signs out; App returns to the landing page
    } catch (e) {
      setErrMsg(e.message || 'Something went wrong')
      setStep('error')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Back" disabled={step === 'working'}
          className="press w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised transition-colors">
          <Icon icon="mdi:chevron-left" width={24} />
        </button>
        <div className="font-bold text-base">Delete account</div>
      </div>

      <div className="bg-danger/12 border border-danger/25 rounded-2xl p-4 mb-4">
        <div className="font-bold text-sm text-danger mb-2">This can't be undone</div>
        <ul className="space-y-1.5 text-sm text-ink-2">
          <li>Your workouts, food log, plan, measurements, photos, friends and points are deleted for good.</li>
          {isPro && <li>Your Pro subscription ends now with no further charges. Time left in the current period isn't refunded.</li>}
          <li>Want a copy first? Go back and tap Download my data.</li>
        </ul>
      </div>

      <label className="block text-sm text-ink-2 mb-2" htmlFor="delete-confirm">Type DELETE to confirm</label>
      <input id="delete-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters"
        className="w-full bg-raised border border-line focus:border-danger text-ink rounded-xl px-4 py-3 text-sm outline-none transition-colors mb-3" />

      {step === 'error' && <InlineError className="mb-3">{errMsg}</InlineError>}

      <Button variant="danger" full icon="mdi:delete-outline" onClick={confirm}
        disabled={typed.trim().toUpperCase() !== 'DELETE' || step === 'working'}>
        {step === 'working' ? 'Deleting…' : 'Delete my account'}
      </Button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ProfileModal({ session, profile, isPro, theme, onToggleTheme, onClose, onEdit, onUpgrade, onEditTargets }) {
  const [pwState, setPwState] = useState('idle')   // idle | loading | sent | error
  const [screen, setScreen]   = useState('profile') // profile | subscription | delete
  const [exportState, setExportState] = useState('idle') // idle | loading | error

  const bmi     = profile ? calcBMI(profile.height_cm, profile.weight_lb) : null
  const cat     = bmi ? bmiInfo(bmi) : null
  // BMI 15-40 across the bar; bands start at 18.5 (14%), 25 (40%) and 30 (60%)
  const bmiPct  = bmi ? Math.min(98, Math.max(2, ((bmi - 15) / (40 - 15)) * 100)) : 0

  const initial = session?.name?.[0]?.toUpperCase() || '?'

  async function handleChangePassword() {
    setPwState('loading')
    const { error } = await supabase.auth.resetPasswordForEmail(session.email, {
      redirectTo: window.location.origin,
    })
    setPwState(error ? 'error' : 'sent')
  }

  async function handleExport() {
    setExportState('loading')
    try { await downloadMyData(); setExportState('idle') } catch { setExportState('error') }
  }

  return (
    <Sheet ariaLabel={screen === 'subscription' ? 'Subscription' : screen === 'delete' ? 'Delete account' : 'You'} onClose={onClose} bodyClassName="-mx-1">
        {screen === 'subscription' ? (
          <SubscriptionScreen onBack={() => setScreen('profile')} />
        ) : screen === 'delete' ? (
          <DeleteAccountScreen isPro={isPro} onBack={() => setScreen('profile')} />
        ) : (
          <div>
            {/* ── User header ── */}
            <div className="flex items-center gap-4 mb-7">
              <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon-stroke/25 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-xl text-neon-ink">{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg leading-tight truncate">{session.name}</div>
                <div className="text-xs text-muted mt-0.5 truncate">{session.email}</div>
              </div>
            </div>

            {/* ── Body stats ── */}
            {profile && (
              <>
                <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">Body stats</div>
                <div className="grid grid-cols-5 gap-2 mb-5">
                  {[
                    ['Height', fmtHeight(profile.height_cm)],
                    ['Weight', fmtWeight(profile.weight_lb, profile.weight_unit === 'kg' ? 'kg' : 'lb')],
                    ['Age',    profile.age ? `${profile.age} yr` : '—'],
                    ['BMI',    bmi.toFixed(1)],
                    ['Sex',    profile.sex === 'other' ? 'N/A'
                      : profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-inset rounded-xl p-3 text-center">
                      <div className="font-bold text-lg text-ink leading-tight">{val}</div>
                      <div className="text-2xs text-muted mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* ── BMI gauge ── */}
                <div className="bg-inset rounded-2xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-lg leading-[1.3] font-semibold text-ink">Body mass index</div>
                    <div className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: tok(cat.color, 0.12), color: tok(cat.color) }}>
                      {cat.label}
                    </div>
                  </div>

                  <div className="relative h-3 rounded-full mb-3" style={{
                    background: `linear-gradient(to right, ${tok('info')} 0%, ${tok('info')} 14%, ${tok('neon-stroke')} 14%, ${tok('neon-stroke')} 40%, ${tok('warn')} 40%, ${tok('warn')} 60%, ${tok('danger')} 60%)`,
                  }}>
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-surface -translate-x-1/2 transition-all duration-700"
                      style={{ left: `${bmiPct}%`, background: tok(cat.color) }} />
                  </div>

                  <div className="grid grid-cols-4 text-2xs text-muted">
                    <span>Under</span>
                    <span className="text-center">Normal</span>
                    <span className="text-center">Over</span>
                    <span className="text-right">Obese</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Appearance ── */}
            <section className="mb-6">
              <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Appearance</h3>
              <Segmented options={[['dark', 'Dark'], ['light', 'Light']]} value={theme}
                onChange={t => { if (t !== theme) onToggleTheme?.() }} label="Theme" kind="choice" />
            </section>

            {/* ── Reminders (moved here from Progress) ── */}
            <section className="mb-6">
              <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Reminders</h3>
              <ReminderSettings />
            </section>

            {/* ── Nutrition targets ── */}
            {onEditTargets && (
              <section className="mb-6">
                <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Nutrition</h3>
                <div className="bg-surface border border-line rounded-2xl p-1">
                  <ListRow icon="mdi:target" tile="info" title="Nutrition targets" meta="Daily calories, protein and carbs" chevron onClick={onEditTargets} />
                </div>
              </section>
            )}

            {/* ── Subscription ── */}
            <section className="mb-6">
              <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Subscription</h3>
              {isPro ? (
                <button onClick={() => setScreen('subscription')}
                  className="press w-full py-3.5 rounded-xl text-sm font-semibold bg-neon/8 border border-neon-stroke/20 hover:bg-neon/12 hover:border-neon-stroke/35 transition-all flex items-center justify-between px-5">
                  <div className="flex items-center gap-2 text-neon-ink">
                    <Icon icon="mdi:check-decagram-outline" width={16} />
                    <span>ATHRION Pro is active</span>
                  </div>
                  <span className="text-muted text-xs flex items-center">Manage <Icon icon="mdi:chevron-right" width={16} /></span>
                </button>
              ) : (
                <button onClick={onUpgrade}
                  className="press w-full py-3.5 rounded-xl text-sm font-bold bg-neon/10 border border-neon-stroke/30 text-neon-ink hover:bg-neon/15 hover:border-neon-stroke/50 transition-all flex items-center justify-center gap-2">
                  <Icon icon="mdi:star-four-points-outline" width={16} />
                  <span>Get ATHRION Pro · from {money(annualPerMonth)} a month</span>
                </button>
              )}
            </section>

            {/* ── Account ── */}
            <section className="mb-6 space-y-2.5">
              <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Account</h3>
              <Button variant="secondary" full icon="mdi:ruler" onClick={onEdit}>Edit body stats</Button>
              {pwState === 'sent' ? (
                <div role="status" className="w-full py-3.5 rounded-xl text-sm font-semibold text-neon-ink bg-neon/8 border border-neon-stroke/25 flex items-center justify-center gap-2">
                  <Icon icon="mdi:check-circle-outline" width={16} />
                  Reset link sent. Check your inbox.
                </div>
              ) : (
                <Button variant="secondary" full icon="mdi:key-outline" onClick={handleChangePassword} disabled={pwState === 'loading'}>
                  {pwState === 'loading' ? 'Sending...' : 'Change password'}
                </Button>
              )}
              {pwState === 'error' && (
                <p className="text-danger text-xs text-center">Couldn't send the link. Try again.</p>
              )}
            </section>

            {/* ── Your data ── */}
            <section className="mb-6">
              <h3 className="text-lg leading-[1.3] font-semibold text-ink mb-2">Your data</h3>
              <div className="bg-surface border border-line rounded-2xl p-1">
                <ListRow icon="mdi:download-outline" tile="info" title={exportState === 'loading' ? 'Preparing your file…' : 'Download my data'}
                  meta="Everything you've logged, as a file" onClick={exportState === 'loading' ? undefined : handleExport} />
                <ListRow icon="mdi:delete-outline" tile="danger" title="Delete account" meta="Erase your account and all its data" chevron onClick={() => setScreen('delete')} />
              </div>
              {exportState === 'error' && <p className="text-danger text-xs text-center mt-2">Couldn't prepare the file. Try again.</p>}
            </section>

            <Button variant="ghost" full icon="mdi:logout" onClick={() => signOut()} className="!text-danger">Sign out</Button>

            <p className="text-center text-xs text-muted mt-4">
              <a href="/privacypolicy.html" className="underline underline-offset-2 hover:text-ink-2 inline-flex items-center min-h-[44px]">Privacy policy</a>
              {' · '}
              <a href="/terms.html" className="underline underline-offset-2 hover:text-ink-2 inline-flex items-center min-h-[44px]">Terms of use</a>
            </p>
          </div>
        )}
    </Sheet>
  )
}
