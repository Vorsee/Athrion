import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Sheet } from './ui/index.js'
import { REPORT_REASONS, reportUser, blockUser } from '../lib/safetyApi.js'

// Report or block someone (037), from a room, the people you trained with, or Friends.
// person: { id, name } in a room, or { nickname, name } from Friends. sessionId: the room it happened in, if any.
export default function PersonSafetySheet({ person, sessionId = null, onClose, onBlocked }) {
  const [mode, setMode] = useState('menu') // menu | report | block | reported
  const [reason, setReason] = useState(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const who = `@${String(person.name || '').replace(/^@/, '')}`

  async function run(fn, after) {
    setBusy(true); setError('')
    try { await fn(); after() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <Sheet title={mode === 'report' ? `Report ${who}` : mode === 'block' ? `Block ${who}?` : mode === 'reported' ? 'Report sent' : who} onClose={onClose}>
      {mode === 'menu' && (
        <div className="space-y-2">
          <MenuRow icon="mdi:flag-outline" title={`Report ${who}`} meta="Tell the ATHRION team something's wrong" onClick={() => setMode('report')} />
          <MenuRow icon="mdi:account-cancel-outline" danger title={`Block ${who}`} meta="They can't join your rooms or add you" onClick={() => setMode('block')} />
        </div>
      )}

      {mode === 'report' && (
        <>
          <div role="radiogroup" aria-label="What's wrong" className="space-y-2">
            {REPORT_REASONS.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={reason === id} onClick={() => setReason(id)}
                className={`press w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${reason === id ? 'bg-neon-tint border-neon-stroke/50 text-ink font-semibold' : 'bg-raised border-line text-ink-2'}`}>
                <span aria-hidden="true" className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${reason === id ? 'border-neon-stroke' : 'border-line-strong'}`}>
                  {reason === id && <span className="w-2.5 h-2.5 rounded-full bg-neon pop-in" />}
                </span>
                {label}
              </button>
            ))}
          </div>
          <textarea value={details} onChange={e => setDetails(e.target.value.slice(0, 500))} rows={3} aria-label="More details (optional)"
            placeholder="More details (optional)"
            className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button full icon="mdi:send-outline" disabled={!reason || busy}
            onClick={() => run(() => reportUser(person, reason, details, sessionId), () => setMode('reported'))}>
            {busy ? 'Sending…' : 'Send report'}
          </Button>
          <p className="text-xs text-muted">{who} isn't told who reported them.</p>
        </>
      )}

      {mode === 'reported' && (
        <>
          <div className="flex items-center gap-3 bg-raised rounded-xl px-3 py-3 pop-in">
            <Icon icon="mdi:check-circle-outline" width={24} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-ink">Thanks. The ATHRION team will look at it.</p>
          </div>
          <Button full variant="secondary" icon="mdi:account-cancel-outline" onClick={() => setMode('block')}>Also block {who}</Button>
          <Button full variant="ghost" onClick={onClose}>Done</Button>
        </>
      )}

      {mode === 'block' && (
        <>
          <ul className="space-y-2 text-sm text-ink-2">
            {["They can't join rooms you host, and leave the one you're in now if you're the host.",
              "They can't send you friend requests, and your friendship ends.",
              "They aren't told. You can unblock them in Friends."].map(t => (
              <li key={t} className="flex gap-2"><Icon icon="mdi:circle-small" width={20} className="flex-shrink-0 text-muted" aria-hidden="true" />{t}</li>
            ))}
          </ul>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => run(() => blockUser(person), () => { onBlocked?.(person); onClose() })}>
              {busy ? 'Blocking…' : 'Block'}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function MenuRow({ icon, title, meta, danger = false, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="press w-full flex items-center gap-3 rounded-xl bg-raised border border-transparent hover:border-line-strong px-3 py-3 text-left">
      <Icon icon={icon} width={22} className={`flex-shrink-0 ${danger ? 'text-danger' : 'text-ink-2'}`} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{title}</span>
        <span className="block text-xs text-muted">{meta}</span>
      </span>
      <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />
    </button>
  )
}
