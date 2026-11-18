import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from './ui/index.js'
import Brand from './Brand.jsx'
import { requestParentConsent, MINOR_LIMITS } from '../lib/parentConsent.js'
import { signOut } from '../lib/session.js'
import { readSwimInvite } from '../lib/swim.js'
import { noteSwimWaiting } from '../lib/swimApi.js'

const INPUT = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-base outline-none transition-colors'

// A 13 to 15 year old's account before a parent approves (032): ask for the parent's email,
// then wait. Nothing else in the app opens until then.
// consent: null (not asked yet; `age` from onboarding) or { status, parent_email, child_age }
export default function ParentGate({ consent, age, onChanged, onBack }) {
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(!consent)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const declined = consent?.status === 'declined'
  const childAge = consent?.child_age ?? age
  // Opened a swim team's link: the coach sees they're waiting on a parent (039)
  const swimInvite = readSwimInvite()
  useEffect(() => { if (swimInvite && consent) noteSwimWaiting(swimInvite).catch(() => {}) }, [swimInvite, consent?.status])

  async function send(to) {
    setBusy(true); setErr(''); setSent(false)
    try {
      await requestParentConsent(childAge, to)
      setSent(true); setEditing(false); onChanged?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm slide-up space-y-5">
        <div className="text-center"><Brand size="text-3xl" /></div>
        {editing ? (
          <>
            <div>
              <div className="font-bold text-3xl text-ink leading-tight">Ask a parent</div>
              <p className="text-sm text-ink-2 mt-2">You're under 16, so a parent or guardian needs to approve your account. We'll email them a link; once they say yes, you're in.</p>
            </div>
            <div className="bg-surface border border-line rounded-2xl p-4">
              <div className="text-sm font-semibold text-ink mb-2">Until you're 16:</div>
              <ul className="space-y-1.5">
                {MINOR_LIMITS.map(l => <li key={l} className="flex gap-2 text-sm text-ink-2"><Icon icon="mdi:minus-circle-outline" width={18} className="text-muted flex-shrink-0 mt-0.5" aria-hidden="true" />{l}</li>)}
              </ul>
            </div>
            <form onSubmit={e => { e.preventDefault(); send(email) }} className="space-y-3" noValidate>
              <input type="email" inputMode="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Parent's email address" aria-label="Parent's email address" className={INPUT} />
              {err && <p role="alert" className="text-xs text-danger">{err}</p>}
              <Button full type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending...' : 'Email my parent'}</Button>
            </form>
            {onBack && <Button full variant="ghost" onClick={onBack}>I entered the wrong age</Button>}
          </>
        ) : declined ? (
          <>
            <div className="font-bold text-3xl text-ink leading-tight">Not approved</div>
            <p className="text-sm text-ink-2">Your parent didn't approve your account, so it stays locked. If that was a mistake, ask them again. To have the account deleted, email athrionsportapp@gmail.com from this account's address.</p>
            {err && <p role="alert" className="text-xs text-danger">{err}</p>}
            <Button full onClick={() => setEditing(true)}>Ask again</Button>
          </>
        ) : (
          <>
            <div className="text-center">
              <Icon icon="mdi:email-fast-outline" width={48} className="mx-auto text-neon-ink" aria-hidden="true" />
              <div className="font-bold text-3xl text-ink leading-tight mt-3">Waiting for your parent</div>
              <p className="text-sm text-ink-2 mt-2">We emailed <span className="font-semibold text-ink break-all">{consent?.parent_email}</span>. Ask them to open it and approve. This screen opens the app once they do.</p>
              {swimInvite && <p className="text-xs text-muted mt-2">Your swim coach can see your nickname and that you're waiting for a parent's OK.</p>}
            </div>
            {sent && <p role="status" className="text-sm text-neon-ink text-center">Sent again.</p>}
            {err && <p role="alert" className="text-xs text-danger text-center">{err}</p>}
            <Button full onClick={() => onChanged?.()} icon="mdi:refresh">They approved, check again</Button>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
              <Button variant="secondary" disabled={busy} onClick={() => send(consent.parent_email)}>{busy ? 'Sending...' : 'Send again'}</Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>Change email</Button>
            </div>
          </>
        )}
        <button type="button" onClick={() => signOut()} className="press w-full min-h-[44px] text-sm font-semibold text-muted hover:text-ink">Sign out</button>
      </div>
    </div>
  )
}
