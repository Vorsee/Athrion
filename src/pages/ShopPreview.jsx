import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, Fact, Tag, EmptyState, SkeletonRows, InlineError } from '../components/ui/index.js'
import { Avatar, KIND_LABEL } from '../components/Shop.jsx'
import { getExerciseIcon, EXERCISES } from '../lib/data.js'
import { priceText } from '../lib/coachApi.js'
import { rememberShopLink } from '../lib/shopLink.js'
import Brand from '../components/Brand.jsx'

// Public page behind a shared shop link (athrion.app/shop/<id> or /shop/coach/<id>), for people
// without an account. Buying needs an account, so it leads to sign-up and opens the product after.
export default function ShopPreview({ link, onStart, onSignIn, onHome }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | missing | error

  function load() {
    setState('loading')
    fetch(`/api/shop-preview?${link.kind}=${link.id}`)
      .then(r => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { setData(d); setState(d ? 'ready' : 'missing') })
      .catch(() => setState('error'))
  }
  useEffect(load, [link.kind, link.id])

  function start() {
    rememberShopLink(link)
    onStart()
  }

  const coach = data?.coach
  const product = link.kind === 'product' ? data?.products[0] : null

  return (
    <div className="min-h-dvh bg-canvas text-ink font-dm pt-safe">
      <header className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
        <button type="button" onClick={onHome} className="press min-h-[44px]" aria-label="ATHRION home"><Brand /></button>
        <button type="button" onClick={() => { rememberShopLink(link); onSignIn() }}
          className="press min-h-[44px] px-3 text-sm font-semibold text-ink-2 hover:text-ink">Sign in</button>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-16 space-y-5">
        {state === 'loading' && <SkeletonRows rows={4} label="Loading" />}
        {state === 'error' && <InlineError onRetry={load}>Couldn't load this link.</InlineError>}
        {state === 'missing' && (
          <EmptyState icon="mdi:storefront-remove-outline" title="Not available" action="See ATHRION" actionIcon="mdi:arrow-right" onAction={onHome}>
            This isn't in the coach shop any more.
          </EmptyState>
        )}

        {state === 'ready' && product && <ProductPreview product={product} coach={coach} onStart={start} />}
        {state === 'ready' && !product && <CoachPreview coach={coach} products={data.products} onStart={start} />}

        {state === 'ready' && (
          <p className="text-xs text-muted">
            Every coach is reviewed by ATHRION before they can sell. Not medical advice.{' '}
            <a href="/terms.html#shop" className="underline underline-offset-2">Shop terms</a>
          </p>
        )}
      </main>
    </div>
  )
}

function CoachLine({ coach }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar coach={coach} size={40} />
      <span className="min-w-0 text-sm">
        <span className="text-muted">By </span><span className="font-semibold text-ink">{coach.display_name}</span>
        {coach.credentials && <span className="block text-xs text-muted truncate">{coach.credentials}</span>}
      </span>
    </div>
  )
}

function ProductPreview({ product, coach, onStart }) {
  const free = product.price_cents === 0
  const trainingDays = product.outline.filter(d => !d.rest).length
  return (
    <>
      <section className="pt-2 space-y-3">
        <span className="inline-flex text-xs font-semibold text-on-neon bg-neon rounded-md px-2 py-0.5">Coach {KIND_LABEL[product.kind].toLowerCase()}</span>
        <h1 className="font-bold text-[2.25rem] xs:text-5xl leading-[1.05] tracking-tight break-words">{product.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          <Fact icon="mdi:signal-cellular-2">{product.level}</Fact>
          {product.minutes && <Fact icon="mdi:clock-outline">{product.minutes} min</Fact>}
          {product.kind === 'plan'
            ? <Fact icon="mdi:calendar-check-outline">{trainingDays} days a week</Fact>
            : <Fact icon="mdi:format-list-numbered">{product.outline.length} exercises</Fact>}
        </div>
        <CoachLine coach={coach} />
      </section>

      {product.summary && <p className="text-base text-ink-2">{product.summary}</p>}

      <Card hero className="space-y-3">
        <div className="font-bold text-3xl text-neon-ink tabular-nums">{priceText(product.price_cents)}</div>
        <Button full icon={free ? 'mdi:plus' : 'mdi:lock-open-variant-outline'} onClick={onStart}>
          {free ? 'Create a free account to get it' : 'Create a free account to buy'}
        </Button>
        <p className="text-xs text-muted">
          {free ? 'Free account, no card.' : 'One payment, no subscription. The account itself is free.'} It opens right after you sign up.
        </p>
      </Card>

      {product.description && (
        <section>
          <SectionTitle>From the coach</SectionTitle>
          <p className="text-sm text-ink-2 whitespace-pre-line">{product.description}</p>
        </section>
      )}

      {product.outline.length > 0 && (
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
    </>
  )
}

function CoachPreview({ coach, products, onStart }) {
  return (
    <>
      <section className="pt-2 space-y-3">
        <div className="flex items-center gap-4">
          <Avatar coach={coach} size={72} />
          <div className="min-w-0">
            <h1 className="font-bold text-3xl text-ink leading-tight break-words">{coach.display_name}</h1>
            {coach.credentials && <div className="text-sm text-muted mt-0.5">{coach.credentials}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Fact icon="mdi:check-decagram-outline">Reviewed coach</Fact>
          {coach.specialties.map(s => <Fact key={s}>{s}</Fact>)}
        </div>
      </section>
      {coach.bio && <p className="text-sm text-ink-2 whitespace-pre-line">{coach.bio}</p>}

      <section>
        <SectionTitle action={<Fact icon="mdi:storefront-outline">{products.length}</Fact>}>For sale</SectionTitle>
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="bg-surface border border-line rounded-2xl px-4 py-3 flex items-center gap-3">
              <Icon icon={p.kind === 'plan' ? 'mdi:calendar-week' : 'mdi:dumbbell'} width={24} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm text-ink break-words">{p.title}</span>
                <span className="block text-xs text-muted">{KIND_LABEL[p.kind]} · {p.level}</span>
              </span>
              {p.price_cents === 0
                ? <Tag tone="neon-ink">Free</Tag>
                : <span className="text-sm font-bold text-neon-ink tabular-nums flex-shrink-0">{priceText(p.price_cents)}</span>}
            </div>
          ))}
        </div>
      </section>

      <Button full icon="mdi:account-plus-outline" onClick={onStart}>Create a free account</Button>
      <p className="text-xs text-muted -mt-3">Free account, no card. {coach.display_name}'s shop opens right after you sign up.</p>
    </>
  )
}
