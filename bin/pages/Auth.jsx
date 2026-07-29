import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [screen, setScreen] = useState('form') // form | check-email
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin() {
    if (!form.email || !form.password) return setError('All fields required.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) return setError('All fields required.')
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

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="fixed w-[500px] h-[500px] rounded-full bg-neon opacity-10 blur-[120px] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[400px] h-[400px] rounded-full bg-blue-500 opacity-10 blur-[100px] -bottom-20 -left-20 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,241,53,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(200,241,53,0.04) 1px,transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="relative z-10 w-full max-w-sm slide-up">
        <div className="text-center mb-10">
          <div className="font-bebas text-7xl text-white tracking-widest">ATHRION</div>
          <div className="text-xs text-gray-600 tracking-[0.3em] uppercase mt-1">Train · Track · Transform</div>
        </div>

        <div className="bg-[#111] border border-[#222] rounded-2xl p-8">
          {screen === 'check-email' ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <div className="text-white font-semibold">Check your email</div>
              <div className="text-sm text-gray-500">
                We sent a confirmation link to <span className="text-gray-300">{form.email}</span>.
                Click it to activate your account, then come back and sign in.
              </div>
              <button
                onClick={() => { setScreen('form'); setTab('login') }}
                className="w-full bg-neon text-black font-bold py-3 rounded-xl text-sm uppercase tracking-widest hover:shadow-[0_6px_24px_rgba(200,241,53,0.4)] transition-all"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1 bg-[#161616] p-1 rounded-xl mb-7">
                {['login', 'register'].map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setError('') }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase tracking-widest transition-all ${tab === t ? 'bg-neon text-black' : 'text-[#555]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {tab === 'register' && (
                  <input
                    className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                  />
                )}
                <input
                  className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tab === 'login' && handleLogin()}
                />
                <input
                  className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tab === 'login' && handleLogin()}
                />
                {tab === 'register' && (
                  <input
                    className="w-full bg-[#161616] border border-[#222] focus:border-neon text-white placeholder-[#444] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                    type="password"
                    placeholder="Confirm password"
                    value={form.confirm}
                    onChange={e => set('confirm', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  />
                )}

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <button
                  onClick={tab === 'login' ? handleLogin : handleRegister}
                  disabled={loading}
                  className="w-full bg-neon text-black font-bold py-3 rounded-xl text-sm uppercase tracking-widest hover:shadow-[0_6px_24px_rgba(200,241,53,0.4)] hover:-translate-y-px transition-all mt-1 disabled:opacity-50"
                >
                  {loading ? '...' : tab === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[#333] text-xs mt-6">
          Powered by Supabase · Your data is yours
        </p>
      </div>
    </div>
  )
}
