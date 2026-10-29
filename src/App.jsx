import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase.js'
import { fetchUserProfile, fetchSubscriptionStatus } from './lib/api.js'
import { fetchFitnessProfile } from './lib/fitnessApi.js'
import Workout from './pages/Workout.jsx'
import { healthSyncAvailable, syncHealthData } from './lib/health.js'
import Nav, { LANDING, useMinimisedSession } from './components/Nav.jsx'
import { useShell, onPageBack, pushEntry, replaceEntry, silentBack, dropBackHandlers, setSessionMinimised } from './lib/shell.js'
import { createCheckoutSession } from './lib/stripe.js'
import { UnitProvider } from './lib/units.js'
import HomeScreenPrompt from './components/HomeScreenPrompt.jsx'
import { PageSkeleton } from './components/ui/States.jsx'
import { readGuidePick, clearGuidePick } from './lib/guidePlans.js'
import { rememberInvite, readInvite } from './lib/socialApi.js'
import { parseShopPath, readShopLink, clearShopLink, shopTarget } from './lib/shopLink.js'
import { SWIM_INVITE_PATH, rememberSwimInvite, readSwimInvite } from './lib/swim.js'
import { fetchIsAdmin } from './lib/coachApi.js'
import { useUnreadCount } from './lib/notifications.js'
import { hasConsented } from './lib/legal.js'
import Brand from './components/Brand.jsx'

// Workout is the landing tab; everything else loads the first time it's opened
const Auth              = lazy(() => import('./pages/Auth.jsx'))
const Landing           = lazy(() => import('./pages/Landing.jsx'))
const Guide             = lazy(() => import('./pages/Guide.jsx'))
const ShopPreview       = lazy(() => import('./pages/ShopPreview.jsx'))
const NewPasswordSheet  = lazy(() => import('./components/NewPasswordSheet.jsx'))
const Onboarding        = lazy(() => import('./pages/Onboarding.jsx'))
const ConsentScreen     = lazy(() => import('./components/LegalConsent.jsx'))
const FitnessOnboarding = lazy(() => import('./pages/FitnessOnboarding.jsx'))
const Calories          = lazy(() => import('./pages/Calories.jsx'))
const Library           = lazy(() => import('./pages/Library.jsx'))
const Group             = lazy(() => import('./pages/Group.jsx'))
const Plan              = lazy(() => import('./pages/Plan.jsx'))
const Progress          = lazy(() => import('./pages/Progress.jsx'))
const Coach             = lazy(() => import('./pages/Coach.jsx'))
const Coaches           = lazy(() => import('./pages/Coaches.jsx'))
const Swim              = lazy(() => import('./pages/Swim.jsx'))
const ProfileModal      = lazy(() => import('./components/ProfileModal.jsx'))
const UpgradeSheet      = lazy(() => import('./components/UpgradeSheet.jsx'))
const NotificationsSheet = lazy(() => import('./components/NotificationsSheet.jsx'))

// Before the shell exists: the wordmark on the canvas. Inside the shell: a content-shaped skeleton.
const Loading = () => (
  <div role="status" aria-label="Loading" className="min-h-screen bg-canvas flex items-center justify-center">
    <Brand size="text-[1.625rem]" className="animate-pulse" />
  </div>
)
const PageLoading = () => <PageSkeleton />

// athrion.app/workout (and the older /guide): the free 7-day plan linked from Instagram
const onGuidePath = () => /^\/(workout|guide)\/?$/.test(window.location.pathname)
// athrion.app/add/<nickname>: a friend invite
const INVITE_PATH = /^\/add\/@?([A-Za-z0-9._-]{3,20})\/?$/

const PAGES = { workout: Workout, calories: Calories, library: Library, group: Group, plan: Plan, progress: Progress, coach: Coach, shop: Coaches, swim: Swim }
// The coach shop is hidden from everyone but admins while it's being built
const ADMIN_PAGES = ['shop', 'coach']

