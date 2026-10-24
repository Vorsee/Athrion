import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { cancelSubscription } from '../lib/stripe.js'
import { signOut } from '../lib/session.js'
import { Icon } from '@iconify/react'
import { tok } from '../lib/tokens.js'
import Sheet from './Sheet.jsx'
import { Button, Segmented } from './ui/index.js'
import { fmtWeight } from '../lib/units.js'
import { PRO_FEATURES, annualPerMonth, money } from '../lib/pricing.js'

const QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Pain is temporary. Pride is forever.", author: "Anonymous" },
  { text: "Your body can stand almost anything. It's your mind you have to convince.", author: "Anonymous" },
  { text: "Train hard. Recover smart. Repeat.", author: "Anonymous" },
  { text: "No shortcuts. No excuses. Just work.", author: "Anonymous" },
  { text: "Push yourself — no one else is going to do it for you.", author: "Anonymous" },
  { text: "A one-hour workout is 4% of your day. No excuses.", author: "Anonymous" },
  { text: "The hardest lift is lifting yourself off the couch.", author: "Anonymous" },
  { text: "Strength is built in the moments you want to quit.", author: "Anonymous" },
  { text: "Every rep is a vote for the person you want to become.", author: "Anonymous" },
  { text: "The iron never lies to you.", author: "Henry Rollins" },
  { text: "If it doesn't challenge you, it doesn't change you.", author: "Fred DeVito" },
]

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

