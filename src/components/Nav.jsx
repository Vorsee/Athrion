import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useShell, goBack, readSession, SESSION_EVENT } from '../lib/shell.js'
import Brand from './Brand.jsx'

export const LANDING = 'workout'

const TABS = [
  { id: 'workout',  label: 'Train',    icon: 'mdi:dumbbell' },
  { id: 'plan',     label: 'Plan',     icon: 'mdi:calendar-check-outline', pro: true },
  { id: 'calories', label: 'Food',     icon: 'mdi:food-apple-outline' },
  { id: 'progress', label: 'Progress', icon: 'mdi:chart-line' },
  { id: 'shop',     label: 'Coaches',  icon: 'mdi:whistle-outline' },
]

// Pages opened from inside a tab, rather than from the bottom bar
export const PARENT_TAB = { library: 'workout', group: 'workout', coach: 'shop' }

// Header title per page. `large`: the page shows its own big title at the top of
// the content, so the bar title only fades in once that has scrolled away.
const PAGE_META = {
  workout:  { title: 'Train' },
  plan:     { title: 'Plan' },
  calories: { title: 'Food' },
  progress: { title: 'Progress', large: true },
  library:  { title: 'Library', large: true },
  group:    { title: 'Train together', large: true },
  coach:    { title: 'Coach', large: true },
  shop:     { title: 'Coaches', large: true },
}

export const pageTitle = id => PAGE_META[id]?.title ?? ''

// The fixed bar under the status bar. Shared by PageHeader and the active workout header.
export function HeaderBar({ children, label }) {
  return (
    <header aria-label={label} className="fixed top-0 left-0 right-0 z-50 bg-canvas/95 backdrop-blur border-b border-line"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-lg mx-auto px-2 xs:px-3 h-[var(--header-h)] flex items-center gap-1">
        {children}
      </div>
    </header>
  )
}

// True once the top of the page content has scrolled under the header
function useScrolledPast(page) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const el = document.getElementById('page-top')
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [page])
  return past
}

