import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button, InlineError } from './ui/index.js'
import { fetchReviews, fetchReviewSummary, fetchMyReview, saveMyReview, deleteMyReview, fetchAllReviews, setReviewHidden, sendPublicReview, shortName, reviewProblem } from '../lib/reviews.js'
import { fetchIsAdmin } from '../lib/coachApi.js'

const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// Five stars filled to `value`, to the nearest half
export function Stars({ value, size = 18, className = '' }) {
  const v = Math.round(value * 2) / 2
  return (
    <span className={`inline-flex ${className}`} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => {
        const icon = i <= v ? 'mdi:star' : i - 0.5 === v ? 'mdi:star-half-full' : 'mdi:star-outline'
        return <Icon key={i} icon={icon} width={size} className={icon === 'mdi:star-outline' ? 'text-muted' : 'text-neon-ink'} aria-hidden="true" />
      })}
    </span>
  )
}

// Tap a star to rate 1 to 5
export function StarPicker({ value, onChange, size = 32 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)} aria-label={`${i} ${i === 1 ? 'star' : 'stars'}`} aria-pressed={value === i}
          className="press w-11 h-11 flex items-center justify-center rounded-lg">
          <Icon icon={i <= value ? 'mdi:star' : 'mdi:star-outline'} width={size} className={i <= value ? 'text-neon-ink' : 'text-muted'} />
        </button>
      ))}
    </div>
  )
}

const FIELD = 'mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40'

// The landing page form: anyone can write one; it shows after an admin approves it
function PublicReviewForm({ onClose }) {
  const [f, setFields] = useState({ name: '', rating: 0, body: '', website: '' })
  const setF = u => { setFields(u); setErr('') }
  const [state, setState] = useState('idle') // idle | sending | sent
  const [err, setErr] = useState('')
  const problem = reviewProblem(f)

  async function send(e) {
    e.preventDefault()
    if (problem) return setErr(problem)
    setState('sending'); setErr('')
    try { await sendPublicReview(f); setState('sent') } catch (x) { setErr(x.message); setState('idle') }
  }

  if (state === 'sent') return (
    <div role="status" className="bg-surface border border-neon-stroke/30 rounded-2xl p-5 flex flex-wrap items-center gap-3 text-left">
      <Icon icon="mdi:check-circle-outline" width={28} className="text-neon-ink" aria-hidden="true" />
      <div className="grow basis-0 min-w-[12rem]">
        <div className="font-semibold text-ink">Thanks for your review</div>
        <div className="text-sm text-muted">It shows here once it's approved.</div>
      </div>
      <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
    </div>
  )

  return (
    <form onSubmit={send} className="bg-surface border border-line rounded-2xl p-5 space-y-4 max-w-xl text-left">
      <fieldset>
        <legend className="text-sm font-semibold text-ink mb-1">Your rating</legend>
        <StarPicker value={f.rating} onChange={rating => setF(v => ({ ...v, rating }))} />
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Your review</span>
        <textarea value={f.body} maxLength={600} rows={4} onChange={e => setF(v => ({ ...v, body: e.target.value }))}
          placeholder="What do you like, and what could be better?" className={`${FIELD} resize-none`} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Your name</span>
        <input value={f.name} maxLength={40} onChange={e => setF(v => ({ ...v, name: e.target.value }))} placeholder="Sam T." className={FIELD} />
      </label>
      {/* Left empty by people; bots fill it */}
      <label className="sr-only" aria-hidden="true">Website
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF(v => ({ ...v, website: e.target.value }))} />
      </label>
      {err ? <InlineError>{err}</InlineError> : problem && f.body && <p className="text-xs text-muted">{problem}</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button type="submit" icon="mdi:send-outline" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send review'}</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// True once the element has been on screen (stays true), so the section animates when it's reached
function useSeen() {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen]
}

// A slide-up that waits for its turn: invisible until the section is reached, then in order
const reveal = (seen, i) => (seen
  ? { className: 'slide-up', style: { animationDelay: `${i * 90}ms`, animationFillMode: 'both' } }
  : { className: 'opacity-0', style: undefined })

// Five big stars lighting up one after another, again and again, as someone rating
function RatingStars() {
  const still = reducedMotion()
  const [lit, setLit] = useState(still ? 5 : 0)
  useEffect(() => {
    if (still) return
    let n = 0
    const t = setInterval(() => { n = (n + 1) % 10; setLit(Math.min(5, n)) }, 380) // 5 fill, then a pause
    return () => clearInterval(t)
  }, [still])
  return (
    <div className="flex justify-center gap-1.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`transition-transform duration-300 ${i <= lit ? 'scale-110' : 'scale-100'}`}>
          <Icon icon={i <= lit ? 'mdi:star' : 'mdi:star-outline'} width={44} className={i <= lit ? 'text-neon-ink' : 'text-line-strong'} />
        </span>
      ))}
    </div>
  )
}

