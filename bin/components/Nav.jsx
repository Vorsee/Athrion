const TABS = [
  { id: 'workout',  label: 'Workout',  icon: '🏋️' },
  { id: 'calories', label: 'Calories', icon: '🥗' },
  { id: 'library',  label: 'Library',  icon: '📚' },
  { id: 'group',    label: 'Group',    icon: '👥' },
]

export default function Nav({ page, setPage, session, isPro, onProfileClick }) {
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A] border-b border-[#1e1e1e] px-6 h-[64px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPage('workout')}
            className="font-bebas text-3xl tracking-widest text-white hover:text-neon transition-colors"
          >ATHRION</button>
          {isPro && (
            <span className="font-bebas text-xl tracking-widest text-black bg-neon px-2.5 py-0.5 rounded-lg leading-tight shadow-[0_0_12px_rgba(200,241,53,0.5)]">
              PRO
            </span>
          )}
        </div>

        <button onClick={onProfileClick}
          className="flex items-center gap-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-neon/40 hover:bg-[#1e1e1e] px-3 py-1.5 rounded-xl transition-all group">
          <div className="w-6 h-6 rounded-lg bg-neon/15 border border-neon/20 flex items-center justify-center flex-shrink-0">
            <span className="font-bebas text-xs text-neon leading-none">
              {session.name[0].toUpperCase()}
            </span>
          </div>
          <span className="text-gray-400 text-sm group-hover:text-white transition-colors">
            {session.name.split(' ')[0]}
          </span>
        </button>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0F0F0F] border-t border-[#1e1e1e] pb-5 pt-2">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setPage(t.id)}
              className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all duration-200 ${
                page === t.id ? 'bg-neon/10' : ''
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                page === t.id ? 'text-neon' : 'text-[#555]'
              }`}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
