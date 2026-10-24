import { Icon } from '@iconify/react'

// primary: the one "go" action per screen. secondary: raised with a border.
// ghost: no fill. danger: tinted red for destructive actions.
const VARIANTS = {
  primary:   'bg-neon text-on-neon active:bg-neon-press',
  secondary: 'bg-raised text-ink border border-line-strong hover:border-muted/50',
  ghost:     'text-ink-2 hover:text-ink hover:bg-raised active:bg-raised',
  danger:    'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20',
}
const SIZES = {
  md: 'h-12 px-5 text-sm gap-2 rounded-xl',
  sm: 'h-9 px-3 text-xs gap-1.5 rounded-md',
}

export default function Button({
  variant = 'primary', size = 'md', icon, iconRight, full = false,
  className = '', children, type = 'button', ...rest
}) {
  const iconSize = size === 'sm' ? 16 : 18
  return (
    <button type={type} {...rest}
      className={`press inline-flex items-center justify-center font-semibold select-none transition-colors
        disabled:opacity-40 disabled:cursor-default disabled:active:scale-100
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}>
      {icon && <Icon icon={icon} width={iconSize} className="flex-shrink-0" aria-hidden="true" />}
      {children}
      {iconRight && <Icon icon={iconRight} width={16} className="flex-shrink-0" aria-hidden="true" />}
    </button>
  )
}

// Inline back control for pushed screens, until the shared header lands
export function BackLink({ onClick, children = 'Back', className = '' }) {
  return (
    <button type="button" onClick={onClick}
      className={`press -ml-1 flex items-center gap-0.5 min-h-[44px] pr-2 text-sm font-medium text-ink-2 hover:text-ink transition-colors ${className}`}>
      <Icon icon="mdi:chevron-left" width={20} aria-hidden="true" />{children}
    </button>
  )
}