function SubscriptionScreen({ onBack }) {
  const [step, setStep]     = useState('idle')   // idle | confirm | loading | done | error
  const [result, setResult] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  async function handleCancel() {
    setStep('loading')
    try {
      const data = await cancelSubscription()
      setResult(data)
      setStep('done')
    } catch (e) {
      setErrMsg(e.message || 'Something went wrong')
      setStep('error')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} aria-label="Back"
          className="press w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised transition-colors">
          <Icon icon="mdi:chevron-left" width={24} />
        </button>
        <div className="font-bold text-base">Subscription</div>
      </div>

      {/* Plan card */}
      <div className="bg-gradient-to-br from-neon-tint to-canvas border border-neon-stroke/30 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-xl text-neon-ink leading-none">ATHRION Pro</div>
            <div className="text-xs text-muted mt-0.5">Your subscription</div>
          </div>
          <div className="bg-neon text-on-neon text-xs font-bold px-3 py-1 rounded-full">
            Active
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {PRO_FEATURES.map(f => (
            <div key={f.title} className="flex items-center gap-2 text-ink-2">
              <Icon icon="mdi:check" width={14} className="text-neon-ink flex-shrink-0" />
              <span className="text-xs">{f.title}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted mt-4">Your price and renewal date are on your Stripe receipt email.</div>
      </div>

      {/* Status / actions */}
      {step === 'idle' && (
        <Button variant="danger" full onClick={() => setStep('confirm')}>Cancel subscription</Button>
      )}

      {step === 'confirm' && (
        <div className="bg-danger/12 border border-danger/12 rounded-2xl p-5">
          <div className="font-bold text-sm text-danger mb-1">Are you sure?</div>
          <p className="text-xs text-muted leading-relaxed mb-4">
            You'll keep Pro access until the end of your current billing period. After that your account moves to Free.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('idle')}>Keep Pro</Button>
            <Button variant="danger" className="flex-1" onClick={handleCancel}>Yes, cancel</Button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="w-full py-3.5 rounded-xl text-sm font-semibold text-muted bg-raised border border-line flex items-center justify-center gap-2">
          <span className="spin inline-block w-4 h-4 border-2 border-line-strong border-t-muted rounded-full" />
          Cancelling…
        </div>
      )}

      {step === 'done' && (
        <div className="bg-surface border border-line rounded-2xl p-5 text-center">
          <Icon icon="mdi:check-circle-outline" width={32} className="text-neon-ink mx-auto mb-2" />
          <div className="font-bold text-sm text-ink mb-1">Subscription cancelled</div>
          <p className="text-xs text-muted leading-relaxed">
            You'll keep Pro access until{' '}
            <span className="text-ink-2 font-semibold">
              {result?.period_end ? fmtDate(result.period_end) : 'the end of your billing period'}
            </span>.
            No further charges will be made.
          </p>
        </div>
      )}

      {step === 'error' && (
        <div className="bg-danger/12 border border-danger/12 rounded-2xl p-4">
          <div className="text-sm text-danger font-semibold mb-1">Cancellation failed</div>
          <p className="text-xs text-muted mb-3">{errMsg}</p>
          <button onClick={() => setStep('idle')}
            className="text-xs text-muted hover:text-ink transition-colors underline">
            Try again
          </button>
        </div>
      )}

      <p className="text-center text-xs text-muted mt-4">
        Need help? Contact support at support@athrion.app
      </p>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ProfileModal({ session, profile, isPro, theme, onToggleTheme, onClose, onEdit, onUpgrade }) {
  const [pwState, setPwState] = useState('idle')   // idle | loading | sent | error
  const [screen, setScreen]   = useState('profile') // profile | subscription

  const bmi     = profile ? calcBMI(profile.height_cm, profile.weight_lb) : null
  const cat     = bmi ? bmiInfo(bmi) : null
  // BMI 15-40 across the bar; bands start at 18.5 (14%), 25 (40%) and 30 (60%)
  const bmiPct  = bmi ? Math.min(98, Math.max(2, ((bmi - 15) / (40 - 15)) * 100)) : 0

  const quote   = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length]
  const initial = session?.name?.[0]?.toUpperCase() || '?'

  async function handleChangePassword() {
    setPwState('loading')
    const { error } = await supabase.auth.resetPasswordForEmail(session.email, {
      redirectTo: window.location.origin,
    })
    setPwState(error ? 'error' : 'sent')
  }

  return (
    <Sheet ariaLabel={screen === 'subscription' ? 'Subscription' : 'Profile and settings'} onClose={onClose} bodyClassName="-mx-1">
        {screen === 'subscription' ? (
          <SubscriptionScreen onBack={() => setScreen('profile')} />
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
            <div className="mb-6">
              <div className="text-lg leading-[1.3] font-semibold text-ink mb-2">Appearance</div>
              <Segmented options={[['dark', 'Dark'], ['light', 'Light']]} value={theme}
                onChange={t => { if (t !== theme) onToggleTheme?.() }} label="Theme" kind="choice" />
            </div>

            {/* ── Daily quote ── */}
            <div className="bg-canvas border border-line rounded-2xl p-5 mb-6 relative overflow-hidden">
              <div className="text-2xs text-neon-ink mb-2.5">Daily motivation</div>
              <div className="text-sm text-ink-2 leading-relaxed italic">"{quote.text}"</div>
              {quote.author !== 'Anonymous' && quote.author !== 'Unknown' && (
                <div className="text-xs text-muted mt-2">{quote.author}</div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="space-y-2.5">
              {pwState === 'sent' ? (
                <div role="status" className="w-full py-3.5 rounded-xl text-sm font-semibold text-neon-ink bg-neon/8 border border-neon-stroke/25 flex items-center justify-center gap-2">
                  <Icon icon="mdi:check-circle-outline" width={16} />
                  Reset link sent. Check your inbox.
                </div>
              ) : (
                <button onClick={handleChangePassword} disabled={pwState === 'loading'}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold text-ink-2 bg-raised border border-line hover:border-line-strong hover:text-ink transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  <Icon icon="mdi:key-outline" width={16} />
                  <span>{pwState === 'loading' ? 'Sending...' : 'Change password'}</span>
                </button>
              )}
              {pwState === 'error' && (
                <p className="text-danger text-xs text-center">Couldn't send the link. Try again.</p>
              )}

              {!isPro && (
                <button onClick={onUpgrade}
                  className="w-full py-3.5 rounded-xl text-sm font-bold bg-neon/10 border border-neon-stroke/30 text-neon-ink hover:bg-neon/15 hover:border-neon-stroke/50 transition-all flex items-center justify-center gap-2">
                  <Icon icon="mdi:star-four-points-outline" width={16} />
                  <span>Get ATHRION Pro · from {money(annualPerMonth)} a month</span>
                </button>
              )}

              {isPro && (
                <button onClick={() => setScreen('subscription')}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold bg-neon/8 border border-neon-stroke/20 hover:bg-neon/12 hover:border-neon-stroke/35 transition-all flex items-center justify-between px-5">
                  <div className="flex items-center gap-2 text-neon-ink">
                    <Icon icon="mdi:check-decagram-outline" width={16} />
                    <span>ATHRION Pro is active</span>
                  </div>
                  <span className="text-muted text-xs flex items-center">Manage <Icon icon="mdi:chevron-right" width={16} /></span>
                </button>
              )}

              <Button variant="secondary" full icon="mdi:ruler" onClick={onEdit}>Edit body stats</Button>

              <Button variant="ghost" full icon="mdi:logout" onClick={() => signOut()} className="!text-danger">Sign out</Button>
            </div>
          </div>
        )}
    </Sheet>
  )
}
