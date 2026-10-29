import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, InlineError } from './ui/index.js'
import { fetchReviews, fetchReviewSummary, fetchMyReview, saveMyReview, deleteMyReview, fetchAllReviews, setReviewHidden, shortName } from '../lib/reviews.js'
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

// Landing page: the average, how many, and the latest reviews; before the first one, an invitation
export function LandingReviews({ onWrite }) {
  const [state, setState] = useState({ summary: { average: null, count: 0 }, reviews: [] })
  useEffect(() => {
    Promise.all([fetchReviewSummary(), fetchReviews(6)])
      .then(([summary, reviews]) => setState({ summary, reviews }))
      .catch(() => {})
  }, [])
  const { summary, reviews } = state

  return (
    <section className="max-w-5xl mx-auto px-4 pb-14" aria-labelledby="reviews">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 id="reviews" className="font-bold text-3xl text-ink">Reviews</h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {summary.count > 0 ? (
              <>
                <span className="font-bold text-4xl text-ink tabular-nums leading-none">{summary.average.toFixed(1)}</span>
                <span>
                  <Stars value={summary.average} size={20} />
                  <span className="block text-xs text-muted">{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</span>
                </span>
              </>
            ) : (
              <><Stars value={0} size={20} /><span className="text-sm text-muted">Be the first to review ATHRION.</span></>
            )}
          </div>
        </div>
        <Button variant="secondary" icon="mdi:pencil-outline" onClick={onWrite}>Write a review</Button>
      </div>
      {reviews.length > 0 && <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))' }}>
        {reviews.map(r => (
          <figure key={`${r.created_at}-${r.name}`} className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-2">
            <Stars value={r.rating} size={16} />
            <blockquote className="text-sm text-ink-2 whitespace-pre-line break-words grow">{r.body}</blockquote>
            <figcaption className="text-xs text-muted"><span className="font-semibold text-ink">{r.name}</span> · {fmtDate(r.created_at)}</figcaption>
          </figure>
        ))}
      </div>}
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

  const ok = name.trim().length >= 1 && rating >= 1 && body.trim().length >= 10
  async function save() {
    setBusy(true); setErr('')
    try { await saveMyReview({ name, rating, body }); setSaved(true); setMine(await fetchMyReview()) }
    catch (e) { setErr(e.message || 'Could not save') } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm('Delete your review?')) return
    await deleteMyReview(); setMine(null); setRating(0); setBody(''); setSaved(false)
  }
  async function toggle(r) {
    await setReviewHidden(r.user_id, !r.hidden)
    setAll(list => list.map(x => (x.user_id === r.user_id ? { ...x, hidden: !r.hidden } : x)))
  }

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
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} ${i === 1 ? 'star' : 'stars'}`} aria-pressed={rating === i}
                  className="press w-11 h-11 flex items-center justify-center rounded-lg">
                  <Icon icon={i <= rating ? 'mdi:star' : 'mdi:star-outline'} width={32} className={i <= rating ? 'text-neon-ink' : 'text-muted'} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Your review</span>
            <textarea value={body} maxLength={600} onChange={e => { setBody(e.target.value); setSaved(false) }} rows={4}
              placeholder="What do you like, and what could be better?"
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-neon-stroke/40 resize-none" />
            <span className="block text-xs text-muted text-right tabular-nums">{body.length}/600</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Shown as</span>
            <input value={name} maxLength={40} onChange={e => { setName(e.target.value); setSaved(false) }}
              className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-neon-stroke/40" />
          </label>
          {mine?.hidden && <p className="text-xs text-warn">Your review was hidden for breaking the terms. Email athrionsportapp@gmail.com about it.</p>}
          {err && <InlineError>{err}</InlineError>}
          <Button full icon={saved ? 'mdi:check' : 'mdi:send-outline'} onClick={save} disabled={!ok || busy || saved}>
            {busy ? 'Saving…' : saved ? 'Saved' : mine ? 'Update review' : 'Post review'}
          </Button>
          {mine && <button onClick={remove} className="press w-full min-h-[44px] text-sm font-semibold text-muted hover:text-danger">Delete my review</button>}
        </div>
      )}

      {admin && all && (
        <section className="mt-8 space-y-2" aria-label="All reviews">
          <h3 className="text-lg font-semibold text-ink">All reviews (admin)</h3>
          {all.map(r => (
            <div key={r.user_id} className={`border rounded-xl p-3 space-y-1 ${r.hidden ? 'border-danger/30 opacity-60' : 'border-line'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} size={14} />
                <span className="text-xs font-semibold text-ink">{r.name}</span>
                <button onClick={() => toggle(r)} className="press ml-auto text-xs font-semibold text-ink-2 hover:text-ink min-h-[32px] px-2">{r.hidden ? 'Show' : 'Hide'}</button>
              </div>
              <p className="text-sm text-ink-2 break-words">{r.body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
