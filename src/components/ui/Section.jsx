import { Icon } from '@iconify/react'

// Section title for use on the canvas or at the top of a card: heading size in ink,
// with an optional right-aligned link or meta.
export function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <h2 className="text-lg leading-[1.3] font-semibold text-ink min-w-0">{children}</h2>
      {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}

// A small neon text link for section actions ("New", "See all")
export function SectionLink({ onClick, icon, children }) {
  return (
    <button type="button" onClick={onClick}
      className="press inline-flex items-center gap-1 min-h-[36px] px-1 text-sm font-semibold text-neon-ink hover:underline underline-offset-2">
      {icon && <Icon icon={icon} width={16} aria-hidden="true" />}{children}
    </button>
  )
}

export default function Section({ title, action, children, className = '' }) {
  return (
    <section className={className}>
      {title && <SectionTitle action={action}>{title}</SectionTitle>}
      {children}
    </section>
  )
}
