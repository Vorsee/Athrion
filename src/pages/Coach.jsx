import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useBackHandler } from '../lib/shell.js'
import { Button, Card, Chip, Segmented, PageHeader, SectionTitle, Fact, Tag, IconButton, InlineError, SkeletonRows, InfoButton, ListRow } from '../components/ui/index.js'
import { EXERCISES, getExerciseIcon } from '../lib/data.js'
import { REST_OPTIONS, restLabel } from '../lib/groupPlan.js'
import { COACH_FEE_RATE } from '../lib/pricing.js'
import {
  fetchMyCoach, saveCoachProfile, uploadAvatar, fetchMyProducts, fetchMySales, saveProduct,
  deleteProduct, fetchContent, uploadVideo, removeVideo, coachConnect, fetchIsAdmin, fetchApplications, reviewCoach,
  priceText, LEVELS, SPECIALTIES, DAYS, MAX_VIDEO_MB,
} from '../lib/coachApi.js'
import { Avatar, KIND_LABEL } from '../components/Shop.jsx'

const INPUT = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors'
const COACH_SHARE = Math.round((1 - COACH_FEE_RATE) * 100) // 80

function Field({ label, hint, count, max, children }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-sm font-semibold text-ink-2">{label}</span>
        {max && <span className="text-xs text-muted tabular-nums">{count ?? 0}/{max}</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page: apply, wait for review, or run your coach page
// ─────────────────────────────────────────────────────────────────────────────

export default function Coach({ onOpenShop }) {
  const [coach, setCoach] = useState(undefined) // undefined = loading, null = hasn't applied
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState('home') // home | profile | edit | applications
  const [editing, setEditing] = useState(null)

  function load() {
    setError('')
    fetchMyCoach().then(c => setCoach(c ?? null)).catch(() => setError("Couldn't load your coach page."))
    fetchIsAdmin().then(setIsAdmin).catch(() => {})
  }
  useEffect(load, [])

  useBackHandler(screen === 'profile', () => setScreen('home'), 'Coach', 'Coach profile')
  useBackHandler(screen === 'edit', () => { setScreen('home'); setEditing(null) }, 'Coach', editing?.title || 'New')
  useBackHandler(screen === 'applications', () => setScreen('home'), 'Coach', 'Applications')

  if (error) return <div className="py-4"><InlineError onRetry={load}>{error}</InlineError></div>
  if (coach === undefined) return <div className="py-4"><SkeletonRows rows={4} label="Loading" /></div>

  if (screen === 'applications') return <Applications />
  if (screen === 'profile' || !coach) return (
    <ProfileForm coach={coach} onSaved={c => { setCoach(c); setScreen('home') }} isAdmin={isAdmin} onApplications={() => setScreen('applications')} />
  )
  if (screen === 'edit' && editing) return (
    <ProductEditor initial={editing} chargesEnabled={coach.charges_enabled}
      onDone={() => { setScreen('home'); setEditing(null) }} />
  )

  return (
    <div className="space-y-4 py-4 slide-up">
      {coach.status === 'approved'
        ? <Dashboard coach={coach} onCoachChange={setCoach} onEditProfile={() => setScreen('profile')} onOpenShop={onOpenShop}
            onEdit={p => { setEditing(p); setScreen('edit') }} />
        : <Review coach={coach} onEdit={() => setScreen('profile')} />}
      {isAdmin && (
        <Card pad="sm">
          <ListRow icon="mdi:account-check-outline" tile="info" title="Coach applications" meta="Approve or turn down new coaches" chevron onClick={() => setScreen('applications')} />
        </Card>
      )}
    </div>
  )
}

function Review({ coach, onEdit }) {
  const pending = coach.status === 'pending'
  return (
    <>
      <PageHeader icon="mdi:whistle-outline" title={pending ? 'Application sent' : coach.status === 'rejected' ? 'Not approved yet' : 'Coach page paused'}
        facts={<Fact icon={pending ? 'mdi:progress-clock' : 'mdi:information-outline'}>{pending ? 'In review' : coach.status === 'rejected' ? 'Not approved' : 'Paused'}</Fact>} />
      <Card hero className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar coach={coach} size={48} />
          <div className="min-w-0">
            <div className="font-bold text-lg text-ink truncate">{coach.display_name}</div>
            <div className="text-xs text-muted truncate">{coach.specialties.join(' · ')}</div>
          </div>
        </div>
        {pending ? (
          <p className="text-sm text-ink-2">We check every coach before they can sell. You'll get a notification when it's done, usually within 2 working days.</p>
        ) : coach.status === 'rejected' ? (
          <>
            {coach.review_note && <p className="text-sm text-ink-2"><span className="font-semibold text-ink">Why: </span>{coach.review_note}</p>}
            <p className="text-sm text-ink-2">Update your profile and apply again.</p>
          </>
        ) : (
          <p className="text-sm text-ink-2">Your workouts are hidden from the shop for now. Email athrionsportapp@gmail.com to find out more.</p>
        )}
      </Card>
      {coach.status !== 'suspended' && (
        <Button full variant={pending ? 'secondary' : 'primary'} icon="mdi:pencil-outline" onClick={onEdit}>
          {pending ? 'Edit application' : 'Update and apply again'}
        </Button>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile: the application, and later the public coach page
// ─────────────────────────────────────────────────────────────────────────────

function ProfileForm({ coach, onSaved, isAdmin, onApplications }) {
  const isNew = !coach
  const [f, setF] = useState({
    display_name: coach?.display_name ?? '', bio: coach?.bio ?? '', credentials: coach?.credentials ?? '',
    specialties: coach?.specialties ?? [], links: coach?.links ?? '', avatar_path: coach?.avatar_path ?? null,
  })
  const [agree, setAgree] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState('')
  const [error, setError] = useState('')
  const set = patch => setF(prev => ({ ...prev, ...patch }))
  const toggle = s => set({ specialties: f.specialties.includes(s) ? f.specialties.filter(x => x !== s) : [...f.specialties, s].slice(0, 6) })
  const ok = f.display_name.trim().length >= 2 && f.bio.trim().length >= 20 && f.credentials.trim() && agree

  async function pickAvatar(file) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Photos can be up to 5 MB.'); return }
    setUpload('Uploading…'); setError('')
    try { set({ avatar_path: await uploadAvatar(file) }); setUpload('') }
    catch (e) { setUpload(''); setError(e.message || "Couldn't upload the photo.") }
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      onSaved(await saveCoachProfile({ ...f, display_name: f.display_name.trim(), bio: f.bio.trim(), credentials: f.credentials.trim(), links: f.links.trim() },
        { isNew, reapply: coach?.status === 'rejected' }))
    } catch (e) {
      setError(e.message || "Couldn't save."); setBusy(false)
    }
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:whistle-outline" title={isNew ? 'Coach on ATHRION' : 'Coach profile'}
        facts={isNew && <>
          <Fact icon="mdi:cash">You keep {COACH_SHARE}%</Fact>
          <Fact icon="mdi:video-outline">Tips and videos</Fact>
        </>}
        action={isNew && (
          <InfoButton title="How selling works">
            <div className="space-y-3 text-sm text-ink-2">
              <p><span className="font-semibold text-ink">Apply</span> with a short bio and your qualifications. We check every coach before they can publish.</p>
              <p><span className="font-semibold text-ink">Publish</span> single workouts or full week plans, free or paid, with a tip and a how-to video for each exercise.</p>
              <p><span className="font-semibold text-ink">Get paid</span> through Stripe. You keep {COACH_SHARE}% of every sale and ATHRION keeps {100 - COACH_SHARE}%, which also covers card fees. Stripe pays out to your bank and handles tax forms.</p>
            </div>
          </InfoButton>
        )} />

      {isNew && <p className="text-sm text-ink-2">Sell your workouts and week plans to people training on ATHRION. Tell us about yourself and we'll review it.</p>}

      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar coach={f} size={64} />
          <label className="press min-h-[44px] px-4 rounded-xl border border-line-strong text-sm font-semibold text-ink-2 hover:text-ink inline-flex items-center gap-2 cursor-pointer">
            <Icon icon="mdi:camera-outline" width={18} aria-hidden="true" />{upload || (f.avatar_path ? 'Change photo' : 'Add a photo')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Profile photo" onChange={e => pickAvatar(e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Coach name" count={f.display_name.length} max={40}>
          <input className={INPUT} maxLength={40} value={f.display_name} onChange={e => set({ display_name: e.target.value })} placeholder="How people will see you" />
        </Field>
        <Field label="Qualifications" count={f.credentials.length} max={500} hint="Certifications, years coaching, sports you've competed in.">
          <input className={INPUT} maxLength={500} value={f.credentials} onChange={e => set({ credentials: e.target.value })} placeholder="NASM CPT, 6 years coaching" />
        </Field>
        <Field label="About you" count={f.bio.length} max={1000} hint="At least 20 characters. Who you coach and how.">
          <textarea className={`${INPUT} min-h-[110px]`} maxLength={1000} value={f.bio} onChange={e => set({ bio: e.target.value })} />
        </Field>
        <div>
          <div className="text-sm font-semibold text-ink-2 mb-1.5">What you coach</div>
          <div className="flex flex-wrap gap-1.5">
            {SPECIALTIES.map(s => <Chip key={s} selected={f.specialties.includes(s)} onClick={() => toggle(s)}>{s}</Chip>)}
          </div>
        </div>
        <Field label="Website or social" count={f.links.length} max={300} hint="Optional. Shown on your coach page.">
          <input className={INPUT} maxLength={300} value={f.links} onChange={e => set({ links: e.target.value })} placeholder="instagram.com/yourname" />
        </Field>
      </Card>

      {isNew && (
        <label className="flex items-start gap-3 text-xs text-muted leading-relaxed cursor-pointer min-h-[44px] py-1">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-5 h-5 flex-shrink-0 accent-neon rounded" />
          <span>I'm 18 or older and agree to the <a href="/terms.html#coaches" target="_blank" rel="noreferrer" className="underline underline-offset-2 text-ink-2">coach terms</a>: my workouts are my own work, my advice is safe and honest, and ATHRION keeps {100 - COACH_SHARE}% of each sale.</span>
        </label>
      )}

      {error && <InlineError>{error}</InlineError>}
      <Button full icon={isNew ? 'mdi:send-outline' : 'mdi:check'} onClick={submit} disabled={!ok || busy || !!upload}>
        {busy ? 'Saving…' : isNew ? 'Send application' : coach.status === 'rejected' ? 'Apply again' : 'Save profile'}
      </Button>

      {isNew && isAdmin && (
        <Button full variant="ghost" icon="mdi:account-check-outline" onClick={onApplications}>Coach applications</Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard: payouts, products, sales
// ─────────────────────────────────────────────────────────────────────────────

const newProduct = kind => ({
  _new: true, id: crypto.randomUUID(), kind, title: '', summary: '', description: '', level: 'All levels',
  price_cents: 0, minutes: null, published: false,
  content: kind === 'plan'
    ? { days: DAYS.map((day, i) => ({ day, title: '', rest: i === 2 || i >= 5, note: '', exercises: [] })) }
    : { exercises: [] },
})

function Dashboard({ coach, onCoachChange, onEditProfile, onEdit, onOpenShop }) {
  const [products, setProducts] = useState(null)
  const [sales, setSales] = useState({ byProduct: {}, sales: 0, earnedCents: 0 })
  const [payout, setPayout] = useState('') // '' | 'busy' | error text
  const [error, setError] = useState('')

  function load() {
    setError('')
    fetchMyProducts().then(setProducts).catch(() => setError("Couldn't load your workouts."))
    fetchMySales().then(setSales).catch(() => {})
  }
  useEffect(load, [])
  // Back from Stripe's setup, or Stripe finished checking: ask it whether payments are on
  useEffect(() => {
    coachConnect('status').then(r => {
      if (r.charges_enabled !== coach.charges_enabled) onCoachChange({ ...coach, charges_enabled: r.charges_enabled })
    }).catch(() => {})
  }, [])

  async function stripe(action) {
    setPayout('busy')
    try { window.location.href = (await coachConnect(action)).url }
    catch (e) { setPayout(e.message) }
  }

  const published = products?.filter(p => p.published).length ?? 0

  async function edit(p) {
    try {
      onEdit({ ...p, content: (await fetchContent(p.id)) ?? newProduct(p.kind).content })
    } catch { setError("Couldn't open that workout.") }
  }

  return (
    <>
      <PageHeader icon="mdi:whistle-outline" title="Coach"
        action={<IconButton icon="mdi:account-edit-outline" label="Edit coach profile" onClick={onEditProfile} />}
        facts={<>
          <Fact icon="mdi:storefront-outline">{published} in the shop</Fact>
          <Fact icon="mdi:cart-outline">{sales.sales} {sales.sales === 1 ? 'sale' : 'sales'}</Fact>
          <Fact icon="mdi:cash">{priceText(sales.earnedCents) === 'Free' ? '$0.00' : priceText(sales.earnedCents)} earned</Fact>
        </>} />

      <Card hero={!coach.charges_enabled} className="space-y-3">
        <div className="flex items-start gap-3">
          <Icon icon={coach.charges_enabled ? 'mdi:bank-check' : 'mdi:bank-outline'} width={26} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-semibold text-ink">{coach.charges_enabled ? 'Payouts are on' : 'Set up payouts'}</div>
            <p className="text-sm text-muted">
              {coach.charges_enabled
                ? `You get ${COACH_SHARE}% of each sale, paid to your bank by Stripe.`
                : 'Stripe checks your identity and bank details so you can sell paid workouts. Free ones can go live now.'}
            </p>
          </div>
        </div>
        <Button full variant={coach.charges_enabled ? 'secondary' : 'primary'} icon={coach.charges_enabled ? 'mdi:open-in-new' : 'mdi:bank-plus'}
          onClick={() => stripe(coach.charges_enabled ? 'dashboard' : 'onboard')} disabled={payout === 'busy'}>
          {payout === 'busy' ? 'Opening Stripe…' : coach.charges_enabled ? 'Payouts and tax forms' : 'Set up with Stripe'}
        </Button>
        {payout && payout !== 'busy' && <InlineError>{payout}</InlineError>}
      </Card>

      <section>
        <SectionTitle action={onOpenShop && <button type="button" onClick={onOpenShop} className="press text-xs font-semibold text-neon-ink min-h-[36px]">See the shop</button>}>
          Your workouts
        </SectionTitle>
        {error && <InlineError onRetry={load}>{error}</InlineError>}
        {!products && !error && <SkeletonRows rows={2} />}
        {products?.length === 0 && <p className="text-sm text-muted mb-3">Nothing yet. Start with one workout you know works.</p>}
        <div className="space-y-2">
          {products?.map(p => (
            <button key={p.id} type="button" onClick={() => edit(p)}
              className="press w-full text-left bg-surface border border-line hover:border-neon-stroke/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors">
              <Icon icon={p.kind === 'plan' ? 'mdi:calendar-week' : 'mdi:dumbbell'} width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm text-ink truncate">{p.title}</span>
                <span className="block text-xs text-muted">{KIND_LABEL[p.kind]} · {priceText(p.price_cents)} · {sales.byProduct[p.id] ?? 0} {p.price_cents ? 'sold' : 'added'}</span>
              </span>
              <Tag tone={p.published ? 'neon-ink' : 'warn'}>{p.published ? 'Live' : 'Draft'}</Tag>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" icon="mdi:dumbbell" onClick={() => onEdit(newProduct('workout'))}>New workout</Button>
        <Button variant="secondary" icon="mdi:calendar-week" onClick={() => onEdit(newProduct('plan'))}>New week plan</Button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor: a workout, or a plan of 7 days, each exercise with a tip and a video
// ─────────────────────────────────────────────────────────────────────────────

function ProductEditor({ initial, chargesEnabled, onDone }) {
  const [p, setP] = useState(initial)
  const [paid, setPaid] = useState(initial.price_cents > 0)
  const [price, setPrice] = useState(initial.price_cents ? (initial.price_cents / 100).toFixed(2) : '9.99')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [uploads, setUploads] = useState(0)
  const set = patch => setP(prev => ({ ...prev, ...patch }))
  const setContent = content => setP(prev => ({ ...prev, content }))

  const cents = paid ? Math.round(parseFloat(price || '0') * 100) : 0
  const priceOk = !paid || (cents >= 299 && cents <= 50000)
  const exercisesOf = c => (p.kind === 'plan' ? c.days.flatMap(d => (d.rest ? [] : d.exercises)) : c.exercises)
  const allEx = exercisesOf(p.content)
  const hasWork = p.kind === 'plan' ? p.content.days.some(d => !d.rest && d.exercises.length) : allEx.length > 0
  const named = allEx.every(e => e.name.trim())
  const ok = p.title.trim().length >= 2 && priceOk && named
  const canPublish = ok && hasWork && (!paid || chargesEnabled)

  async function save(published) {
    setBusy(published ? 'publish' : 'save'); setError('')
    try {
      await saveProduct({ ...p, price_cents: cents, published }, p.content)
      onDone()
    } catch (e) {
      setError(e.message || "Couldn't save."); setBusy('')
    }
  }

  async function remove() {
    setBusy('delete'); setError('')
    try {
      if (!p._new) await deleteProduct(p.id)
      for (const e of allEx) if (e.video) removeVideo(e.video).catch(() => {})
      onDone()
    } catch (e) { setError(e.message); setBusy('') }
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon={p.kind === 'plan' ? 'mdi:calendar-week' : 'mdi:dumbbell'} title={p._new ? `New ${KIND_LABEL[p.kind].toLowerCase()}` : p.title || 'Untitled'}
        facts={<Fact icon={p.published ? 'mdi:storefront-outline' : 'mdi:pencil-outline'}>{p.published ? 'Live in the shop' : 'Draft'}</Fact>} />

      <Card className="space-y-4">
        <Field label="Title" count={p.title.length} max={60}>
          <input className={INPUT} maxLength={60} value={p.title} onChange={e => set({ title: e.target.value })}
            placeholder={p.kind === 'plan' ? '4-day strength block' : 'Upper body power'} />
        </Field>
        <Field label="One-line summary" count={p.summary.length} max={160} hint="Shown in the shop, under the title.">
          <input className={INPUT} maxLength={160} value={p.summary} onChange={e => set({ summary: e.target.value })} />
        </Field>
        <Field label="Description and general tips" count={p.description.length} max={3000} hint="Who it's for, how to progress, warm-up. Everyone can read this.">
          <textarea className={`${INPUT} min-h-[110px]`} maxLength={3000} value={p.description} onChange={e => set({ description: e.target.value })} />
        </Field>
        <div>
          <div className="text-sm font-semibold text-ink-2 mb-1.5">Level</div>
          <div className="flex flex-wrap gap-1.5">{LEVELS.map(l => <Chip key={l} selected={p.level === l} onClick={() => set({ level: l })}>{l}</Chip>)}</div>
        </div>
        <Field label={p.kind === 'plan' ? 'Minutes per session' : 'Minutes'} hint="Optional.">
          <input className={INPUT} type="number" inputMode="numeric" min="1" max="300" value={p.minutes ?? ''}
            onChange={e => set({ minutes: e.target.value ? Math.max(1, Math.min(300, parseInt(e.target.value) || 1)) : null })} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <SectionTitle className="mb-0">Price</SectionTitle>
        <Segmented options={[['free', 'Free'], ['paid', 'Paid']]} value={paid ? 'paid' : 'free'} onChange={v => setPaid(v === 'paid')} label="Price" kind="choice" />
        {paid && (
          <>
            <Field label="Price in US dollars" hint={priceOk ? `You get $${((cents * (1 - COACH_FEE_RATE)) / 100).toFixed(2)} of each sale.` : 'Between $2.99 and $500.'}>
              <input className={INPUT} type="number" inputMode="decimal" min="2.99" max="500" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
            </Field>
            {!chargesEnabled && <p className="text-xs text-warn">Set up payouts on your coach page before this can go live.</p>}
          </>
        )}
      </Card>

      {p.kind === 'workout' ? (
        <section>
          <SectionTitle>Exercises</SectionTitle>
          <ExerciseList productId={p.id} items={p.content.exercises} onChange={exercises => setContent({ exercises })} onUploading={d => setUploads(n => n + d)} />
        </section>
      ) : (
        <section className="space-y-3">
          <SectionTitle>The week</SectionTitle>
          {p.content.days.map((d, i) => {
            const change = patch => setContent({ days: p.content.days.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            return (
              <Card key={d.day} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-lg text-ink">{d.day}</div>
                  <Segmented options={[['train', 'Training'], ['rest', 'Rest']]} value={d.rest ? 'rest' : 'train'} onChange={v => change({ rest: v === 'rest' })}
                    label={`${d.day} type`} kind="choice" scroll={false} />
                </div>
                {!d.rest && (
                  <>
                    <input className={INPUT} maxLength={40} value={d.title} onChange={e => change({ title: e.target.value })} placeholder="Session name, like Push or Legs" aria-label={`${d.day} session name`} />
                    <textarea className={`${INPUT} min-h-[70px]`} maxLength={500} value={d.note ?? ''} onChange={e => change({ note: e.target.value })} placeholder="Notes for the day (optional)" aria-label={`${d.day} notes`} />
                    <ExerciseList productId={p.id} items={d.exercises} onChange={exercises => change({ exercises })} onUploading={n => setUploads(u => u + n)} />
                  </>
                )}
              </Card>
            )
          })}
        </section>
      )}

      {error && <InlineError>{error}</InlineError>}
      {!named && <p className="text-xs text-warn">Every exercise needs a name.</p>}

      <div className="space-y-2">
        {p.published ? (
          <>
            <Button full icon="mdi:check" onClick={() => save(true)} disabled={!canPublish || !!busy || uploads > 0}>{busy === 'publish' ? 'Saving…' : 'Save changes'}</Button>
            <Button full variant="secondary" icon="mdi:eye-off-outline" onClick={() => save(false)} disabled={!ok || !!busy || uploads > 0}>{busy === 'save' ? 'Saving…' : 'Take out of the shop'}</Button>
          </>
        ) : (
          <>
            <Button full icon="mdi:storefront-outline" onClick={() => save(true)} disabled={!canPublish || !!busy || uploads > 0}>{busy === 'publish' ? 'Publishing…' : 'Publish to the shop'}</Button>
            <Button full variant="secondary" icon="mdi:content-save-outline" onClick={() => save(false)} disabled={!ok || !!busy || uploads > 0}>{busy === 'save' ? 'Saving…' : 'Save draft'}</Button>
          </>
        )}
        {uploads > 0 && <p className="text-xs text-muted text-center" role="status">Waiting for videos to finish uploading…</p>}
        <Button full variant="ghost" icon="mdi:delete-outline" className="!text-danger" onClick={remove} disabled={!!busy}>
          {busy === 'delete' ? 'Deleting…' : p._new ? 'Discard' : 'Delete'}
        </Button>
      </div>
    </div>
  )
}

function ExerciseList({ productId, items, onChange, onUploading }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q ? EXERCISES.filter(e => e.name.toLowerCase().includes(q)).slice(0, 5) : []
  const exact = EXERCISES.some(e => e.name.toLowerCase() === q)

  // A library move brings its usual target ("30-60s" for a plank, which logs as a hold)
  const add = name => {
    const known = EXERCISES.find(e => e.name === name)
    onChange([...items, { name, sets: 3, reps: known?.reps ?? '8-12', restSeconds: known?.muscle === 'Mobility' ? 15 : 90, tip: '', video: null }]); setQuery('')
  }
  const change = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i, d) => {
    const next = [...items]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); onChange(next)
  }

  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <ExerciseEditor key={i} e={e} index={i} count={items.length} productId={productId} onUploading={onUploading}
          onChange={patch => change(i, patch)} onRemove={() => onChange(items.filter((_, j) => j !== i))} onMove={d => move(i, d)} />
      ))}
      <div className="bg-raised rounded-2xl p-3">
        <input className={INPUT.replace('bg-raised', 'bg-surface')} value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Add an exercise" aria-label="Add an exercise"
          onKeyDown={e => { if (e.key === 'Enter' && q) add(matches[0]?.name ?? query.trim()) }} />
        {q && (
          <div className="mt-2 space-y-1">
            {matches.map(m => (
              <button key={m.name} type="button" onClick={() => add(m.name)}
                className="press w-full min-h-[44px] flex items-center gap-3 px-2 rounded-lg hover:bg-surface text-left">
                <Icon icon={getExerciseIcon(m)} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 text-sm text-ink">{m.name}</span>
                <span className="text-xs text-muted">{m.muscle}</span>
              </button>
            ))}
            {!exact && (
              <button type="button" onClick={() => add(query.trim())}
                className="press w-full min-h-[44px] flex items-center gap-3 px-2 rounded-lg hover:bg-surface text-left">
                <Icon icon="mdi:plus" width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-ink">Add "{query.trim()}" as your own exercise</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const SMALL = 'bg-raised border border-line focus:border-neon-stroke text-ink rounded-lg px-2 h-10 text-sm font-semibold tabular-nums outline-none transition-colors w-full'

function ExerciseEditor({ e, index, count, productId, onChange, onRemove, onMove, onUploading }) {
  const [open, setOpen] = useState(!e.name || index === count - 1)
  const [upload, setUpload] = useState('')
  const ex = EXERCISES.find(x => x.name === e.name)

  async function pickVideo(file) {
    if (!file) return
    setUpload('Uploading…'); onUploading(1)
    try {
      const path = await uploadVideo(productId, file)
      if (e.video) removeVideo(e.video).catch(() => {})
      onChange({ video: path }); setUpload('')
    } catch (err) {
      setUpload(err.message || "Couldn't upload the video.")
    } finally { onUploading(-1) }
  }

  return (
    <div className="bg-surface border border-line rounded-2xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon icon={getExerciseIcon(ex)} width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="press flex-1 min-w-0 text-left min-h-[44px]">
          <span className="block text-sm font-semibold text-ink truncate">{e.name || 'Unnamed exercise'}</span>
          <span className="block text-xs text-muted truncate">{e.sets} × {e.reps} · rest {restLabel(e.restSeconds).toLowerCase()}{e.video ? ' · video' : ''}{e.tip ? ' · tip' : ''}</span>
        </button>
        <IconButton icon="mdi:arrow-up" label={`Move ${e.name} up`} onClick={() => onMove(-1)} disabled={index === 0} className="w-9 h-9" />
        <IconButton icon="mdi:arrow-down" label={`Move ${e.name} down`} onClick={() => onMove(1)} disabled={index === count - 1} className="w-9 h-9" />
        <IconButton icon="mdi:close" label={`Remove ${e.name}`} tone="danger" onClick={onRemove} className="w-9 h-9" />
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-line pt-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs text-muted mb-1">Sets</span>
              <input className={`${SMALL} text-center`} type="number" inputMode="numeric" min="1" max="10" value={e.sets}
                onChange={ev => onChange({ sets: Math.max(1, Math.min(10, parseInt(ev.target.value) || 1)) })} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Reps or time</span>
              <input className={`${SMALL} text-center`} maxLength={12} value={e.reps} onChange={ev => onChange({ reps: ev.target.value })} placeholder="8-12 or 45s" aria-label="Reps, or a time like 45s" />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Rest</span>
              <select className={SMALL} value={e.restSeconds} onChange={ev => onChange({ restSeconds: Number(ev.target.value) })}>
                {REST_OPTIONS.map(r => <option key={r} value={r}>{restLabel(r)}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="flex justify-between text-xs text-muted mb-1"><span>Your tip</span><span className="tabular-nums">{(e.tip ?? '').length}/500</span></span>
            <textarea className={`${INPUT} min-h-[70px]`} maxLength={500} value={e.tip ?? ''} onChange={ev => onChange({ tip: ev.target.value })}
              placeholder="What people get wrong, what to feel, how to progress" />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="press min-h-[44px] px-4 rounded-xl border border-dashed border-line-strong text-sm font-semibold text-ink-2 hover:text-ink inline-flex items-center gap-2 cursor-pointer">
              <Icon icon={e.video ? 'mdi:video-check-outline' : 'mdi:video-plus-outline'} width={18} className={e.video ? 'text-neon-ink' : ''} aria-hidden="true" />
              {upload === 'Uploading…' ? 'Uploading…' : e.video ? 'Replace video' : 'Add how-to video'}
              <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" aria-label={`How-to video for ${e.name}`}
                disabled={upload === 'Uploading…'} onChange={ev => pickVideo(ev.target.files?.[0])} />
            </label>
            {e.video && upload !== 'Uploading…' && (
              <Button size="sm" variant="ghost" icon="mdi:delete-outline" onClick={() => { removeVideo(e.video).catch(() => {}); onChange({ video: null }) }}>Remove video</Button>
            )}
          </div>
          {upload && upload !== 'Uploading…' ? <InlineError>{upload}</InlineError>
            : <p className="text-xs text-muted">MP4 or MOV, up to {MAX_VIDEO_MB} MB. Only people who have this workout can watch it.</p>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: review coach applications
// ─────────────────────────────────────────────────────────────────────────────

export function Applications() {
  const [list, setList] = useState(null)
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    fetchApplications().then(setList).catch(() => setError("Couldn't load applications."))
  }
  useEffect(load, [])

  async function decide(id, status) {
    setBusy(id); setError('')
    try {
      await reviewCoach(id, status, notes[id]?.trim() || null)
      setList(l => l.filter(c => c.user_id !== id))
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  return (
    <div className="space-y-4 py-4 slide-up">
      <PageHeader icon="mdi:account-check-outline" title="Applications" facts={list && <Fact icon="mdi:account-clock-outline">{list.length} waiting</Fact>} />
      {error && <InlineError onRetry={load}>{error}</InlineError>}
      {!list && !error && <SkeletonRows rows={3} />}
      {list?.length === 0 && <p className="text-sm text-muted">No applications waiting.</p>}
      {list?.map(c => (
        <Card key={c.user_id} className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar coach={c} size={48} />
            <div className="min-w-0">
              <div className="font-bold text-lg text-ink truncate">{c.display_name}</div>
              <div className="text-xs text-muted">Applied {new Date(c.applied_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="text-sm"><span className="font-semibold text-ink">Qualifications: </span><span className="text-ink-2">{c.credentials}</span></div>
          <p className="text-sm text-ink-2 whitespace-pre-line">{c.bio}</p>
          {c.specialties.length > 0 && <div className="flex flex-wrap gap-1.5">{c.specialties.map(s => <Fact key={s}>{s}</Fact>)}</div>}
          {c.links && <div className="text-sm text-muted break-words">{c.links}</div>}
          <input className={INPUT} maxLength={500} value={notes[c.user_id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.user_id]: e.target.value }))}
            placeholder="Reason, if you turn it down (they'll see it)" aria-label={`Note for ${c.display_name}`} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" icon="mdi:close" onClick={() => decide(c.user_id, 'rejected')} disabled={busy === c.user_id}>Turn down</Button>
            <Button icon="mdi:check" onClick={() => decide(c.user_id, 'approved')} disabled={busy === c.user_id}>Approve</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
