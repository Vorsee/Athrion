import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, SectionTitle, Fact, Tag, EmptyState, SkeletonRows, InlineError, PageHeader } from './ui/index.js'
import { getExerciseIcon, EXERCISES } from '../lib/data.js'
import { restLabel } from '../lib/groupPlan.js'
import {
  fetchShop, fetchMyPurchases, fetchContent, fetchProduct, fetchCoach, claimFree, buyProduct,
  avatarUrl, priceText, toPlanDay,
} from '../lib/coachApi.js'
import { currentUserId } from '../lib/groupApi.js'
import { CoachNote } from './CoachVideo.jsx'
import { productLink, coachLink, shareLink } from '../lib/shopLink.js'

export const KIND_LABEL = { workout: 'Workout', plan: 'Week plan' }

export function Avatar({ coach, size = 40 }) {
  const url = avatarUrl(coach?.avatar_path)
  return url ? (
    <img src={url} alt="" width={size} height={size} loading="lazy" className="rounded-full object-cover flex-shrink-0 bg-raised" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-neon/15 border border-neon-stroke/20 flex items-center justify-center flex-shrink-0 font-bold text-neon-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {(coach?.display_name || '?')[0].toUpperCase()}
    </span>
  )
}

function ProductRow({ product, coach, onOpen, owned }) {
  const count = product.kind === 'plan'
    ? `${product.outline.filter(d => !d.rest).length} training days`
    : `${product.outline.length} exercises`
  return (
    <button type="button" onClick={onOpen}
      className="press w-full text-left bg-surface border border-line hover:border-neon-stroke/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors">
      <Icon icon={product.kind === 'plan' ? 'mdi:calendar-week' : 'mdi:dumbbell'} width={24} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-sm text-ink truncate">{product.title}</span>
        <span className="block text-xs text-muted truncate">
          {coach ? `${coach.display_name} · ` : ''}{KIND_LABEL[product.kind]} · {count}
        </span>
      </span>
      {owned
        ? <Tag tone="neon-ink"><Icon icon="mdi:check" width={14} aria-hidden="true" />Yours</Tag>
        : <span className="text-sm font-bold text-neon-ink tabular-nums flex-shrink-0">{priceText(product.price_cents)}</span>}
    </button>
  )
}

// A small "Share" button for a product or coach link; says "Link copied" where there's no share sheet
function ShareButton({ url, text }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    if (await shareLink(url, text)) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  return (
    <Button size="sm" variant="secondary" icon={copied ? 'mdi:check' : 'mdi:share-variant-outline'} onClick={share}>
      {copied ? 'Link copied' : 'Share'}
    </Button>
  )
}

// Matches a product or coach against the search: title, coach name, specialty, level or kind
const matches = (q, ...fields) => fields.some(f => f && String(f).toLowerCase().includes(q))

