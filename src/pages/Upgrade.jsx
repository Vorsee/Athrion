import { useState } from 'react'
import { createCheckoutSession } from '../lib/stripe.js'

const FREE_ITEMS = [
  { text: 'Unlimited workout logging',       yes: true  },
  { text: '3 saved custom workouts',         yes: false },
  { text: 'Full exercise library',           yes: true  },
  { text: 'Rest timer & free workout mode',  yes: true  },
  { text: 'Nutrition & calorie tracker',     yes: false },
  { text: 'Daily macro goals',               yes: false },
  { text: 'Meal history & trends',           yes: false },
]

const PRO_ITEMS = [
  { text: 'Everything in Free',              yes: true },
  { text: 'Unlimited custom workouts',       yes: true },
  { text: 'Full nutrition tracker',          yes: true },
  { text: 'Daily calorie & macro goals',     yes: true },
  { text: 'Meal history & trends',           yes: true },
  { text: 'Priority future features',        yes: true },
]

const PITCH = [
  {
    icon: '📊',
    title: 'Data-Driven Results',
    body: "Athletes who track nutrition see 2× faster progress. Every calorie is a data point — serious gains don't happen by guessing.",
  },
  {
    icon: '♾️',
    title: 'Build Without Limits',
    body: "Free users cap out at 3 saved workouts. Pro members build unlimited programs for every goal, season, and training block.",
  },
  {
    icon: '🔒',
    title: 'Cancel Anytime',
    body: "No contracts. No fine print. If Pro doesn't deliver, cancel in one tap — no questions asked.",
  },
]

export default function Upgrade({ onBack }) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try { await createCheckoutSession() } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-dm">
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,241,53,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,241,53,0.03) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="relative z-10 max-w-lg mx-auto px-4 pt-6 pb-20">

        {/* Back */}
        <button onClick={onBack} className="text-gray-500 text-sm hover:text-white transition-colors mb-6 flex items-center gap-1">
          ← Back
        </button>

        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-neon/10 border border-neon/25 rounded-full px-4 py-1.5 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
            <span className="text-neon text-xs font-bold uppercase tracking-widest">Athrion Pro</span>
          </div>
          <div className="font-bebas text-5xl tracking-wide leading-tight mb-3">
            UNLOCK YOUR<br />FULL POTENTIAL
          </div>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
            Serious athletes track everything. Stop guessing — start optimizing every workout and every meal.
          </p>
        </div>

        {/* Price card */}
        <div className="bg-gradient-to-br from-[#0e1500] to-[#0a0a0a] border border-neon/30 rounded-3xl p-6 mb-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-neon/5" />
          <div className="relative">
            <div className="flex items-end gap-1.5 mb-1">
              <span className="font-bebas text-7xl text-neon leading-none">$5.99</span>
              <span className="text-gray-400 text-sm mb-2.5">/ month</span>
            </div>
            <div className="text-xs text-gray-600 mb-5">Cancel anytime · Secure checkout via Stripe</div>
            <UpgradeBtn loading={loading} onClick={handleUpgrade} label="Upgrade to Pro →" />
          </div>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Free */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">Free</div>
            <div className="space-y-2.5">
              {FREE_ITEMS.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-xs mt-0.5 flex-shrink-0 ${item.yes ? 'text-gray-500' : 'text-[#333]'}`}>
                    {item.yes ? '✓' : '✕'}
                  </span>
                  <span className={`text-xs leading-snug ${item.yes ? 'text-gray-400' : 'text-[#444]'}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pro */}
          <div className="bg-[#0c1200] border border-neon/30 rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute top-2.5 right-2.5 bg-neon text-black text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full">PRO</div>
            <div className="text-[10px] text-neon uppercase tracking-widest font-bold mb-3">Pro</div>
            <div className="space-y-2.5">
              {PRO_ITEMS.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-neon text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-xs text-gray-300 leading-snug">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pitch cards */}
        <div className="space-y-3 mb-6">
          {PITCH.map(({ icon, title, body }) => (
            <div key={title} className="flex gap-4 bg-[#111] border border-[#1e1e1e] rounded-2xl p-4">
              <div className="text-2xl flex-shrink-0">{icon}</div>
              <div>
                <div className="font-bold text-sm mb-0.5">{title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <UpgradeBtn loading={loading} onClick={handleUpgrade} label={`Start Pro — $5.99 / mo`} />
        <p className="text-center text-[10px] text-gray-700 mt-3">Secure payment · Billed monthly · Cancel anytime</p>
      </div>
    </div>
  )
}

function UpgradeBtn({ loading, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full bg-neon text-black font-bold py-4 rounded-2xl text-sm uppercase tracking-widest hover:shadow-[0_8px_32px_rgba(200,241,53,0.4)] active:scale-[0.98] transition-all disabled:opacity-60">
      {loading ? 'Loading…' : label}
    </button>
  )
}
