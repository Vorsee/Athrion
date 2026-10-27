import { Icon } from '@iconify/react'

// Screen title block: neon icon, big name, neon fact chips, one menu button on the right
export function PageHeader({ icon, title, facts, action, children }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <Icon icon={icon} width={26} className="text-neon-ink flex-shrink-0" aria-hidden="true" />}
          <h1 className="font-bold text-2xl text-ink leading-tight break-words">{title}</h1>
        </div>
        {action}
      </div>
      {facts && <div className="flex flex-wrap gap-1.5 mt-2">{facts}</div>}
      {children}
    </div>
  )
}

// Round icon button for a header menu or a row action
export function IconButton({ icon, label, onClick, disabled, tone = 'default', className = '' }) {
  const tones = {
    default: 'text-ink-2 hover:text-neon-ink hover:bg-raised',
    danger: 'text-muted hover:text-danger hover:bg-raised',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className={`press w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 flex-shrink-0 ${tones[tone]} ${className}`}>
      <Icon icon={icon} width={22} aria-hidden="true" />
    </button>
  )
}

// One line per exercise: neon icon, bold name, neon value, then any actions
// On a narrow screen (or big phone text) the value and buttons wrap under the name rather than
// squeezing it to a letter per line: the name keeps at least about one word's width.
export function ExerciseRow({ icon, name, meta, value, muted = false, children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-raised rounded-xl px-3 py-2.5 ${muted ? 'opacity-50' : ''} ${className}`}>
      {icon && <Icon icon={icon} width={22} className="flex-shrink-0 text-neon-ink" aria-hidden="true" />}
      <div className="grow basis-0 min-w-[5.5rem]">
        <div className="text-sm font-semibold text-ink leading-snug break-words">{name}</div>
        {meta && <div className="text-xs text-muted">{meta}</div>}
      </div>
      {(value != null || children) && (
        <div className="ml-auto max-w-full flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {value != null && <span className="text-sm font-bold text-neon-ink tabular-nums">{value}</span>}
          {children && <div className="flex items-center gap-1">{children}</div>}
        </div>
      )}
    </div>
  )
}

// A whole-row button that opens something: icon, label, optional badge, chevron
export function ActionRow({ icon, title, badge, onClick, tone = 'default' }) {
  const warn = tone === 'warn'
  return (
    <button type="button" onClick={onClick}
      className={`press w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors border ${
        warn ? 'bg-warn/10 border-warn/30' : 'bg-surface border-line hover:border-neon-stroke/30'}`}>
      <Icon icon={icon} width={22} className={`${warn ? 'text-warn' : 'text-neon-ink'} flex-shrink-0`} aria-hidden="true" />
      <span className={`flex-1 text-sm font-semibold ${warn ? 'text-warn' : 'text-ink'}`}>{title}</span>
      {badge}
      <Icon icon="mdi:chevron-right" width={20} className={warn ? 'text-warn' : 'text-muted'} aria-hidden="true" />
    </button>
  )
}

// Big neon number with its unit, for the one figure a card is about
export function BigNumber({ value, unit, className = '' }) {
  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className="font-bold text-4xl text-neon-ink tabular-nums leading-none">{value}</span>
      {unit && <span className="text-sm text-muted">{unit}</span>}
    </div>
  )
}

// Small figure tiles in a row (protein / carbs / fat, sets / volume / time)
export function StatTiles({ items, className = '' }) {
  return (
    // Tiles keep a readable width and wrap to a second row rather than cutting the figure off
    <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 4.75rem), 1fr))` }}>
      {items.map(([label, val]) => (
        <div key={label} className="bg-raised rounded-xl px-3 py-2">
          <div className="font-bold text-lg text-ink tabular-nums leading-tight break-words">{val}</div>
          <div className="text-xs text-muted">{label}</div>
        </div>
      ))}
    </div>
  )
}

// Rank 1-3 get a medal icon and a coloured chip (neon, ink-2, ember); the rest a plain number
export function RankChip({ rank, small = false }) {
  const tone = rank === 1 ? 'bg-neon text-on-neon'
    : rank === 2 ? 'bg-raised text-ink-2 border border-line-strong'
    : rank === 3 ? 'bg-ember/12 text-ember'
    : 'text-muted'
  return (
    <span aria-label={`Rank ${rank}`}
      className={`inline-flex items-center justify-center gap-0.5 rounded-full font-bold tabular-nums flex-shrink-0 ${small ? 'h-5 min-w-[1.25rem] px-1 text-2xs' : 'h-6 min-w-[1.75rem] px-1.5 text-xs'} ${tone}`}>
      {rank <= 3 && !small && <Icon icon="mdi:medal-outline" width={12} aria-hidden="true" />}
      {rank}
    </span>
  )
}
