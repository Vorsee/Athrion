import { Icon } from '@iconify/react'
import { THEMES, themeClasses } from '../lib/theme.js'

// You → Appearance. Each swatch is drawn inside its own theme's classes, so it shows the real
// tokens. Pro themes carry a Pro tag; for free accounts App's pickTheme opens Get Pro instead.
export default function ThemePicker({ value, isPro, onPick }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-2"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr))' }}>
      {THEMES.map(t => {
        const on = value === t.id
        const locked = t.pro && !isPro
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(t.id)}
            aria-label={`${t.label}${t.note ? `, ${t.note.toLowerCase()}` : ''}${locked ? ', Pro' : ''}`}
            className={`press flex flex-col text-left rounded-xl p-1.5 border-2 transition-colors ${on ? 'border-neon-stroke' : 'border-transparent hover:border-line-strong'}`}>
            <span aria-hidden="true" className={`${t.id === 'dark' ? 'theme-dark' : themeClasses(t.id)} relative block h-16 rounded-[10px] overflow-hidden bg-canvas border border-line`}>
              {t.id === 'christmas' && (
                <span className="absolute top-1 inset-x-2 flex justify-between">
                  {[0, 1, 2, 3, 0].map((c, i) => <svg key={i} width="5" height="7" viewBox="0 0 5 7"><ellipse className={`xmas-bulb b${c}`} cx="2.5" cy="3.5" rx="2.2" ry="3.2" /></svg>)}
                </span>
              )}
              <span className="absolute left-2 right-2 bottom-2 rounded-md bg-surface border border-line px-1.5 py-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-neon flex-shrink-0" />
                <span className="h-1.5 flex-1 rounded-full bg-ink/70" />
              </span>
              {locked && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center text-ink-2">
                  <Icon icon="mdi:lock-outline" width={13} />
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 mt-1.5 px-0.5 min-w-0">
              <span className={`text-sm font-semibold truncate ${on ? 'text-ink' : 'text-ink-2'}`}>{t.label}</span>
              {on && <Icon icon="mdi:check" width={16} className="text-neon-ink flex-shrink-0" aria-hidden="true" />}
            </span>
            {t.pro && <span className="block px-0.5 text-xs font-semibold text-neon-ink">Pro</span>}
          </button>
        )
      })}
    </div>
  )
}