const PROMPTS = ['What helped you most?', 'What should be better?', 'Would you tell a friend?', 'How did your training change?']

// Questions to start from, one at a time
function RotatingPrompt() {
  const still = reducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (still) return
    const t = setInterval(() => setI(n => (n + 1) % PROMPTS.length), 2600)
    return () => clearInterval(t)
  }, [still])
  return (
    <div className="h-8 overflow-hidden" aria-hidden="true">
      <div key={i} className="slide-up text-xl font-semibold text-neon-ink">{PROMPTS[i]}</div>
    </div>
  )
}

// The average counting up from 0 once the section is reached
function CountUp({ value, run }) {
  const [v, setV] = useState(reducedMotion() ? value : 0)
  useEffect(() => {
    if (!run || reducedMotion()) { if (run) setV(value); return }
    const start = performance.now()
    let raf
    const frame = now => {
      const k = Math.min(1, (now - start) / 900)
      setV(value * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [value, run])
  return v.toFixed(1)
}

const initial = name => (String(name || '?').trim()[0] || '?').toUpperCase()

// Landing page: before the first review, a big invitation to write one; then the average, how many,
// and the latest reviews, each sliding in as the section is reached. Only real, approved reviews.
export function LandingReviews() {
  const [writing, setWriting] = useState(false)
  const [state, setState] = useState({ summary: { average: null, count: 0 }, reviews: [] })
  const [ref, seen] = useSeen()
  useEffect(() => {
    Promise.all([fetchReviewSummary(), fetchReviews(6)])
      .then(([summary, reviews]) => setState({ summary, reviews }))
      .catch(() => {})
  }, [])
  const { summary, reviews } = state
  const has = summary.count > 0
  const form = writing && <div className="slide-up mt-8 text-left max-w-xl mx-auto"><PublicReviewForm onClose={() => setWriting(false)} /></div>

  if (!has) return (
    <section ref={ref} className="max-w-5xl mx-auto px-4 py-20" aria-labelledby="reviews">
      <div className="bg-surface border border-line rounded-3xl px-5 py-12 xs:px-8 text-center">
        <RatingStars />
        {/* Before the first review, an invitation rather than "Reviews" with no stars, which reads as no users */}
        <h2 id="reviews" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight mt-6">Tried ATHRION?</h2>
        <p className="text-lg text-ink-2 mt-4 max-w-md mx-auto">Tell people what it did for your training. Your review shows here after a quick check.</p>
        <div className="mt-5"><RotatingPrompt /></div>
        {!writing && (
          <div className="mt-7 max-w-xs mx-auto">
            <Button full icon="mdi:pencil-outline" onClick={() => setWriting(true)}>Write a review</Button>
          </div>
        )}
        {form}
      </div>
    </section>
  )

  return (
    <section ref={ref} className="max-w-5xl mx-auto px-4 py-20" aria-labelledby="reviews">
      <div className="text-center">
        <h2 id="reviews" className="font-bold text-4xl xs:text-5xl leading-[1.05] tracking-tight">What people <span className="text-neon-ink">say</span>.</h2>
        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="font-bold text-6xl text-ink tabular-nums leading-none"><CountUp value={summary.average} run={seen} /></span>
          <span className="text-left">
            <span className="flex" role="img" aria-label={`${summary.average.toFixed(1)} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map(i => {
                const v = Math.round(summary.average * 2) / 2
                const icon = i <= v ? 'mdi:star' : i - 0.5 === v ? 'mdi:star-half-full' : 'mdi:star-outline'
                return (
                  <span key={i} className={seen ? 'pop-in' : 'opacity-0'} style={{ animationDelay: `${200 + i * 110}ms` }}>
                    <Icon icon={icon} width={28} className={icon === 'mdi:star-outline' ? 'text-muted' : 'text-neon-ink'} aria-hidden="true" />
                  </span>
                )
              })}
            </span>
            <span className="block text-sm text-muted mt-0.5">{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</span>
          </span>
        </div>
        {!writing && (
          <div className="mt-6">
            <Button variant="secondary" icon="mdi:pencil-outline" onClick={() => setWriting(true)}>Write a review</Button>
          </div>
        )}
      </div>
      {form}
      {reviews.length > 0 && (
        <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))' }}>
          {reviews.map((r, i) => {
            const rv = reveal(seen, i + 2)
            return (
              <figure key={`${r.created_at}-${r.name}`} className={`bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3 ${rv.className}`} style={rv.style}>
                <div className="flex items-center justify-between gap-2">
                  <Icon icon="mdi:format-quote-open" width={32} className="text-neon-ink" aria-hidden="true" />
                  <Stars value={r.rating} size={18} />
                </div>
                <blockquote className="text-base text-ink whitespace-pre-line break-words grow">{r.body}</blockquote>
                <figcaption className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-raised text-ink font-bold flex items-center justify-center flex-shrink-0" aria-hidden="true">{initial(r.name)}</span>
                  <span className="text-sm min-w-0">
                    <span className="block font-semibold text-ink break-words">{r.name}</span>
                    <span className="block text-xs text-muted">{fmtDate(r.created_at)}</span>
                  </span>
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}
    </section>
  )
}

// In the app (You → Rate ATHRION): write or change your review. Admins also see every review to hide spam.
export function ReviewScreen({ session, onBack }) {
  const [mine, setMine] = useState(undefined)
  const [name, setName] = useState(shortName(session?.name))
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [all, setAll] = useState(null)

  useEffect(() => {
    fetchMyReview().then(r => {
      setMine(r ?? null)
      if (r) { setName(r.name); setRating(r.rating); setBody(r.body) }
    }).catch(() => setMine(null))
    fetchIsAdmin().then(a => { setAdmin(a); if (a) fetchAllReviews().then(setAll).catch(() => {}) }).catch(() => {})
  }, [])

  const problem = reviewProblem({ name, rating, body })
  async function save() {
    if (problem) return setErr(problem)
    setBusy(true); setErr('')
    try { await saveMyReview({ name, rating, body }); setSaved(true); setMine(await fetchMyReview()) }
    catch (e) { setErr(e.message || 'Could not save') } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm('Delete your review?')) return
    await deleteMyReview(); setMine(null); setRating(0); setBody(''); setSaved(false)
  }
  async function toggle(r) {
    await setReviewHidden(r.id, !r.hidden)
    setAll(list => list.map(x => (x.id === r.id ? { ...x, hidden: !r.hidden, seen: true } : x)))
  }
  // From the landing page and not yet shown: waiting for approval, listed first
  const waiting = r => r.hidden && !r.user_id && !r.seen

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Back"
          className="press w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised transition-colors">
          <Icon icon="mdi:chevron-left" width={24} />
        </button>
        <div className="font-bold text-base">Rate ATHRION</div>
      </div>

      {mine === undefined ? <div className="h-40" /> : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Your review shows on athrion.app with the name below. You can change or delete it any time.</p>
          <fieldset>
            <legend className="text-sm font-semibold text-ink mb-1.5">Your rating</legend>
            <StarPicker value={rating} onChange={v => { setRating(v); setSaved(false); setErr('') }} />
          </fieldset>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Your review</span>
            <textarea value={body} maxLength={600} onChange={e => { setBody(e.target.value); setSaved(false); setErr('') }} rows={4}
              placeholder="What do you like, and what could be better?"
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40 resize-none" />
            <span className="block text-xs text-muted text-right tabular-nums">{body.length}/600</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Shown as</span>
            <input value={name} maxLength={40} onChange={e => { setName(e.target.value); setSaved(false); setErr('') }}
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-neon-stroke/40" />
          </label>
          {mine?.hidden && <p className="text-xs text-warn">Your review was hidden for breaking the terms. Email athrionsportapp@gmail.com about it.</p>}
          {err && <InlineError>{err}</InlineError>}
          {!err && problem && body && <p className="text-xs text-muted">{problem}</p>}
          <Button full icon={saved ? 'mdi:check' : 'mdi:send-outline'} onClick={save} disabled={busy || saved}>
            {busy ? 'Saving…' : saved ? 'Saved' : mine ? 'Update review' : 'Post review'}
          </Button>
          {mine && <button onClick={remove} className="press w-full min-h-[44px] text-sm font-semibold text-muted hover:text-danger">Delete my review</button>}
        </div>
      )}

      {admin && all && (
        <section className="mt-8 space-y-2" aria-label="All reviews">
          <h3 className="text-lg font-semibold text-ink">All reviews (admin)</h3>
          <p className="text-xs text-muted">Reviews from the website wait here until you show them.</p>
          {[...all].sort((a, b) => waiting(b) - waiting(a)).map(r => (
            <div key={r.id} className={`border rounded-xl p-3 space-y-1 ${waiting(r) ? 'border-neon-stroke/40' : r.hidden ? 'border-danger/30 opacity-60' : 'border-line'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} size={14} />
                <span className="text-xs font-semibold text-ink">{r.name}</span>
                {waiting(r) && <span className="text-xs font-semibold text-neon-ink">Waiting</span>}
                {!r.user_id && !waiting(r) && <span className="text-xs text-muted">Website</span>}
                <button onClick={() => toggle(r)} className={`press ml-auto text-xs font-semibold min-h-[32px] px-2 rounded-md ${waiting(r) ? 'bg-neon text-on-neon' : 'text-ink-2 hover:text-ink'}`}>
                  {waiting(r) ? 'Approve' : r.hidden ? 'Show' : 'Hide'}
                </button>
              </div>
              <p className="text-sm text-ink-2 break-words">{r.body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
