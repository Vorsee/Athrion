import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase.js'
import { fetchUserProfile, fetchSubscriptionStatus } from './lib/api.js'
import { fetchFitnessProfile } from './lib/fitnessApi.js'
import Workout from './pages/Workout.jsx'
import { healthSyncAvailable, syncHealthData } from './lib/health.js'
import { Icon } from '@iconify/react'
import Nav, { PARENT_TAB } from './components/Nav.jsx'
import { createCheckoutSession } from './lib/stripe.js'
import HomeScreenPrompt from './components/HomeScreenPrompt.jsx'

// Workout is the landing tab; everything else loads the first time it's opened
const Auth              = lazy(() => import('./pages/Auth.jsx'))
const Onboarding        = lazy(() => import('./pages/Onboarding.jsx'))
const FitnessOnboarding = lazy(() => import('./pages/FitnessOnboarding.jsx'))
const Calories          = lazy(() => import('./pages/Calories.jsx'))
const Library           = lazy(() => import('./pages/Library.jsx'))
const Group             = lazy(() => import('./pages/Group.jsx'))
const Plan              = lazy(() => import('./pages/Plan.jsx'))
const Progress          = lazy(() => import('./pages/Progress.jsx'))
const ProfileModal      = lazy(() => import('./components/ProfileModal.jsx'))

const Loading = () => (
  <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
    <div className="text-gray-400 text-sm">Loading...</div>
  </div>
)
const PageLoading = () => <div className="py-20 text-center text-gray-500 text-sm animate-pulse">Loading...</div>

export default function App() {
  // undefined = auth not yet resolved; null = logged out; object = logged in
  const [session, setSession]   = useState(undefined)
  const [profile, setProfile]   = useState(undefined) // undefined=loading, null=incomplete, obj=complete
  const [fitnessProfile, setFitnessProfile] = useState(undefined) // undefined=loading, null=not set, obj=loaded
  const [isPro, setIsPro]       = useState(false)
  const [theme, setTheme]       = useState(() => localStorage.getItem('athrion_theme') || 'dark')
  const [page, setPage]           = useState('workout')
  const [pendingWorkout, setPendingWorkout] = useState(null)
  const [showProfile, setShowProfile]   = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [checkout, setCheckout] = useState({ busy: false, error: '' })

  function handleStartFromLibrary(exercises, name) {
    setPendingWorkout({ exercises, name })
    setPage('workout')
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  // In the native app, pull recent health data on launch if access was already granted
  useEffect(() => {
    if (session && healthSyncAvailable()) syncHealthData(3, { prompt: false }).catch(() => {})
  }, [session?.email])

  useEffect(() => {
    // Token refreshes fire auth events with a new session object for the same user;
    // keep the existing state then, or the whole app reloads and loses the open screen
    const applySession = s => setSession(prev => {
      const next = toProfile(s)
      return prev && next && prev.email === next.email && prev.name === next.name ? prev : next
    })
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applySession(session))
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
  }, [session])

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

  // One tap from any "Get Pro" button straight to Stripe checkout
  async function goUpgrade() {
    setShowProfile(false)
    setCheckout({ busy: true, error: '' })
    try {
      await createCheckoutSession() // redirects to Stripe
    } catch (e) {
      setCheckout({ busy: false, error: e.message || 'Could not open checkout. Please try again.' })
    }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('athrion_theme', next)
  }

  // Show loading while auth, profile, or fitness profile are resolving
  if (session === undefined || (session && (profile === undefined || fitnessProfile === undefined))) return <Loading />

  if (!session) return <Suspense fallback={<Loading />}><Auth /></Suspense>

  const profileComplete = profile && profile.sex && profile.height_cm != null && profile.weight_lb != null && profile.age != null
  if (!profileComplete || editingProfile) return (
    <Suspense fallback={<Loading />}>
      <Onboarding
        initialValues={profile}
        onComplete={() => { setEditingProfile(false); refreshProfile() }}
      />
    </Suspense>
  )

  // Pro users who haven't done fitness onboarding get the setup gate
  if (isPro && !fitnessProfile?.onboarding_completed) return (
    <Suspense fallback={<Loading />}>
      <FitnessOnboarding
        existingProfile={profile}
        onComplete={refreshFitnessProfile}
      />
    </Suspense>
  )

  const pageProps = {
    workout: { pendingWorkout, onClearPending: () => setPendingWorkout(null), isPro, onUpgrade: goUpgrade, onOpenPage: setPage },
    library: { onStartWorkout: handleStartFromLibrary },
    calories: { profile, isPro, onUpgrade: goUpgrade, onGoToPlan: () => setPage('plan') },
    group: { session },
    plan: { isPro, onUpgrade: goUpgrade, onGoToWorkout: () => setPage('workout'), profile, onProfileChange: () => { refreshProfile(); refreshFitnessProfile() } },
  }

  const pages = { workout: Workout, calories: Calories, library: Library, group: Group, plan: Plan, progress: Progress }
  const PageComponent = pages[page] ?? Workout

  const isLight = theme === 'light'

  return (
    <div className={`min-h-dvh bg-[#0A0A0A] text-white font-dm${isLight ? ' light' : ''}`}>
      <Nav page={page} setPage={setPage} session={session} isPro={isPro} onProfileClick={() => setShowProfile(true)} />
      <main className="relative z-10 max-w-lg mx-auto px-3 xs:px-4 pb-[82px] xs:pb-[90px]"
        style={{ paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))' }}>
        {PARENT_TAB[page] && (
          <button onClick={() => setPage(PARENT_TAB[page])}
            className="flex items-center gap-1 pt-3 -mb-1 text-sm text-gray-300 hover:text-white">
            <Icon icon="mdi:chevron-left" width={20} /> Back to {PARENT_TAB[page][0].toUpperCase() + PARENT_TAB[page].slice(1)}
          </button>
        )}
        <Suspense fallback={<PageLoading />}>
          <PageComponent key={page} {...pageProps[page]} />
        </Suspense>
      </main>

      <HomeScreenPrompt />

      {(checkout.busy || checkout.error) && (
        <div role={checkout.error ? 'alert' : 'status'}
          className="fixed left-4 right-4 z-[70] max-w-sm mx-auto rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-sm text-gray-200 shadow-xl flex items-center gap-3"
          style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
          {checkout.busy
            ? <><span className="w-4 h-4 border-2 border-neon/30 border-t-neon rounded-full animate-spin flex-shrink-0" /> Opening secure checkout…</>
            : <><span className="flex-1">{checkout.error}</span><button onClick={() => setCheckout({ busy: false, error: '' })} className="text-gray-400">Dismiss</button></>}
        </div>
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
          />
        </Suspense>
      )}
    </div>
  )
}

function toProfile(session) {
  if (!session) return null
  return {
    name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
    email: session.user.email,
  }
}
