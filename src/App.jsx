import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase.js'
import { fetchUserProfile, fetchProState } from './lib/api.js'
import { fetchFitnessProfile } from './lib/fitnessApi.js'
import Workout from './pages/Workout.jsx'
import { healthSyncAvailable, syncHealthData } from './lib/health.js'
import Nav, { LANDING, useMinimisedSession } from './components/Nav.jsx'
import { useShell, onPageBack, pushEntry, replaceEntry, silentBack, dropBackHandlers, setSessionMinimised } from './lib/shell.js'
import { createCheckoutSession } from './lib/stripe.js'
import { UnitProvider } from './lib/units.js'
import { COACH_PLAN_ON_SALE } from './lib/pricing.js'
import { readTheme, saveTheme, shownTheme, themeClasses, applyTheme, isProTheme, LANDING_THEME } from './lib/theme.js'
import { Snow } from './components/Festive.jsx'
import { CLUB_PATH, rememberClubInvite, readClubInvite } from './lib/clubApi.js'
import HomeScreenPrompt from './components/HomeScreenPrompt.jsx'
import { PageSkeleton } from './components/ui/States.jsx'
import { readGuidePick, clearGuidePick } from './lib/guidePlans.js'
import { rememberInvite, readInvite } from './lib/socialApi.js'
import { parseShopPath, readShopLink, clearShopLink, shopTarget } from './lib/shopLink.js'
import { rememberCardioSport } from './lib/cardio.js'
import { PARENT_PATH, fetchParentalConsent } from './lib/parentConsent.js'
import { TRAINER_PATH, rememberTrainerInvite, readTrainerInvite, clearTrainerInvite } from './lib/clientsApi.js'
import { parseRoomPath, rememberRoomLink, readRoomLink, clearRoomLink } from './lib/roomLink.js'
import { SWIM_INVITE_PATH, rememberSwimInvite, readSwimInvite, rememberSwimStart, readSwimStart, clearSwimStart } from './lib/swim.js'
import { fetchIsAdmin } from './lib/coachApi.js'
import { useUnreadCount } from './lib/notifications.js'
import { hasConsented } from './lib/legal.js'
import Brand from './components/Brand.jsx'

// Workout is the landing tab; everything else loads the first time it's opened
const Auth              = lazy(() => import('./pages/Auth.jsx'))
const Landing           = lazy(() => import('./pages/Landing.jsx'))
const Guide             = lazy(() => import('./pages/Guide.jsx'))
const ShopPreview       = lazy(() => import('./pages/ShopPreview.jsx'))
const RoomPreview       = lazy(() => import('./pages/RoomPreview.jsx'))
import FinishProfileSheet, { statsReminderDue, statsReminded } from './components/FinishProfileSheet.jsx'
import { todayKey } from './lib/data.js'
const NewPasswordSheet  = lazy(() => import('./components/NewPasswordSheet.jsx'))
const Onboarding        = lazy(() => import('./pages/Onboarding.jsx'))
const ConsentScreen     = lazy(() => import('./components/LegalConsent.jsx'))
const FitnessOnboarding = lazy(() => import('./pages/FitnessOnboarding.jsx'))
const Calories          = lazy(() => import('./pages/Calories.jsx'))
const Library           = lazy(() => import('./pages/Library.jsx'))
const Group             = lazy(() => import('./pages/Group.jsx'))
const Plan              = lazy(() => import('./pages/Plan.jsx'))
const Coach             = lazy(() => import('./pages/Coach.jsx'))
const Coaches           = lazy(() => import('./pages/Coaches.jsx'))
const Cardio            = lazy(() => import('./pages/Cardio.jsx')) // Swim and Run
const Clients           = lazy(() => import('./pages/Clients.jsx')) // a coach's clients (031)
const JoinTrainerSheet  = lazy(() => import('./components/JoinTrainerSheet.jsx'))
const ParentGate        = lazy(() => import('./components/ParentGate.jsx'))
const ParentConsent     = lazy(() => import('./pages/ParentConsent.jsx')) // athrion.app/parent/<token>
const ProfileModal      = lazy(() => import('./components/ProfileModal.jsx'))
const UpgradeSheet      = lazy(() => import('./components/UpgradeSheet.jsx'))
const NotificationsSheet = lazy(() => import('./components/NotificationsSheet.jsx'))
const WeighInSheet      = lazy(() => import('./components/WeighInSheet.jsx'))

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