function PageHeader({ page, setPage, session, isPro, onProfileClick, unread = 0, onBellClick, shell }) {
  const scrolled = useScrolledPast(page)
  const meta = PAGE_META[page] ?? PAGE_META[LANDING]
  const parent = PARENT_TAB[page]
  const back = shell.back
    ? { label: shell.back.label, onClick: goBack }
    : parent ? { label: pageTitle(parent), onClick: () => setPage(parent) } : null
  const title = shell.back ? shell.back.title : meta.title
  // A pushed screen draws its own title in the content, as do pages marked large
  const fades = shell.back ? true : meta.large
  const showWordmark = page === LANDING && !back

  return (
    <HeaderBar>
      {back && (
        <button onClick={back.onClick} aria-label={`Back to ${back.label}`}
          className="press flex items-center flex-shrink-0 min-h-[44px] min-w-[44px] pr-2 rounded-xl text-sm font-medium text-ink-2 hover:text-ink transition-colors">
          <Icon icon="mdi:chevron-left" width={26} aria-hidden="true" />
          <span>{back.label}</span>
        </button>
      )}

      {showWordmark ? (
        <div className="flex items-center gap-2 pl-2 flex-1 min-w-0">
          <Brand size="text-lg xs:text-xl" />
          {isPro && (
            <span className="text-xs font-semibold text-neon-ink border border-neon-stroke/40 px-1.5 py-0.5 rounded-md leading-none">Pro</span>
          )}
        </div>
      ) : (
        <h1 className={`flex-1 min-w-0 truncate text-lg leading-[1.3] font-semibold text-ink transition-opacity duration-200 ${back ? 'pl-1' : 'pl-2'} ${fades && !scrolled ? 'opacity-0' : 'opacity-100'}`}
          aria-hidden={fades && !scrolled ? 'true' : undefined}>
          {title}
        </h1>
      )}

      {shell.action && (
        <button onClick={shell.action.onClick}
          className="press flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-ink bg-raised border border-line-strong hover:border-muted/50 transition-colors">
          <Icon icon={shell.action.icon} width={18} aria-hidden="true" />
          {/* Icon only on a narrow screen, so the page title keeps its room */}
          <span className="max-[340px]:sr-only">{shell.action.label}</span>
        </button>
      )}

      {onBellClick && (
        <button onClick={onBellClick} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
          className="press relative flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full text-ink-2 hover:text-ink">
          <Icon icon="mdi:bell-outline" width={24} aria-hidden="true" />
          {unread > 0 && (
            <span aria-hidden="true"
              className="absolute top-1.5 right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-neon text-on-neon text-2xs font-bold flex items-center justify-center tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}

      <button onClick={onProfileClick} aria-label="You: profile and settings"
        className="press flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full">
        <span className="w-9 h-9 rounded-full bg-raised border border-line-strong flex items-center justify-center text-sm font-semibold text-ink-2">
          {session.name[0].toUpperCase()}
        </span>
      </button>
    </HeaderBar>
  )
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// What the minimised session is doing, from the saved workout state
function sessionStatus(s) {
  if (s.screen === 'exercise-picker') return { title: s.name || 'Free workout', status: 'Pick your next exercise' }
  const name = s.exerciseNames?.[s.exIdx] ?? s.name ?? 'Workout'
  if (s.screen === 'rest') {
    const end = parseInt(localStorage.getItem('athrion_rest_end') || '0')
    const left = end ? Math.ceil((end - Date.now()) / 1000) : 0
    return { title: name, status: left > 0 ? `Rest ${fmtClock(left)}` : 'Rest done' }
  }
  const total = s.setCounts?.[s.exIdx] ?? s.totalSets ?? 3
  return { title: name, status: `Set ${(s.setIdx ?? 0) + 1} of ${total}` }
}

// Minimised workout: sits above the tabs, tap to go back to it
export function useMinimisedSession() {
  const [s, setS] = useState(() => readSession())
  useEffect(() => {
    const read = () => setS(readSession())
    window.addEventListener(SESSION_EVENT, read)
    window.addEventListener('storage', read)
    const id = setInterval(read, 1000)
    return () => {
      window.removeEventListener(SESSION_EVENT, read)
      window.removeEventListener('storage', read)
      clearInterval(id)
    }
  }, [])
  return s?.minimised ? s : null
}

export function SessionBar({ session, onResume }) {
  const { title, status } = sessionStatus(session)
  return (
    <button onClick={onResume} aria-label={`Back to your workout: ${title}, ${status}`}
      className="press w-full h-[52px] flex items-center gap-3 px-4 bg-surface border-t border-neon-stroke/25 text-left">
      <Icon icon="mdi:dumbbell" width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-ink truncate">{title}</span>
        <span className="block text-xs text-muted tabular-nums">{status}</span>
      </span>
      <Icon icon="mdi:chevron-up" width={22} className="text-ink-2 flex-shrink-0" aria-hidden="true" />
    </button>
  )
}

export default function Nav({ page, setPage, session, isPro, onProfileClick, unread, onBellClick, minimised, onResume }) {
  const shell = useShell()
  const activeTab = PARENT_TAB[page] ?? page

  if (shell.focus) return null

  return (
    <>
      <PageHeader page={page} setPage={setPage} session={session} isPro={isPro} onProfileClick={onProfileClick} unread={unread} onBellClick={onBellClick} shell={shell} />

      <div className="fixed bottom-0 left-0 right-0 z-50">
        {minimised && (
          <div className="max-w-lg mx-auto"><SessionBar session={minimised} onResume={onResume} /></div>
        )}
        <nav aria-label="Main" className="bg-canvas/95 backdrop-blur border-t border-line"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5 max-w-lg mx-auto h-14">
            {TABS.map(t => {
              const active = activeTab === t.id
              const locked = t.pro && !isPro
              return (
                <button key={t.id} onClick={() => setPage(t.id)} aria-current={active ? 'page' : undefined}
                  className={`press relative flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? 'text-ink' : 'text-muted hover:text-ink-2'}`}>
                  <span aria-hidden="true"
                    className={`absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-b-full bg-neon transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
                  <Icon icon={t.icon} width={24} aria-hidden="true" />
                  {/* Five labels don't fit a very narrow screen (or big phone text): icons only, names kept for screen readers */}
                  <span className="flex items-center gap-0.5 text-xs font-semibold max-[319px]:sr-only">
                    <span>{t.label}</span>
                    {locked && <><Icon icon="mdi:lock-outline" width={12} aria-hidden="true" /><span className="sr-only">, Pro</span></>}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </>
  )
}
