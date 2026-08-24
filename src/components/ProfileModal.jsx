import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { cancelSubscription } from '../lib/stripe.js'

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
  if (bmi < 18.5) return { label: 'Underweight', color: '#60a5fa' }
  if (bmi < 25)   return { label: 'Normal',      color: '#C8F135' }
  if (bmi < 30)   return { label: 'Overweight',  color: '#f59e0b' }
  return               { label: 'Obese',       color: '#ef4444' }
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
    <div className="px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-[#1e1e1e] flex items-center justify-center text-gray-400 hover:text-white transition-colors text-lg leading-none">
          ←
        </button>
        <div className="font-bold text-base">Subscription</div>
      </div>

      {/* Plan card */}
      <div className="bg-gradient-to-br from-[#0e1500] to-[#0a0a0a] border border-neon/30 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bebas text-2xl text-neon tracking-widest leading-none">ATHRION PRO</div>
            <div className="text-xs text-gray-500 mt-0.5">Monthly subscription</div>
          </div>
          <div className="bg-neon text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full">
            ACTIVE
          </div>
        </div>

        <div className="flex items-end gap-1 mb-4">
          <span className="font-bebas text-4xl text-white leading-none">$5.99</span>
          <span className="text-gray-500 text-sm mb-0.5">/ month</span>
        </div>

        <div className="space-y-2 text-sm">
          {[
            'Unlimited custom workouts',
            'Full nutrition & calorie tracker',
            'Daily macro goals & meal history',
            'AI fitness plan & coaching',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-gray-300">
              <span className="text-neon text-xs">✓</span>
              <span className="text-xs">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status / actions */}
      {step === 'idle' && (
        <button
          onClick={() => setStep('confirm')}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-red-400 bg-red-500/8 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/40 transition-all">
          Cancel Subscription
        </button>
      )}

      {step === 'confirm' && (
        <div className="bg-[#1a0000] border border-red-900/40 rounded-2xl p-5">
          <div className="font-bold text-sm text-red-400 mb-1">Are you sure?</div>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            You'll keep Pro access until the end of your current billing period. After that your account moves to Free.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setStep('idle')}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400 bg-[#1e1e1e] border border-[#2a2a2a] hover:text-white transition-all">
              Keep Pro
            </button>
            <button onClick={handleCancel}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all">
              Yes, Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="w-full py-3.5 rounded-xl text-sm font-semibold text-gray-500 bg-[#1a1a1a] border border-[#262626] flex items-center justify-center gap-2">
          <span className="spin inline-block w-4 h-4 border-2 border-gray-700 border-t-gray-400 rounded-full" />
          Cancelling…
        </div>
      )}

      {step === 'done' && (
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="font-bold text-sm text-white mb-1">Subscription Cancelled</div>
          <p className="text-xs text-gray-500 leading-relaxed">
            You'll keep Pro access until{' '}
            <span className="text-gray-300 font-semibold">
              {result?.period_end ? fmtDate(result.period_end) : 'the end of your billing period'}
            </span>.
            No further charges will be made.
          </p>
        </div>
      )}

      {step === 'error' && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-4">
          <div className="text-sm text-red-400 font-semibold mb-1">Cancellation Failed</div>
          <p className="text-xs text-gray-500 mb-3">{errMsg}</p>
          <button onClick={() => setStep('idle')}
            className="text-xs text-gray-400 hover:text-white transition-colors underline">
            Try again
          </button>
        </div>
      )}

      <p className="text-center text-[10px] text-gray-700 mt-4">
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg bg-[#111] border border-[#222] rounded-t-3xl pb-10 max-h-[88vh] overflow-y-auto modal-up"
        onClick={e => e.stopPropagation()}
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-[#2a2a2a] rounded-full mx-auto mt-4 mb-6" />

        {screen === 'subscription' ? (
          <SubscriptionScreen onBack={() => setScreen('profile')} />
        ) : (
          <div className="px-6">
            {/* ── User header ── */}
            <div className="flex items-center gap-4 mb-7">
              <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon/25 flex items-center justify-center flex-shrink-0">
                <span className="font-bebas text-2xl text-neon">{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg leading-tight truncate">{session.name}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{session.email}</div>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#1e1e1e] flex items-center justify-center text-gray-500 hover:text-white transition-colors flex-shrink-0 text-lg leading-none">
                ×
              </button>
            </div>

            {/* ── Body stats ── */}
            {profile && (
              <>
                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Body Stats</div>
                <div className="grid grid-cols-5 gap-2 mb-5">
                  {[
                    ['Height', fmtHeight(profile.height_cm)],
                    ['Weight', `${profile.weight_lb} lb`],
                    ['Age',    profile.age ? `${profile.age} yr` : '—'],
                    ['BMI',    bmi.toFixed(1)],
                    ['Sex',    profile.sex === 'other' ? 'N/A'
                      : profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-[#0d0d0d] rounded-xl p-3 text-center">
                      <div className="font-bebas text-xl text-white leading-tight">{val}</div>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* ── BMI gauge ── */}
                <div className="bg-[#0d0d0d] rounded-2xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] text-gray-600 uppercase tracking-widest">Body Mass Index</div>
                    <div className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${cat.color}18`, color: cat.color }}>
                      {cat.label}
                    </div>
                  </div>

                  <div className="relative h-3 rounded-full mb-3" style={{
                    background: 'linear-gradient(to right, #ef4444 0%, #ef4444 24%, #f59e0b 24%, #f59e0b 48%, #C8F135 48%, #C8F135 78%, #60a5fa 78%)',
                  }}>
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-[#111] shadow-xl -translate-x-1/2 transition-all duration-700"
                      style={{ left: `${100 - bmiPct}%`, background: cat.color }} />
                  </div>

                  <div className="grid grid-cols-4 text-[8px] text-gray-700 uppercase tracking-wider">
                    <span>Obese</span>
                    <span className="text-center">Over</span>
                    <span className="text-center">Normal</span>
                    <span className="text-right">Under</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Daily quote ── */}
            <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-5 mb-6 relative overflow-hidden">
              <div className="absolute -top-2 right-4 font-bebas text-7xl text-neon/8 leading-none select-none pointer-events-none">"</div>
              <div className="text-[9px] text-neon uppercase tracking-widest mb-2.5">Daily Motivation</div>
              <div className="text-sm text-gray-300 leading-relaxed italic">"{quote.text}"</div>
              {quote.author !== 'Anonymous' && quote.author !== 'Unknown' && (
                <div className="text-[10px] text-gray-600 mt-2">— {quote.author}</div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="space-y-2.5">
              {pwState === 'sent' ? (
                <div className="w-full py-3.5 rounded-xl text-center text-sm font-semibold text-neon bg-neon/8 border border-neon/25">
                  ✓ Reset link sent — check your inbox
                </div>
              ) : (
                <button onClick={handleChangePassword} disabled={pwState === 'loading'}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold text-gray-300 bg-[#1a1a1a] border border-[#262626] hover:border-[#3a3a3a] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  <span>🔑</span>
                  <span>{pwState === 'loading' ? 'Sending...' : 'Change Password'}</span>
                </button>
              )}
              {pwState === 'error' && (
                <p className="text-red-400 text-xs text-center">Failed to send — try again.</p>
              )}

              {!isPro && (
                <button onClick={onUpgrade}
                  className="w-full py-3.5 rounded-xl text-sm font-bold bg-neon/10 border border-neon/30 text-neon hover:bg-neon/15 hover:border-neon/50 transition-all flex items-center justify-center gap-2">
                  <span>⚡</span>
                  <span>Upgrade to Pro — $5.99/mo</span>
                </button>
              )}

              {isPro && (
                <button onClick={() => setScreen('subscription')}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold bg-neon/8 border border-neon/20 hover:bg-neon/12 hover:border-neon/35 transition-all flex items-center justify-between px-5">
                  <div className="flex items-center gap-2 text-neon">
                    <span>✓</span>
                    <span>Athrion Pro — Active</span>
                  </div>
                  <span className="text-gray-600 text-xs">Manage →</span>
                </button>
              )}

              <button onClick={onEdit}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-gray-300 bg-[#1a1a1a] border border-[#262626] hover:border-[#3a3a3a] hover:text-white transition-all flex items-center justify-center gap-2">
                <span>📐</span>
                <span>Edit Body Stats</span>
              </button>

              <button onClick={() => supabase.auth.signOut()}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-red-500 hover:text-red-400 bg-[#1a1a1a] border border-[#262626] hover:border-red-900/40 transition-all">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
