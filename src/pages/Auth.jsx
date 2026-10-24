import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Icon } from '@iconify/react'
import { Segmented, BackLink } from '../components/ui/index.js'

const INPUT = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors'
const PRIMARY = 'press w-full h-12 bg-neon active:bg-neon-press text-on-neon font-semibold rounded-xl text-sm transition-colors disabled:opacity-40'

// mode: 'register' | 'login'; onBack returns to the landing page
export default function Auth({ initialMode = 'login', onBack }) {
  const [tab, setTab] = useState(initialMode)
  const [screen, setScreen] = useState('form') // form | check-email | forgot | reset-sent
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin() {
    if (!form.email || !form.password) return setError('Enter your email and password.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) return setError('Fill in every field to continue.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } },
    })
    if (error) setError(error.message)
    else setScreen('check-email')
    setLoading(false)
  }

  async function handleForgot() {
    if (!form.email) return setError('Enter the email you signed up with.')
    setLoading(true); setError('')
    // The link signs them in and App asks for a new password (PASSWORD_RECOVERY)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: window.location.origin })
    if (error) setError(error.message)
    else setScreen('reset-sent')
    setLoading(false)
  }

  function submit(e) {
    e.preventDefault()
    if (screen === 'forgot') return handleForgot()
    return tab === 'login' ? handleLogin() : handleRegister()
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">

      <div className="relative z-10 w-full max-w-sm slide-up">
        {onBack && <BackLink onClick={onBack} className="mb-4">About ATHRION</BackLink>}
        <div className="text-center mb-10">
          <div className="font-bold text-4xl tracking-tight text-ink">ATHRION</div>
          <div className="text-sm text-muted mt-2">Your training plan and calories, adjusted every week</div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 xs:p-8">
          {screen === 'check-email' || screen === 'reset-sent' ? (
            <div className="text-center space-y-4" role="status">
              <Icon icon="mdi:email-check-outline" width={44} className="mx-auto text-neon-ink" />
              <div className="text-ink font-semibold">Check your email</div>
              <div className="text-sm text-muted">
                {screen === 'check-email'
                  ? <>We sent a confirmation link to <span className="text-ink-2">{form.email}</span>. Click it to activate your account, then come back and sign in.</>
                  : <>If <span className="text-ink-2">{form.email}</span> has an account, we sent it a link to set a new password.</>}
              </div>
              <div className="text-xs text-muted">Can't find it? Check spam or promotions.</div>
              <button type="button"
                onClick={() => { setScreen('form'); setTab('login') }}
                className={PRIMARY}
              >
                Go to sign in
              </button>
            </div>
          ) : screen === 'forgot' ? (
            <form onSubmit={submit} className="space-y-3" noValidate>
              <div>
                <div className="text-ink font-semibold">Reset your password</div>
                <div className="text-sm text-muted mt-1">We'll email you a link to set a new one.</div>
              </div>
              <input className={INPUT} type="email" name="email" autoComplete="email" inputMode="email"
                placeholder="Email address" aria-label="Email address"
                value={form.email} onChange={e => set('email', e.target.value)} />
              {error && <p role="alert" className="text-danger text-xs">{error}</p>}
              <button type="submit" disabled={loading} className={`${PRIMARY} mt-1`}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" onClick={() => { setScreen('form'); setError('') }}
                className="press w-full min-h-[44px] text-sm font-semibold text-ink-2 hover:text-ink">
                Back to sign in
              </button>
            </form>
          ) : (
            <>
              <Segmented className="mb-7" label="Account"
                options={[['register', 'Create account'], ['login', 'Sign in']]} value={tab}
                onChange={t => { setTab(t); setError('') }} />

              <form onSubmit={submit} className="space-y-3" noValidate>
                {tab === 'register' && (
                  <input className={INPUT} name="name" autoComplete="name"
                    placeholder="Full name" aria-label="Full name"
                    value={form.name} onChange={e => set('name', e.target.value)} />
                )}
                <input className={INPUT} type="email" name="email" autoComplete="email" inputMode="email"
                  placeholder="Email address" aria-label="Email address"
                  value={form.email} onChange={e => set('email', e.target.value)} />
                <input className={INPUT} type="password" name="password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Password" aria-label="Password"
                  value={form.password} onChange={e => set('password', e.target.value)} />
                {tab === 'register' && (
                  <input className={INPUT} type="password" name="confirm" autoComplete="new-password"
                    placeholder="Confirm password" aria-label="Confirm password"
                    value={form.confirm} onChange={e => set('confirm', e.target.value)} />
                )}

                {error && <p role="alert" className="text-danger text-xs">{error}</p>}

                <button type="submit" disabled={loading} className={`${PRIMARY} mt-1`}>
                  {loading ? (tab === 'login' ? 'Signing in…' : 'Creating account…') : tab === 'login' ? 'Sign in' : 'Create free account'}
                </button>
                {tab === 'login' && (
                  <button type="button" onClick={() => { setScreen('forgot'); setError('') }}
                    className="press w-full min-h-[44px] text-sm font-semibold text-ink-2 hover:text-ink">
                    Forgot password?
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p className="text-center text-muted text-xs mt-6">
          Your photos and logs are private to your account.{' '}
          <a href="/privacypolicy.html" className="underline underline-offset-2 hover:text-ink-2">Privacy policy</a>
        </p>
      </div>
    </div>
  )
}
