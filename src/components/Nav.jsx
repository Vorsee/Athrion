import { Icon } from '@iconify/react'

const TABS = [
  { id: 'workout',  label: 'Workout',  icon: 'mdi:dumbbell' },
  { id: 'plan',     label: 'Plan',     icon: 'mdi:calendar-check-outline' },
  { id: 'calories', label: 'Calories', icon: 'mdi:food-apple-outline' },
  { id: 'progress', label: 'Progress', icon: 'mdi:chart-line' },
]

// Pages opened from inside a tab, rather than from the bottom bar
export const PARENT_TAB = { library: 'workout', group: 'workout' }

export default function Nav({ page, setPage, session, isPro, onProfileClick }) {
  const activeTab = PARENT_TAB[page] ?? page

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-canvas/95 backdrop-blur border-b border-line"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto px-4 h-[56px] xs:h-[64px] flex items-center justify-between">
          <button onClick={() => setPage('workout')} className="flex items-center gap-2">
            <span className="text-lg xs:text-xl font-bold tracking-tight text-ink">ATHRION</span>
            {isPro && (
              <span className="text-xs font-semibold text-neon-ink border border-neon-stroke/40 px-1.5 py-0.5 rounded-md leading-none">Pro</span>
            )}
          </button>

          <button onClick={onProfileClick} aria-label="Profile and settings"
            className="w-9 h-9 rounded-full bg-raised border border-line-strong hover:border-neon-stroke/40 flex items-center justify-center text-sm font-semibold text-ink-2 transition-colors">
            {session.name[0].toUpperCase()}
          </button>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-canvas/95 backdrop-blur border-t border-line pt-2"
        style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <div className="grid grid-cols-4 max-w-lg mx-auto">
          {TABS.map(t => {
            const active = activeTab === t.id
            return (
              <button key={t.id} onClick={() => setPage(t.id)} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 transition-colors ${active ? 'text-neon-ink' : 'text-muted hover:text-ink-2'}`}>
                <Icon icon={t.icon} width={24} />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
