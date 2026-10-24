import { tok } from '../../lib/tokens.js'

// Filter chip: raised with a hairline; selected is an ink fill with canvas text.
export default function Chip({ selected = false, onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`press flex-shrink-0 min-h-[36px] px-3.5 rounded-full text-xs font-semibold border transition-colors ${
        selected ? 'bg-ink text-canvas border-ink' : 'bg-raised text-ink-2 border-line hover:border-line-strong'
      } ${className}`}>
      {children}
    </button>
  )
}

// Tag: a tinted token fill with token-coloured text (warn, info, lilac, rose, danger, neon-ink)
export function Tag({ tone = 'neon-ink', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${className}`}
      style={{ background: tok(tone, 0.12), color: tok(tone) }}>
      {children}
    </span>
  )
}
