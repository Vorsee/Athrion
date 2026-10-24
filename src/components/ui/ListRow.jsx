import { Icon } from '@iconify/react'
import { tok } from '../../lib/tokens.js'

// 56px row: leading icon (or tinted tile), title, meta, trailing value or chevron.
// Pass onClick to make the whole row the tap target.
export default function ListRow({ icon, tile, title, meta, trailing, chevron = false, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`w-full min-h-[56px] flex items-center gap-3 px-3 py-2.5 text-left rounded-xl transition-colors ${onClick ? 'press hover:bg-raised active:bg-raised' : ''} ${className}`}>
      {tile ? (
        <span className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: tok(tile, 0.12), color: tok(tile) }}>
          <Icon icon={icon} width={20} aria-hidden="true" />
        </span>
      ) : icon ? (
        <Icon icon={icon} width={22} className="text-muted flex-shrink-0" aria-hidden="true" />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block text-[0.9375rem] leading-[1.35] font-medium text-ink break-words">{title}</span>
        {meta && <span className="block text-xs text-muted mt-0.5">{meta}</span>}
      </span>
      {trailing != null && <span className="flex-shrink-0 text-right tabular-nums">{trailing}</span>}
      {chevron && <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />}
    </Tag>
  )
}
