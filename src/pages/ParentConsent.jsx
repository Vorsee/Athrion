import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '../components/ui/index.js'
import Brand from '../components/Brand.jsx'
import { viewConsent, decideConsent, MINOR_LIMITS } from '../lib/parentConsent.js'

const COLLECTS = [
  'Their name, email and the nickname they pick',
  'Age, sex, height and weight, to work out calorie and protein targets',
  'The workouts, swims, runs, meals and weigh-ins they log, and photos they add',
  'If they join a swim team or a trainer: that coach sees their training',
]

// athrion.app/parent/<token>: the page a parent opens from the email. Works signed in or out.
export default function ParentConsent({ token, onDone }) {
  const [info, setInfo] = useState(undefined) // undefined loading, null bad link
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { viewConsent(token).then(setInfo).catch(e => { setErr(e.message); setInfo(null) }) }, [token])

  async function decide(approve) {
    setBusy(true); setErr('')
    try { setResult((await decideConsent(token, approve)).status) } catch (e) { setErr(e.message); setBusy(false) }
  }
  const status = result ?? info?.status
  const name = info?.childName ?? 'Your child'

  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm px-4 pt-safe-10 pb-safe-10">
      <div className="max-w-md mx-auto space-y-6">
        <Brand />
        {info === undefined ? <p className="text-sm text-muted">Loading...</p>
          : info === null ? (
            <div className="space-y-3">
              <h1 className="font-bold text-3xl leading-tight">This link doesn't work any more</h1>
              <p className="text-ink-2">{err || 'It may have been replaced by a newer email.'} Use the latest email, or ask your child to send it again.</p>
            </div>
          ) : status === 'approved' ? (
            <div className="space-y-3">
              <Icon icon="mdi:check-circle-outline" width={48} className="text-neon-ink" aria-hidden="true" />
              <h1 className="font-bold text-3xl leading-tight">{name} can use ATHRION</h1>
              <p className="text-ink-2">Thank you. To have their account and data deleted at any time, email athrionsportapp@gmail.com.</p>
              {onDone && <Button onClick={onDone}>Close</Button>}
            </div>
          ) : status === 'declined' ? (
            <div className="space-y-3">
              <h1 className="font-bold text-3xl leading-tight">Not approved</h1>
              <p className="text-ink-2">{name}'s account stays locked. To have it deleted now, email athrionsportapp@gmail.com.</p>
              {onDone && <Button variant="secondary" onClick={onDone}>Close</Button>}
            </div>
          ) : (
            <>
              <div>
                <h1 className="font-bold text-3xl leading-tight">{name} ({info.childAge}) asked to use ATHRION</h1>
                <p className="text-ink-2 mt-3">ATHRION is a fitness app for workouts, swimming, running and food. Because {name} is under 16, they can only use it with your approval.</p>
              </div>
              <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
                <h2 className="font-semibold">What we collect</h2>
                <ul className="space-y-1.5">{COLLECTS.map(c => <li key={c} className="flex gap-2 text-sm text-ink-2"><Icon icon="mdi:check" width={18} className="text-neon-ink flex-shrink-0 mt-0.5" aria-hidden="true" />{c}</li>)}</ul>
                <p className="text-sm text-muted">Never sold, no ads, no third-party trackers.</p>
              </section>
              <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
                <h2 className="font-semibold">Switched off until 16</h2>
                <ul className="space-y-1.5">{MINOR_LIMITS.map(c => <li key={c} className="flex gap-2 text-sm text-ink-2"><Icon icon="mdi:minus-circle-outline" width={18} className="text-muted flex-shrink-0 mt-0.5" aria-hidden="true" />{c}</li>)}</ul>
              </section>
              <label className="flex gap-3 items-start cursor-pointer">
                <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 w-5 h-5 accent-[rgb(var(--neon))] flex-shrink-0" />
                <span className="text-sm text-ink-2">
                  I'm {name}'s parent or legal guardian. I agree to the <a href="/terms.html" target="_blank" rel="noreferrer" className="underline underline-offset-2">Terms of use</a> and
                  the <a href="/privacypolicy.html" target="_blank" rel="noreferrer" className="underline underline-offset-2">Privacy policy</a> for them,
                  including ATHRION using their health and fitness information to run the app.
                </span>
              </label>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))' }}>
                <Button onClick={() => decide(true)} disabled={!agree || busy}>Approve</Button>
                <Button variant="secondary" onClick={() => decide(false)} disabled={busy}>Decline</Button>
              </div>
              <p className="text-xs text-muted">You can withdraw this any time: email athrionsportapp@gmail.com and we delete the account and its data.</p>
            </>
          )}
      </div>
    </div>
  )
}
