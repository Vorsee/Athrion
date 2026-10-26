import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { signOut } from '../lib/session.js'
import { Button, InlineError } from './ui/index.js'
import { consentMetadata } from '../lib/legal.js'

const LINK = 'underline underline-offset-2 text-ink-2 hover:text-ink'

function Check({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-3 text-xs text-muted leading-relaxed cursor-pointer min-h-[44px] py-1">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 flex-shrink-0 accent-neon rounded" />
      <span>{children}</span>
    </label>
  )
}

// Two separate boxes: the health one is the explicit consent GDPR and US health-data laws ask for
export function ConsentChecks({ value, onChange }) {
  return (
    <div className="space-y-1">
      <Check checked={value.terms} onChange={v => onChange({ ...value, terms: v })}>
        I'm 16 or older and agree to the <a href="/terms.html" target="_blank" rel="noreferrer" className={LINK}>Terms of use</a> and{' '}
        <a href="/privacypolicy.html" target="_blank" rel="noreferrer" className={LINK}>Privacy policy</a>.
      </Check>
      <Check checked={value.health} onChange={v => onChange({ ...value, health: v })}>
        I agree to ATHRION using my health and fitness information (like weight, body measurements, workouts and meals)
        to run the app and build my plan. I can withdraw this by deleting my account.
      </Check>
    </div>
  )
}

// Accounts made before the consent boxes existed see this once
export default function ConsentScreen() {
  const [value, setValue] = useState({ terms: false, health: false })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function agree() {
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ data: consentMetadata() })
    if (error) { setError(error.message); setBusy(false) }
    // On success the auth listener in App sees the new metadata and moves on
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm slide-up">
        <div className="font-bold text-[2rem] leading-tight text-ink">Before you continue</div>
        <p className="text-sm text-muted mt-2 mb-6">
          We've published our Terms of use and an updated Privacy policy. Please read and agree to keep using ATHRION.
        </p>
        <div className="bg-surface border border-line rounded-2xl p-4 mb-4">
          <ConsentChecks value={value} onChange={setValue} />
        </div>
        {error && <InlineError className="mb-3">{error}</InlineError>}
        <Button full onClick={agree} disabled={!value.terms || !value.health || busy}>
          {busy ? 'Saving…' : 'Agree and continue'}
        </Button>
        <button type="button" onClick={() => signOut()}
          className="press w-full min-h-[44px] mt-2 text-sm font-semibold text-ink-2 hover:text-ink">
          Sign out
        </button>
      </div>
    </div>
  )
}