// The shop on the Coaches tab. intent: { product, paid } after a Stripe checkout (paid: it went through),
// or { coach } from a shared coach link.
// onDeepChange(true) while a coach or product is open, so Library can hide its own header
export default function Shop({ onStartPlanDay, onOpenCoach, intent, onIntentDone, onDeepChange }) {
  const [shop, setShop] = useState(null)
  const [owned, setOwned] = useState(new Set())
  const [error, setError] = useState('')
  const [coachId, setCoachId] = useState(intent?.coach ?? null)
  const [query, setQuery] = useState('')
  const [productId, setProductId] = useState(intent?.product ?? null)
  const [justBought, setJustBought] = useState(!!intent?.paid)

  function load() {
    setError('')
    Promise.all([fetchShop(), fetchMyPurchases()])
      .then(([s, mine]) => { setShop(s); setOwned(new Set(mine.map(p => p.product_id))) })
      .catch(() => setError("Couldn't load the shop."))
  }
  useEffect(load, [])
  useEffect(() => {
    if (intent?.product) { setProductId(intent.product); setJustBought(!!intent.paid) }
    if (intent?.coach) { setProductId(null); setCoachId(intent.coach) }
    if (intent) onIntentDone?.()
  }, [intent])

  useEffect(() => { onDeepChange?.(!!(coachId || productId)) }, [coachId, productId])
  useBackHandler(!!coachId && !productId, () => setCoachId(null), 'Coaches', 'Coach')
  useBackHandler(!!productId, () => { setProductId(null); setJustBought(false) }, 'Coaches', 'Workout')

  const coachOf = id => shop?.coaches.find(c => c.user_id === id)

  if (productId) return (
    <ProductPage productId={productId} coach={coachOf(shop?.products.find(p => p.id === productId)?.coach_id)}
      justBought={justBought} onStartPlanDay={onStartPlanDay}
      onOpenCoach={id => { setProductId(null); setCoachId(id) }}
      onOwned={id => setOwned(prev => new Set(prev).add(id))} />
  )

  if (coachId && shop) {
    const coach = coachOf(coachId)
    if (coach) return <CoachPage coach={coach} products={shop.products.filter(p => p.coach_id === coachId)} owned={owned} onOpenProduct={setProductId} />
  }

  if (error) return <InlineError onRetry={load}>{error}</InlineError>
  if (!shop) return <SkeletonRows rows={4} label="Loading the shop" />

  const mine = shop.products.filter(p => owned.has(p.id))
  const coachesWithProducts = shop.coaches
    .map(c => ({ ...c, count: shop.products.filter(p => p.coach_id === c.user_id).length }))
    .filter(c => c.count > 0)
  const q = query.trim().toLowerCase()
  const shownCoaches = q ? coachesWithProducts.filter(c => matches(q, c.display_name, c.credentials, ...c.specialties)) : coachesWithProducts
  const shownProducts = q
    ? shop.products.filter(p => matches(q, p.title, p.summary, p.level, KIND_LABEL[p.kind], coachOf(p.coach_id)?.display_name, ...(coachOf(p.coach_id)?.specialties ?? [])))
    : shop.products.slice(0, 12)

  return (
    <div className="space-y-5">
      {mine.length > 0 && (
        <section>
          <SectionTitle action={<Fact icon="mdi:check">{mine.length}</Fact>}>Your coach workouts</SectionTitle>
          <div className="space-y-2">
            {mine.map(p => <ProductRow key={p.id} product={p} coach={coachOf(p.coach_id)} owned onOpen={() => setProductId(p.id)} />)}
          </div>
        </section>
      )}

      {coachesWithProducts.length === 0 ? (
        <EmptyState icon="mdi:storefront-outline" title="No coaches yet"
          action="Become a coach" actionIcon="mdi:whistle-outline" onAction={onOpenCoach}>
          Coaches will sell their workouts and week plans here, with tips and videos.
        </EmptyState>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">Search the shop</span>
            <Icon icon="mdi:magnify" width={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search coaches, workouts, specialties"
              className="w-full min-h-[44px] bg-surface border border-line rounded-2xl pl-11 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-neon-stroke/50" />
          </label>

          {q && shownCoaches.length === 0 && shownProducts.length === 0 && (
            <p className="text-sm text-muted text-center py-4">Nothing matches "{query.trim()}".</p>
          )}

          {shownCoaches.length > 0 && <section>
            <SectionTitle>Coaches</SectionTitle>
            <div className="space-y-2">
              {shownCoaches.map(c => (
                <button key={c.user_id} type="button" onClick={() => setCoachId(c.user_id)}
                  className="press w-full text-left bg-surface border border-line hover:border-neon-stroke/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors">
                  <Avatar coach={c} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-ink truncate">{c.display_name}</span>
                    <span className="block text-xs text-muted truncate">{c.specialties.join(' · ') || 'Coach'}</span>
                  </span>
                  <span className="text-xs text-muted flex-shrink-0 tabular-nums">{c.count} for sale</span>
                  <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>}

          {shownProducts.length > 0 && <section>
            <SectionTitle>{q ? 'Workouts and plans' : 'New in the shop'}</SectionTitle>
            <div className="space-y-2">
              {shownProducts.map(p => (
                <ProductRow key={p.id} product={p} coach={coachOf(p.coach_id)} owned={owned.has(p.id)} onOpen={() => setProductId(p.id)} />
              ))}
            </div>
          </section>}
        </>
      )}

      {coachesWithProducts.length > 0 && <button type="button" onClick={onOpenCoach}
        className="press w-full min-h-[44px] text-sm font-semibold text-ink-2 hover:text-ink inline-flex items-center justify-center gap-1.5">
        <Icon icon="mdi:whistle-outline" width={18} aria-hidden="true" />Are you a coach? Sell your workouts
      </button>}
    </div>
  )
}

function CoachPage({ coach, products, owned, onOpenProduct }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar coach={coach} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-2xl text-ink leading-tight break-words">{coach.display_name}</h2>
          {coach.credentials && <div className="text-sm text-muted mt-0.5">{coach.credentials}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Fact icon="mdi:check-decagram-outline">Reviewed coach</Fact>
        {coach.specialties.map(s => <Fact key={s}>{s}</Fact>)}
      </div>
      <ShareButton url={coachLink(coach.user_id)} text={`${coach.display_name}'s workouts on ATHRION`} />
      {coach.bio && <p className="text-sm text-ink-2 whitespace-pre-line">{coach.bio}</p>}
      {coach.links && <p className="text-sm text-muted break-words">{coach.links}</p>}

      <section>
        <SectionTitle action={<Fact icon="mdi:storefront-outline">{products.length}</Fact>}>For sale</SectionTitle>
        <div className="space-y-2">
          {products.map(p => <ProductRow key={p.id} product={p} owned={owned.has(p.id)} onOpen={() => onOpenProduct(p.id)} />)}
        </div>
      </section>
    </div>
  )
}

// One exercise in a bought workout: sets, rest, and the coach's tip and video
function ExerciseDetail({ e }) {
  const [open, setOpen] = useState(false)
  const ex = EXERCISES.find(x => x.name === e.name)
  const extra = e.tip || e.video
  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <button type="button" onClick={() => extra && setOpen(!open)} aria-expanded={extra ? open : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${extra ? 'press' : 'cursor-default'}`}>
        <Icon icon={getExerciseIcon(ex)} width={22} className="flex-shrink-0 text-neon-ink" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm text-ink break-words">{e.name}</span>
          <span className="block text-xs text-muted">Rest {restLabel(e.restSeconds ?? 60).toLowerCase()}{e.video ? ' · Video' : ''}{e.tip ? ' · Tip' : ''}</span>
        </span>
        <span className="text-sm font-bold text-neon-ink tabular-nums flex-shrink-0">{e.sets} × {e.reps}</span>
        {extra && <Icon icon={open ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={18} className="text-muted flex-shrink-0" aria-hidden="true" />}
      </button>
      {open && <div className="px-3 pb-3"><CoachNote tip={e.tip} video={e.video} /></div>}
    </div>
  )
}

function ProductPage({ productId, coach: knownCoach, justBought, onStartPlanDay, onOpenCoach, onOwned }) {
  const [product, setProduct] = useState(null)
  const [coach, setCoach] = useState(knownCoach ?? null)
  const [content, setContent] = useState(undefined) // undefined = loading, null = not theirs yet
  const [claimed, setClaimed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    currentUserId().then(setMe).catch(() => {})
    fetchProduct(productId).then(p => {
      if (!alive) return
      if (!p) { setMissing(true); return }
      setProduct(p)
      if (!knownCoach) fetchCoach(p.coach_id).then(c => alive && setCoach(c)).catch(() => {})
    }).catch(() => alive && setError("Couldn't load this workout."))
    fetchMyPurchases().then(m => alive && setClaimed(m.some(x => x.product_id === productId))).catch(() => {})
    return () => { alive = false }
  }, [productId])

  // Back from Stripe the webhook may still be writing the purchase: check again for a while
  useEffect(() => {
    let alive = true, tries = 0, timer
    const check = () => fetchContent(productId).then(c => {
      if (!alive) return
      setContent(c)
      if (!c && justBought && ++tries < 10) timer = setTimeout(check, 2000)
      else if (c && justBought) onOwned?.(productId)
    }).catch(() => alive && setContent(null))
    check()
    return () => { alive = false; clearTimeout(timer) }
  }, [productId, justBought])

  if (missing) return <EmptyState icon="mdi:storefront-remove-outline" title="Not available">This workout isn't in the shop any more.</EmptyState>
  if (error) return <InlineError>{error}</InlineError>
  if (!product) return <SkeletonRows rows={4} label="Loading" />

  const mineAsCoach = me && product.coach_id === me
  const free = product.price_cents === 0
  // Free content is readable before claiming; show it once it's in their list
  const has = mineAsCoach || (content && (!free || claimed))
  const waiting = justBought && !content
  const days = content?.days ?? []
  const trainingDays = product.kind !== 'plan' ? 0
    : content?.days ? content.days.filter(d => !d.rest).length : product.outline.filter(d => !d.rest).length
  const canBuy = free || coach?.charges_enabled

  async function get() {
    setBusy(true); setError('')
    try {
      if (free) {
        await claimFree(productId)
        setClaimed(true); onOwned?.(productId)
        setContent(await fetchContent(productId))
        setBusy(false)
      } else {
        await buyProduct(productId) // leaves for Stripe
      }
    } catch (e) {
      setError(e.message || 'Something went wrong'); setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={product.kind === 'plan' ? 'mdi:calendar-week' : 'mdi:dumbbell'} title={product.title}
        facts={<>
          <Fact icon="mdi:tag-outline">{KIND_LABEL[product.kind]}</Fact>
          <Fact icon="mdi:signal-cellular-2">{product.level}</Fact>
          {product.minutes && <Fact icon="mdi:clock-outline">{product.minutes} min</Fact>}
          {product.kind === 'plan'
            ? <Fact icon="mdi:calendar-check-outline">{trainingDays} days a week</Fact>
            : <Fact icon="mdi:format-list-numbered">{product.outline.length} exercises</Fact>}
        </>} />

      {coach && (
        <button type="button" onClick={() => onOpenCoach(coach.user_id)}
          className="press flex items-center gap-3 min-h-[44px] text-left">
          <Avatar coach={coach} size={36} />
          <span className="text-sm"><span className="text-muted">By </span><span className="font-semibold text-ink">{coach.display_name}</span></span>
          <Icon icon="mdi:chevron-right" width={18} className="text-muted" aria-hidden="true" />
        </button>
      )}

      {product.summary && <p className="text-base text-ink-2">{product.summary}</p>}

      {product.published && <ShareButton url={productLink(product.id)} text={`${product.title} on ATHRION`} />}

      {!has && (
        <Card hero className="space-y-3">
          {waiting ? (
            <div role="status" className="flex items-center gap-2 text-sm text-ink-2">
              <Icon icon="mdi:progress-clock" width={20} className="text-neon-ink" aria-hidden="true" />
              Finishing your purchase…
            </div>
          ) : (
            <>
              <div className="font-bold text-3xl text-neon-ink tabular-nums">{priceText(product.price_cents)}</div>
              <Button full icon={free ? 'mdi:plus' : 'mdi:lock-open-variant-outline'} onClick={get} disabled={busy || !canBuy}>
                {busy ? (free ? 'Adding…' : 'Opening checkout…') : !canBuy ? 'Not on sale right now' : free ? 'Get it free' : `Buy for ${priceText(product.price_cents)}`}
              </Button>
              <p className="text-xs text-muted">
                {free ? 'Adds it to your coach workouts.' : 'One payment, no subscription. Yours to keep, with every tip and video.'}{' '}
                <a href="/terms.html#shop" className="underline underline-offset-2">Shop terms</a>
              </p>
            </>
          )}
          {error && <InlineError>{error}</InlineError>}
        </Card>
      )}

      {product.description && (
        <section>
          <SectionTitle>From the coach</SectionTitle>
          <p className="text-sm text-ink-2 whitespace-pre-line">{product.description}</p>
        </section>
      )}

      {has && content && product.kind === 'workout' && (
        <section className="space-y-2">
          <Button full icon="mdi:play" onClick={() => onStartPlanDay(toPlanDay(product.title, content.exercises ?? []))}
            disabled={!content.exercises?.length}>Start workout</Button>
          <SectionTitle>Exercises</SectionTitle>
          {(content.exercises ?? []).map((e, i) => <ExerciseDetail key={i} e={e} />)}
        </section>
      )}

      {has && content && product.kind === 'plan' && (
        <section className="space-y-3">
          <SectionTitle>Your week</SectionTitle>
          {days.map(d => (
            <Card key={d.day} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neon-ink">{d.day}</div>
                  <div className="font-bold text-lg text-ink leading-tight break-words">{d.rest ? 'Rest day' : d.title || 'Workout'}</div>
                </div>
                {!d.rest && d.exercises?.length > 0 && (
                  <Button size="sm" icon="mdi:play" onClick={() => onStartPlanDay(toPlanDay(`${product.title}: ${d.title || d.day}`, d.exercises))}>Start</Button>
                )}
              </div>
              {d.note && <p className="text-sm text-ink-2 whitespace-pre-line">{d.note}</p>}
              {!d.rest && (d.exercises ?? []).map((e, i) => <ExerciseDetail key={i} e={e} />)}
            </Card>
          ))}
        </section>
      )}

      {!has && product.outline.length > 0 && (
        <section>
          <SectionTitle>What's inside</SectionTitle>
          <ul className="space-y-1.5">
            {product.kind === 'workout'
              ? product.outline.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-ink-2">
                    <Icon icon={getExerciseIcon(EXERCISES.find(x => x.name === name))} width={18} className="text-muted flex-shrink-0" aria-hidden="true" />{name}
                  </li>
                ))
              : product.outline.map(d => (
                  <li key={d.day} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-2"><span className="font-semibold text-ink">{d.day}</span> · {d.title}</span>
                    {!d.rest && <span className="text-xs text-muted tabular-nums">{d.count} exercises</span>}
                  </li>
                ))}
          </ul>
          <p className="text-xs text-muted mt-3">Sets, reps, the coach's tips and videos open once it's yours.</p>
        </section>
      )}
    </div>
  )
}