const PAGES = { workout: Workout, calories: Calories, library: Library, group: Group, plan: Plan, coach: Coach, shop: Coaches, swim: Cardio, clients: Clients }
// The coach shop is hidden from everyone but admins while it's being built
const ADMIN_PAGES = ['shop', 'coach']
// Pages that need body stats (calories, plans); a quick sign-up adds them before opening these
const STATS_PAGES = ['calories', 'plan']

export default function App() {
  // undefined = auth not yet resolved; null = logged out; object = logged in
  const [session, setSession]   = useState(undefined)
  // Signed-out: landing page for new visitors, straight to sign in for people who've been here
  const [authMode, setAuthMode] = useState(() => {
    if (new URLSearchParams(window.location.search).has('signup')) return 'register'
    if (onGuidePath() || parseShopPath(window.location.pathname) || parseRoomPath(window.location.pathname)) return null
    if (INVITE_PATH.test(window.location.pathname) || SWIM_INVITE_PATH.test(window.location.pathname) || TRAINER_PATH.test(window.location.pathname)) {
      try { return localStorage.getItem('athrion_signed_in_before') ? 'login' : 'register' } catch { return 'register' }
    }
    try { return localStorage.getItem('athrion_signed_in_before') ? 'login' : null } catch { return null }
  })
  const [recovering, setRecovering] = useState(false)
  // Open on /guide, or after "Start this plan free" until the new account has saved it
  const [guide, setGuide] = useState(() => onGuidePath() || !!readGuidePick())
  // athrion.app/shop/<product> or /shop/coach/<coach>: a shared coach shop link (public preview signed out)
  const [shopLink, setShopLink] = useState(() => parseShopPath(window.location.pathname))
  // athrion.app/r/<code>: a room link. Signed out it shows the room's preview; the code is kept
  // (on the phone and, from sign-up, in the account) and the room opens once signed in
  const [roomLink, setRoomLink] = useState(() => parseRoomPath(window.location.pathname))
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
    return invite ? { invite } : readSwimStart() ? { start: true } : null
  })
  // athrion.app/trainer/<code>: a coach's client invite; asks to join once signed in, through sign-up too
  const [trainerInvite, setTrainerInvite] = useState(() => {
    const m = window.location.pathname.match(TRAINER_PATH)
    if (m) { rememberTrainerInvite(m[1].toLowerCase()); window.history.replaceState(null, '', '/') }
    return readTrainerInvite()
  })
  // athrion.app/parent/<token>: a parent approving a teen's account, signed in or not
  const [parentToken, setParentToken] = useState(() => window.location.pathname.match(PARENT_PATH)?.[1] ?? null)
  // Under 16 (032): undefined while loading, null for no record, else the consent row
  const [minorConsent, setMinorConsent] = useState(undefined)
  const [askParentAge, setAskParentAge] = useState(null) // the age a teen picked in onboarding
  const refreshConsent = () => fetchParentalConsent().then(c => setMinorConsent(c ?? null)).catch(() => setMinorConsent(null))
  const [isAdmin, setIsAdmin] = useState(undefined) // undefined until checked
  const [profile, setProfile]   = useState(undefined) // undefined=loading, null=incomplete, obj=complete
  const [fitnessProfile, setFitnessProfile] = useState(undefined) // undefined=loading, null=not set, obj=loaded
  const [isPro, setIsPro]       = useState(false)
  const [coachPlan, setCoachPlan] = useState(false) // the coach and club plan (039)
  const [proKnown, setProKnown] = useState(false) // Pro themes fall back only once the answer is in
  const [theme, setTheme]       = useState(readTheme)
  const shown = shownTheme(theme, proKnown ? isPro : undefined)
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
  const [showWeighIn, setShowWeighIn] = useState(false) // a weigh-in reminder was tapped
  const [, setReminderTick] = useState(0) // re-render once the finish-profile reminder is put off
  // Where a tapped notification points: /?open=friends | ranks | workout | weighin | progress | notifications | coach,
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
  // The landing page and making an account (signed out, the consent screen, a parent's OK, the
  // first onboarding) wear the season's theme (LANDING_THEME); after that, the person's own
  const festive = session === null || (!!session && (!session.consented || profile === null || !!askParentAge || (!!minorConsent && minorConsent.status !== 'approved')))
  useEffect(() => { applyTheme(festive ? LANDING_THEME : shown) }, [shown, festive])

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
      return prev && next && prev.email === next.email && prev.name === next.name && prev.consented === next.consented && prev.roomMeta?.room_code === next.roomMeta?.room_code ? prev : next
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
        refreshPro()
      }, 2000)
    }
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // auth not resolved yet
    if (!session) { setProfile(null); setFitnessProfile(null); setIsPro(false); setCoachPlan(false); setProKnown(true); setMinorConsent(null); return }
    refreshConsent()
    setProfile(undefined)
    setFitnessProfile(undefined)
    fetchUserProfile()
      .then(p => setProfile(p ?? null))
      .catch(() => setProfile(null))
    fetchFitnessProfile()
      .then(fp => setFitnessProfile(fp ?? null))
      .catch(() => setFitnessProfile(null))
    refreshPro()
    fetchIsAdmin().then(setIsAdmin).catch(() => setIsAdmin(false))
  }, [session])

  // A room link, opened signed in or remembered through sign-up: join that room
  useEffect(() => {
    if (!session || !profile || guide) return
    const fromPath = parseRoomPath(window.location.pathname)
    if (fromPath) { rememberRoomLink(fromPath); window.history.replaceState(null, '', '/'); setRoomLink(null) }
    const code = readRoomLink({ user_metadata: session.roomMeta })
    if (!code) return
    clearRoomLink({ user_metadata: session.roomMeta })
    setGroupIntent({ tab: 'rooms', join: code })
  }, [session, profile, guide])

  // athrion.app/club/<code> (039): kept through sign-up, then the Friends tab's Leaderboard offers to join
  useEffect(() => {
    const m = window.location.pathname.match(CLUB_PATH)
    if (m) { rememberClubInvite(m[1]); window.history.replaceState(null, '', '/') }
  }, [])
  const offeredClub = useRef(null)
  useEffect(() => {
    if (!session || !profile || guide) return
    const code = readClubInvite()
    if (!code || offeredClub.current === code) return
    offeredClub.current = code
    setGroupIntent({ tab: 'ranks', club: code })
  }, [session, profile, guide])

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
      clearSwimStart()
      navigate('swim')
    }
  }, [swimIntent, session, profile, guide])

  function openTarget(target) {
    setShowInbox(false)
    if (target === 'friends' || target === 'ranks') setGroupIntent({ tab: target })
    else if (target === 'next') setGroupIntent({ tab: 'rooms' }) // a booked session's reminder: Rooms shows it on top
    else if (target === 'workout') resumeWorkout()
    else if (target === 'progress') setShowProfile('progress') // Progress lives in the You sheet
    else if (target === 'notifications') setShowInbox(true)
    else if (target === 'weighin') setShowWeighIn(true)
    else if (target === 'review') setShowProfile('review')
    else if (target === 'swim') navigate('swim')
    else if (target === 'team') setSwimIntent({ tab: 'team' })
    else if (target === 'clients') navigate('clients')
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

  // Pro, and the coach plan on top of it (039); a prize month is Pro only
  function refreshPro() {
    return fetchProState()
      .then(({ paid, prizeUntil, coach }) => { setIsPro(paid || !!prizeUntil); setCoachPlan(!!coach) })
      .catch(() => { setIsPro(false); setCoachPlan(false) })
      .finally(() => setProKnown(true))
  }

  // Every "Get Pro" button opens the upgrade sheet; it hands the chosen plan to Stripe.
  // kind 'coach' opens it on the coach and club plan (a click event counts as Pro).
  function goUpgrade(kind) {
    setShowProfile(false)
    setCheckout({ open: true, busy: false, error: '', kind: kind === 'coach' ? 'coach' : 'pro' })
  }
  // Nothing offers the coach plan until it's on sale (pricing.js)
  const goCoachPlan = COACH_PLAN_ON_SALE ? () => goUpgrade('coach') : undefined

  async function startCheckout(plan) {
    setCheckout(c => ({ ...c, open: true, busy: true, error: '' }))
    try {
      const r = await createCheckoutSession(plan) // redirects to Stripe, or switches a live subscription
      if (r?.switched) {
        setCheckout(c => ({ ...c, busy: false, done: true }))
        setTimeout(refreshPro, 2500) // the webhook writes the new tier
      }
    } catch (e) {
      setCheckout(c => ({ ...c, open: true, busy: false, error: e.message || 'Could not open checkout. Please try again.' }))
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

  // Pro themes (lib/theme.js) open Get Pro for free accounts
  function pickTheme(next) {
    if (isProTheme(next) && !isPro) { goUpgrade(); return }
    setTheme(next)
    saveTheme(next)
  }

  if (parentToken) return (
    <Suspense fallback={<Loading />}>
      <ParentConsent token={parentToken} onDone={() => { window.history.replaceState(null, '', '/'); setParentToken(null) }} />
    </Suspense>
  )

  // Show loading while auth, profile, or fitness profile are resolving
  if (session === undefined || (session && (profile === undefined || fitnessProfile === undefined))) return <Loading />

  if (!session) return (
    <Suspense fallback={<Loading />}>
      {authMode
        ? <Auth key={authMode} initialMode={authMode} onBack={() => setAuthMode(null)} />
        : guide
        ? <Guide onStart={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')} />
        : roomLink
        ? <RoomPreview code={roomLink} onStart={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')}
            onHome={() => { window.history.replaceState(null, '', '/'); setRoomLink(null) }} />
        : shopLink
        ? <ShopPreview link={shopLink} onStart={() => setAuthMode('register')} onSignIn={() => setAuthMode('login')}
            onHome={() => { clearShopLink(); setPendingOpen(null); window.history.replaceState(null, '', '/'); setShopLink(null) }} />
        : <><Snow /><Landing onCreateAccount={from => {
            if (from === 'swim') { rememberSwimStart(); setSwimIntent(i => i ?? { start: true }) }
            // Start running: Cardio opens on Run (remembered on the device) once signed up
            if (from === 'run') { rememberCardioSport('run'); setPendingOpen(p => p ?? 'swim') }
            setAuthMode('register')
          }} onSignIn={() => setAuthMode('login')} /></>}
    </Suspense>
  )

  if (!session.consented) return (
    <Suspense fallback={<Loading />}>
      <ConsentScreen agreedBefore={session.agreedBefore} />
    </Suspense>
  )

  // Under 16: nothing opens until a parent approves (032)
  if (session.consented && minorConsent === undefined) return <Loading />
  if (askParentAge || (minorConsent && minorConsent.status !== 'approved')) return (
    <Suspense fallback={<Loading />}>
      <ParentGate consent={minorConsent} age={askParentAge}
        onChanged={() => refreshConsent().then(() => setAskParentAge(null))}
        onBack={askParentAge && !minorConsent ? () => setAskParentAge(null) : undefined} />
    </Suspense>
  )
  const isMinor = !!(minorConsent?.status === 'approved' && minorConsent.minor)

  const profileComplete = profile && profile.sex && profile.height_cm != null && profile.weight_lb != null && profile.age != null
  // Fast join (R5): from a room link a new account gives only a nickname and age and goes
  // straight to the room; body stats wait (a reminder asks later). Food, Plan and the plan
  // questions need them, so those ask first.
  const quickJoin = !profile && !!readRoomLink({ user_metadata: session.roomMeta })
  const statsLater = !!profile && profile.age != null && !profileComplete
  const needsStats = statsLater && (STATS_PAGES.includes(page) || planSetup || isPro)
  if ((!profileComplete && !statsLater) || needsStats || editingProfile) return (
    <Suspense fallback={<Loading />}>
      <Onboarding
        initialValues={profile}
        name={session.name}
        quick={quickJoin}
        onCancel={needsStats && !editingProfile ? () => navigate('workout') : undefined}
        onComplete={() => { setEditingProfile(false); refreshProfile() }}
        onMinor={minorConsent?.status === 'approved' ? undefined : setAskParentAge}
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
    workout: { pendingWorkout, onClearPending: () => setPendingWorkout(null), isPro, isMinor, onUpgrade: goUpgrade, onOpenPage: navigate, onOpenGuide: openGuide, resumeTick, onTrainTogether: isMinor ? undefined : host => setGroupIntent({ tab: 'rooms', host }) },
    library: { onStartWorkout: handleStartFromLibrary },
    shop: { isMinor, onStartPlanDay: handleStartPlanDay, onOpenCoach: () => navigate('coach'), shopIntent, onShopIntentDone: () => setShopIntent(null) },
    coach: { onOpenShop: () => navigate('shop') },
    calories: { profile, isPro, onUpgrade: goUpgrade, onGoToPlan: () => navigate('plan'), intent: foodIntent, onIntentHandled: () => setFoodIntent(null) },
    group: { session, intent: groupIntent, onIntentDone: () => setGroupIntent(null), isMinor, coachPlan, onCoachPlan: goCoachPlan },
    clients: { coachPlan, onCoachPlan: goCoachPlan },
    swim: { intent: swimIntent, onIntentDone: () => setSwimIntent(null), isPro, onUpgrade: goUpgrade },
    plan: { isPro, onUpgrade: goUpgrade, onStartSetup: () => setPlanSetup(true), onGoToWorkout: () => navigate('workout'), onStartWorkout: handleStartPlanDay, onOpenSwim: () => { rememberCardioSport('swim'); navigate('swim') }, onOpenRun: () => { rememberCardioSport('run'); navigate('swim') }, profile, onProfileChange: () => { refreshProfile(); refreshFitnessProfile() } },
  }

  const PageComponent = (!isAdmin && ADMIN_PAGES.includes(page) ? null : PAGES[page]) ?? Workout

  return (
    <UnitProvider value={profile?.weight_unit === 'kg' ? 'kg' : 'lb'}>
    <div className={`min-h-dvh bg-canvas text-ink font-dm ${themeClasses(shown)}`}>
      <Snow />
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

      {trainerInvite && (
        <Suspense fallback={null}>
          <JoinTrainerSheet code={trainerInvite} onClose={() => { clearTrainerInvite(); setTrainerInvite(null) }} />
        </Suspense>
      )}

      {statsLater && !editingProfile && !groupIntent && page !== 'group' && !hasOpenRoom() && statsReminderDue(todayKey()) && (
        <FinishProfileSheet
          onLater={() => { statsReminded(todayKey()); setReminderTick(t => t + 1) }}
          onFinish={() => { statsReminded(todayKey()); setEditingProfile(true) }} />
      )}

      {showWeighIn && (
        <Suspense fallback={null}>
          <WeighInSheet onClose={() => setShowWeighIn(false)} onProfileChange={refreshProfile} />
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
          <UpgradeSheet busy={checkout.busy} error={checkout.error} onCheckout={startCheckout} minor={isMinor}
            initialKind={checkout.kind} isPro={isPro} coachPlan={coachPlan} switched={checkout.done}
            onClose={() => setCheckout({ open: false, busy: false, error: '' })} />
        </Suspense>
      )}

      {showProfile && (
        <Suspense fallback={null}>
          <ProfileModal
            initialScreen={['review', 'progress'].includes(showProfile) ? showProfile : 'profile'}
            onProfileChange={refreshProfile}
            session={session}
            profile={profile}
            isPro={isPro}
            coachPlan={coachPlan}
            theme={shown}
            onPickTheme={pickTheme}
            onClose={() => setShowProfile(false)}
            onEdit={() => { setShowProfile(false); setEditingProfile(true) }}
            onUpgrade={goUpgrade}
            onOpenCoach={isAdmin ? () => { setShowProfile(false); navigate('coach') } : undefined}
            onOpenClients={() => { setShowProfile(false); navigate('clients') }}
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
    // A room link kept through sign-up (roomLink.js), so it opens on whichever device signs in
    roomMeta: session.user.user_metadata?.room_code ? { room_code: session.user.user_metadata.room_code, room_at: session.user.user_metadata.room_at } : null,
    // Agreed to an older version, or an email account from before the terms; a Google or Apple
    // account that never agreed is a new sign-up
    agreedBefore: !!session.user?.user_metadata?.legal_version || (session.user?.app_metadata?.provider ?? 'email') === 'email',
  }
}

// A workout under way on this phone: a Train together room, or one on Train
function hasOpenRoom() {
  try { return !!localStorage.getItem('athrion_group_session_state') || !!localStorage.getItem('athrion_workout') } catch { return false }
}
