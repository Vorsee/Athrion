import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { fetchUserProfile, fetchSubscriptionStatus } from './lib/api.js'
import { fetchFitnessProfile } from './lib/fitnessApi.js'
import Auth from './pages/Auth.jsx'
import Onboarding from './pages/Onboarding.jsx'
import FitnessOnboarding from './pages/FitnessOnboarding.jsx'
import Workout from './pages/Workout.jsx'
import Calories from './pages/Calories.jsx'
import Library from './pages/Library.jsx'
import Group from './pages/Group.jsx'
import Plan from './pages/Plan.jsx'
import Progress from './pages/Progress.jsx'
import { healthSyncAvailable, syncHealthData } from './lib/health.js'
import Upgrade from './pages/Upgrade.jsx'
import Nav from './components/Nav.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import HomeScreenPrompt from './components/HomeScreenPrompt.jsx'

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

  function goUpgrade() { setShowProfile(false); setPage('upgrade') }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('athrion_theme', next)
  }

  // Show loading while auth, profile, or fitness profile are resolving
  if (session === undefined || (session && (profile === undefined || fitnessProfile === undefined))) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-gray-600 text-sm tracking-widest uppercase">Loading...</div>
    </div>
  )

  if (!session) return <Auth />

  const profileComplete = profile && profile.sex && profile.height_cm != null && profile.weight_lb != null && profile.age != null
  if (!profileComplete || editingProfile) return (
    <Onboarding
      initialValues={profile}
      onComplete={() => { setEditingProfile(false); refreshProfile() }}
    />
  )

  // Pro users who haven't done fitness onboarding get the setup gate
  if (isPro && !fitnessProfile?.onboarding_completed) return (
    <FitnessOnboarding
      existingProfile={profile}
      onComplete={refreshFitnessProfile}
    />
  )

  // Upgrade page has its own full-screen layout — no nav wrapper
  if (page === 'upgrade') return (
    <Upgrade onBack={() => setPage('workout')} />
  )

  const pageProps = {
    workout: { pendingWorkout, onClearPending: () => setPendingWorkout(null), isPro, onUpgrade: goUpgrade },
    library: { onStartWorkout: handleStartFromLibrary },
    calories: { profile, isPro, onUpgrade: goUpgrade, onGoToPlan: () => setPage('plan') },
    group: { session },
    plan: { onGoToWorkout: () => setPage('workout'), profile, onProfileChange: () => { refreshProfile(); refreshFitnessProfile() } },
  }

  const pages = { workout: Workout, calories: Calories, library: Library, group: Group, plan: Plan, progress: Progress }
  const PageComponent = pages[page] ?? Workout

  const isLight = theme === 'light'

  return (
    <div className={`min-h-dvh bg-[#0A0A0A] text-white font-dm${isLight ? ' light' : ''}`}>
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: isLight
            ? 'linear-gradient(rgba(100,80,50,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(100,80,50,0.04) 1px,transparent 1px)'
            : 'linear-gradient(rgba(200,241,53,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,241,53,0.03) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <Nav page={page} setPage={setPage} session={session} isPro={isPro} onProfileClick={() => setShowProfile(true)} />
      <main className="relative z-10 max-w-lg mx-auto px-3 xs:px-4 pb-[82px] xs:pb-[90px]"
        style={{ paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))' }}>
        <PageComponent key={page} {...pageProps[page]} />
      </main>

      <HomeScreenPrompt />

      {showProfile && (
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