export default function App() {
  // undefined = auth not yet resolved; null = logged out; object = logged in
  const [session, setSession]   = useState(undefined)
  // Signed-out: landing page for new visitors, straight to sign in for people who've been here
  const [authMode, setAuthMode] = useState(() => {
    if (new URLSearchParams(window.location.search).has('signup')) return 'register'
    if (onGuidePath() || parseShopPath(window.location.pathname)) return null
    if (INVITE_PATH.test(window.location.pathname) || SWIM_INVITE_PATH.test(window.location.pathname)) {
      try { return localStorage.getItem('athrion_signed_in_before') ? 'login' : 'register' } catch { return 'register' }
    }
    try { return localStorage.getItem('athrion_signed_in_before') ? 'login' : null } catch { return null }
  })
  const [recovering, setRecovering] = useState(false)
  // Open on /guide, or after "Start this plan free" until the new account has saved it
  const [guide, setGuide] = useState(() => onGuidePath() || !!readGuidePick())
  // athrion.app/shop/<product> or /shop/coach/<coach>: a shared coach shop link (public preview signed out)
  const [shopLink, setShopLink] = useState(() => parseShopPath(window.location.pathname))
  // A friend invite opens Train together → Friends once signed in; it survives sign-up
  const [groupIntent, setGroupIntent] = useState(() => {
    const m = window.location.pathname.match(INVITE_PATH)
    if (m) { rememberInvite(m[1]); window.history.replaceState(null, '', '/') }
    const invite = readInvite()
    return invite ? { tab: 'friends', invite } : null
  })
  // athrion.app/swim/<code>: a swim team invite; opens the Swim tab's Team once signed in, through sign-up too
  const [swimIntent, setSwimIntent] = useState(() => {
    const m = window.location.pathname.match(SWIM_INVITE_PATH)
    if (m) { rememberSwimInvite(m[1].toLowerCase()); window.history.replaceState(null, '', '/') }
    const invite = readSwimInvite()
    return invite ? { invite } : null
  })
  const [isAdmin, setIsAdmin] = useState(undefined) // undefined until checked
  const [profile, setProfile]   = useState(undefined) // undefined=loading, null=incomplete, obj=complete
  const [fitnessProfile, setFitnessProfile] = useState(undefined) // undefined=loading, null=not set, obj=loaded
  const [isPro, setIsPro]       = useState(false)
  const [theme, setTheme]       = useState(() => localStorage.getItem('athrion_theme') || 'dark')
  const [page, setPage]           = useState('workout')
  const [pendingWorkout, setPendingWorkout] = useState(null)
  const [showProfile, setShowProfile]   = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [checkout, setCheckout] = useState({ open: false, busy: false, error: '' })
  const [planSetup, setPlanSetup] = useState(false) // free user answering the plan questions
  const [foodIntent, setFoodIntent] = useState(null) // 'goals': open the targets editor on Food
  const [shopIntent, setShopIntent] = useState(null) // { product, paid } or { coach }: open it on the Coaches tab
  const [resumeTick, setResumeTick] = useState(0)    // bumped when the session bar is tapped
  const minimised = useMinimisedSession()
  const [unread, setUnread] = useUnreadCount(!!session)
  const [showInbox, setShowInbox] = useState(false)
  // Where a tapped notification points: /?open=friends | ranks | workout | progress | notifications | coach,
  // or shop (&product=<id>, back from buying a coach's workout). A shared shop link, or one
  // remembered through sign-up, opens that product or coach.
  const [pendingOpen, setPendingOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    if (open) return open === 'shop' && params.get('product') ? `shop:${params.get('product')}:${params.get('paid') ? 'paid' : ''}` : open
    const link = parseShopPath(window.location.pathname) || readShopLink()
    return link ? shopTarget(link) : null
  })
  // Tidy the address once read. Not inside the initializer: StrictMode runs that twice in dev,
  // and the second run would find the link already gone.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('open')) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const { focus } = useShell()

  // Pages live in browser history so the phone's back gesture steps back inside the app.
  // History is [landing] or [landing, other page], plus one entry per open sub-screen.
  const pageRef = useRef(page)
  pageRef.current = page
  function navigate(next) {
    const cur = pageRef.current
    if (next === cur) return
    const subs = dropBackHandlers()
    const curDepth = cur === LANDING ? 0 : 1
    const nextDepth = next === LANDING ? 0 : 1
    silentBack(subs + (curDepth && !nextDepth ? 1 : 0))
    if (nextDepth) (curDepth ? replaceEntry : pushEntry)({ page: next })
    pageRef.current = next
    setPage(next)
  }

  useEffect(() => {
    replaceEntry({ page: LANDING })
    return onPageBack(state => setPage(state?.page && state.page in PAGES ? state.page : LANDING))
  }, [])

  function handleStartFromLibrary(exercises, name) {
    setPendingWorkout({ exercises, name })
    navigate('workout')
  }

  // Plan's "Start this workout": straight into the session, as on the Train tab
  function handleStartPlanDay(day) {
    setPendingWorkout({ name: day.title, planExercises: day.workout?.exercises ?? [] })
    navigate('workout')
  }

  function resumeWorkout() {
    setSessionMinimised(false)
    setResumeTick(t => t + 1)
    navigate('workout')
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  // Theme tokens live on <html> too, so sheets portalled into <body> follow the theme
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    if (session) try { localStorage.setItem('athrion_signed_in_before', '1') } catch { /* private mode */ }
  }, [session?.email])

  // In the native app, pull recent health data on launch if access was already granted
  useEffect(() => {
    if (session && healthSyncAvailable()) syncHealthData(3, { prompt: false }).catch(() => {})
  }, [session?.email])

  useEffect(() => {
    // Token refreshes fire auth events with a new session object for the same user;
    // keep the existing state then, or the whole app reloads and loses the open screen
    const applySession = s => setSession(prev => {
      const next = toProfile(s)
      return prev && next && prev.email === next.email && prev.name === next.name && prev.consented === next.consented ? prev : next
    })
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true) // opened the reset link from email
      applySession(session)
    })
    // Handle Stripe redirect back after successful checkout
    const params = new URLSearchParams(window.location.search)
    if (params.get('upgraded') === '1') {
      window.history.replaceState({}, '', window.location.pathname)
      // Give the webhook ~2s to write before re-fetching
      setTimeout(() => {
        fetchSubscriptionStatus().then(setIsPro).catch(() => {})
      }, 2000)
    }
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // auth not resolved yet
    if (!session) { setProfile(null); setFitnessProfile(null); setIsPro(false); return }
    setProfile(undefined)
    setFitnessProfile(undefined)
    fetchUserProfile()
      .then(p => setProfile(p ?? null))
      .catch(() => setProfile(null))
    fetchFitnessProfile()
      .then(fp => setFitnessProfile(fp ?? null))
      .catch(() => setFitnessProfile(null))
    fetchSubscriptionStatus()
      .then(setIsPro)
      .catch(() => setIsPro(false))
    fetchIsAdmin().then(setIsAdmin).catch(() => setIsAdmin(false))
  }, [session])

  // Each intent opens Train together once (not again when the profile reloads)
  const handledIntent = useRef(null)
  useEffect(() => {
    if (groupIntent && groupIntent !== handledIntent.current && session && profile && !guide) {
      handledIntent.current = groupIntent
      navigate('group')
    }
  }, [groupIntent, session, profile, guide])

  const handledSwim = useRef(null)
  useEffect(() => {
    if (swimIntent && swimIntent !== handledSwim.current && session && profile && !guide) {
      handledSwim.current = swimIntent
      navigate('swim')
    }
  }, [swimIntent, session, profile, guide])

  function openTarget(target) {
    setShowInbox(false)
    if (target === 'friends' || target === 'ranks') setGroupIntent({ tab: target })
    else if (target === 'workout') resumeWorkout()
    else if (target === 'progress') navigate('progress')
    else if (target === 'notifications') setShowInbox(true)
    else if (target === 'swim') navigate('swim')
    else if (!isAdmin && (target === 'coach' || target?.startsWith('shop'))) clearShopLink()
    else if (target === 'coach') navigate('coach')
    else if (target?.startsWith('shop')) {
      const [kind, id, paid] = target.split(':')
      setShopIntent(kind === 'shopcoach' ? { coach: id } : { product: id || null, paid: paid === 'paid' })
      clearShopLink()
      if (parseShopPath(window.location.pathname)) window.history.replaceState(window.history.state, '', '/')
      navigate('shop')
    }
  }

  useEffect(() => {
    if (pendingOpen && session && profile && !guide && isAdmin !== undefined) {
      openTarget(pendingOpen)
      setPendingOpen(null)
    }
  }, [pendingOpen, session, profile, guide, isAdmin])

  function refreshProfile() {
    fetchUserProfile()
      .then(p => setProfile(p ?? null))
      .catch(() => setProfile(null))
  }

  function refreshFitnessProfile() {
    fetchFitnessProfile()
      .then(fp => setFitnessProfile(fp ?? null))
      .catch(() => setFitnessProfile(null))
  }

  // Every "Get Pro" button opens the upgrade sheet; it hands the chosen plan to Stripe
  function goUpgrade() {
    setShowProfile(false)
    setCheckout({ open: true, busy: false, error: '' })
  }

  async function startCheckout(plan) {
    setCheckout({ open: true, busy: true, error: '' })
    try {
      await createCheckoutSession(plan) // redirects to Stripe
    } catch (e) {
      setCheckout({ open: true, busy: false, error: e.message || 'Could not open checkout. Please try again.' })
    }
  }

  // The free 7-day plan picker, from the starter session on Train
  function openGuide() {
    window.history.pushState(window.history.state, '', '/workout')
    setGuide(true)
  }

  function leaveGuide() {
    clearGuidePick()
    if (onGuidePath()) window.history.replaceState(window.history.state, '', '/')
    setGuide(false)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('athrion_theme', next)
  }

  // Show loading while auth, profile, or fitness profile are resolving
  if (session === undefined || (session && (profile === undefined || fitnessProfile === undefined))) return <Loading />

  if (!session) return (
    <Suspense fallback={<Loading />}>
      {authMode
        ? <Auth key={authMode} initialMode={authMode} onBack={() => setAuthMode(null)} />
        : guide
        ? <Guide onStart={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')} />
        : shopLink
        ? <ShopPreview link={shopLink} onStart={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')}
            onHome={() => { clearShopLink(); setPendingOpen(null); window.history.replaceState(null, '', '/'); setShopLink(null) }} />
        : <Landing onCreateAccount={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')} />}
    </Suspense>
  )

  if (!session.consented) return (
    <Suspense fallback={<Loading />}>
      <ConsentScreen />
    </Suspense>
  )

  const profileComplete = profile && profile.sex && profile.height_cm != null && profile.weight_lb != null && profile.age != null
  if (!profileComplete || editingProfile) return (
    <Suspense fallback={<Loading />}>
      <Onboarding
        initialValues={profile}
        name={session.name}
        onComplete={() => { setEditingProfile(false); refreshProfile() }}
      />
    </Suspense>
  )

  if (guide) return (
    <Suspense fallback={<Loading />}>
      <Guide signedIn isPro={isPro} initialPick={readGuidePick()} onDone={leaveGuide} />
    </Suspense>
  )

  // Pro users who haven't done fitness onboarding get the setup gate; answers a
  // free user saved earlier carry over, so they land on "Build my plan"
  if (isPro && !fitnessProfile?.onboarding_completed) return (
    <Suspense fallback={<Loading />}>
      <FitnessOnboarding
        existingProfile={profile}
        saved={fitnessProfile}
        onComplete={refreshFitnessProfile}
      />
    </Suspense>
  )

  // Free users can answer the plan questions to get their targets, then choose the trial
  if (planSetup) return (
    <Suspense fallback={<Loading />}>
      <FitnessOnboarding
        existingProfile={profile}
        saved={fitnessProfile}
        isPro={false}
        onUpgrade={goUpgrade}
        onCancel={() => { setPlanSetup(false); refreshFitnessProfile() }}
      />
    </Suspense>
  )

  const pageProps = {
    workout: { pendingWorkout, onClearPending: () => setPendingWorkout(null), isPro, onUpgrade: goUpgrade, onOpenPage: navigate, onOpenGroup: tab => setGroupIntent({ tab }), onOpenGuide: openGuide, resumeTick },
    library: { onStartWorkout: handleStartFromLibrary },
    shop: { onStartPlanDay: handleStartPlanDay, onOpenCoach: () => navigate('coach'), shopIntent, onShopIntentDone: () => setShopIntent(null) },
    coach: { onOpenShop: () => navigate('shop') },
    calories: { profile, isPro, onUpgrade: goUpgrade, onGoToPlan: () => navigate('plan'), intent: foodIntent, onIntentHandled: () => setFoodIntent(null) },
    group: { session, intent: groupIntent, onIntentDone: () => setGroupIntent(null) },
    swim: { intent: swimIntent, onIntentDone: () => setSwimIntent(null) },
    progress: { profile, onProfileChange: refreshProfile },
    plan: { isPro, onUpgrade: goUpgrade, onStartSetup: () => setPlanSetup(true), onGoToWorkout: () => navigate('workout'), onStartWorkout: handleStartPlanDay, profile, onProfileChange: () => { refreshProfile(); refreshFitnessProfile() } },
  }

  const PageComponent = (!isAdmin && ADMIN_PAGES.includes(page) ? null : PAGES[page]) ?? Workout

  const isLight = theme === 'light'

  return (
    <UnitProvider value={profile?.weight_unit === 'kg' ? 'kg' : 'lb'}>
    <div className={`min-h-dvh bg-canvas text-ink font-dm${isLight ? ' light' : ''}`}>
      <Nav page={page} setPage={navigate} session={session} isPro={isPro} isAdmin={!!isAdmin} onProfileClick={() => setShowProfile(true)}
        unread={unread} onBellClick={() => setShowInbox(true)}
        minimised={minimised} onResume={resumeWorkout} />
      <main className="relative z-10 max-w-lg mx-auto px-4"
        style={{
          paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))',
          paddingBottom: `calc(${focus ? 24 : minimised ? 52 + 56 + 24 : 56 + 24}px + env(safe-area-inset-bottom))`,
        }}>
        {/* Watched by the header: once this scrolls away, the bar title fades in */}
        <div id="page-top" aria-hidden="true" className="absolute left-0 top-0 h-[calc(var(--header-h)+48px)] w-px pointer-events-none" />
        <Suspense fallback={<PageLoading />}>
          <PageComponent key={page} {...pageProps[page]} />
        </Suspense>
      </main>

      <HomeScreenPrompt />

      {recovering && (
        <Suspense fallback={null}>
          <NewPasswordSheet onClose={() => setRecovering(false)} />
        </Suspense>
      )}

      {showInbox && (
        <Suspense fallback={null}>
          <NotificationsSheet onClose={() => setShowInbox(false)} onRead={() => setUnread(0)}
            onGo={url => openTarget(new URLSearchParams(url.split('?')[1] || '').get('open'))} />
        </Suspense>
      )}

      {checkout.open && (
        <Suspense fallback={null}>
          <UpgradeSheet busy={checkout.busy} error={checkout.error} onCheckout={startCheckout}
            onClose={() => setCheckout({ open: false, busy: false, error: '' })} />
        </Suspense>
      )}

      {showProfile && (
        <Suspense fallback={null}>
          <ProfileModal
            session={session}
            profile={profile}
            isPro={isPro}
            theme={theme}
            onToggleTheme={toggleTheme}
            onClose={() => setShowProfile(false)}
            onEdit={() => { setShowProfile(false); setEditingProfile(true) }}
            onUpgrade={goUpgrade}
            onOpenCoach={isAdmin ? () => { setShowProfile(false); navigate('coach') } : undefined}
            onEditTargets={() => { setShowProfile(false); setFoodIntent('goals'); navigate('calories') }}
          />
        </Suspense>
      )}
    </div>
    </UnitProvider>
  )
}

function toProfile(session) {
  if (!session) return null
  return {
    name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
    email: session.user.email,
    consented: hasConsented(session.user),
  }
}
