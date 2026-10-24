import { Icon } from '@iconify/react'

// Value, label and an optional delta. The delta carries an arrow icon so the
// direction doesn't rely on colour alone.
export default function Stat({ value, label, delta, size = 'heading', align = 'left', tone = 'text-ink', className = '' }) {
  const valueCls = size === 'display'
    ? 'text-[2.75rem] leading-none font-bold'
    : 'text-xl leading-tight font-bold'
  const dir = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return (
    <div className={`${align === 'center' ? 'text-center' : ''} ${className}`}>
      <div className={`${valueCls} ${tone} tabular-nums`}>{value}</div>
      <div className="text-xs font-medium text-muted mt-1">{label}</div>
      {dir && (
        <div className={`mt-1 inline-flex items-center gap-0.5 text-xs font-semibold ${dir === 'up' ? 'text-neon-ink' : dir === 'down' ? 'text-danger' : 'text-muted'}`}>
          <Icon icon={dir === 'up' ? 'mdi:arrow-up' : dir === 'down' ? 'mdi:arrow-down' : 'mdi:minus'} width={14} aria-hidden="true" />
          {Math.abs(delta)}
        </div>
      )}
    </div>
  )
}
