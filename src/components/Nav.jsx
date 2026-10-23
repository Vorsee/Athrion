const TABS = [
  { id: 'workout',  label: 'Workout',  icon: '🏋️' },
  { id: 'calories', label: 'Calories', icon: '🥗' },
  { id: 'plan',     label: 'Plan',     icon: '📋' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'library',  label: 'Library',  icon: '📚' },
  { id: 'group',    label: 'Group',    icon: '👥' },
]

export default function Nav({ page, setPage, session, isPro, onProfileClick }) {
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A] border-b border-[#1e1e1e]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 xs:px-6 h-[56px] xs:h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-2 xs:gap-3">
            <button
              onClick={() => setPage('workout')}
              className="font-bebas text-2xl xs:text-3xl tracking-widest text-white hover:text-neon transition-colors"
            >ATHRION</button>
            {isPro && (
              <span className="font-bebas text-base xs:text-xl tracking-widest text-black bg-neon px-2 xs:px-2.5 py-0.5 rounded-lg leading-tight shadow-[0_0_12px_rgba(200,241,53,0.5)]">
                PRO
              </span>
            )}
          </div>

          <button onClick={onProfileClick}
            className="flex items-center gap-2 xs:gap-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-neon/40 hover:bg-[#1e1e1e] px-2.5 xs:px-3 py-1.5 rounded-xl transition-all group">
            <div className="w-5 h-5 xs:w-6 xs:h-6 rounded-lg bg-neon/15 border border-neon/20 flex items-center justify-center flex-shrink-0">
              <span className="font-bebas text-xs text-neon leading-none">
                {session.name[0].toUpperCase()}
              </span>
            </div>
            <span className="text-gray-400 text-xs xs:text-sm group-hover:text-white transition-colors">
              {session.name.split(' ')[0]}
            </span>
          </button>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0F0F0F] border-t border-[#1e1e1e] pt-1.5 xs:pt-2"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setPage(t.id)}
              className={`flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 xs:px-3 py-1.5 xs:py-2 rounded-xl transition-all duration-200 ${
                page === t.id ? 'bg-neon/10' : ''
              }`}
            >
              <span className="text-lg xs:text-xl">{t.icon}</span>
              <span className={`text-[8px] xs:text-[10px] font-semibold uppercase tracking-wider xs:tracking-widest transition-colors ${
                page === t.id ? 'text-neon' : 'text-[#555]'
              }`}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
