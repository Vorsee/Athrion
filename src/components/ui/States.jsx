import { Icon } from '@iconify/react'
import Button from './Button.jsx'

// What will appear here and how to get it, with one action
export function EmptyState({ icon, title, children, action, onAction, actionIcon, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center py-6 px-4 ${className}`}>
      <div className="w-16 h-16 rounded-full bg-raised flex items-center justify-center mb-3">
        <Icon icon={icon} width={32} className="text-muted" aria-hidden="true" />
      </div>
      <div className="text-lg leading-[1.3] font-semibold text-ink">{title}</div>
      {children && <p className="text-sm text-muted mt-1 max-w-xs">{children}</p>}
      {action && (
        <Button variant="secondary" size="sm" icon={actionIcon} onClick={onAction} className="mt-4">{action}</Button>
      )}
    </div>
  )
}

// Raised blocks shaped like the content they stand in for; static under reduced motion
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`bg-raised rounded-md animate-pulse ${className}`} />
}

export function SkeletonRows({ rows = 3, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="w-9 h-9 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// A page-sized placeholder: a title block, a hero card and a few rows
export function PageSkeleton({ label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="space-y-6 py-4">
      <Skeleton className="h-7 w-40" />
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
      <SkeletonRows rows={3} label={label} />
    </div>
  )
}

export function InlineError({ children, onRetry, retryLabel = 'Try again', className = '' }) {
  return (
    <div role="alert" className={`flex items-start gap-2.5 bg-danger/12 border border-danger/20 rounded-xl px-3.5 py-3 ${className}`}>
      <Icon icon="mdi:alert-circle-outline" width={18} className="text-danger flex-shrink-0 mt-px" aria-hidden="true" />
      <div className="flex-1 min-w-0 text-sm text-danger break-words">{children}</div>
      {onRetry && <Button variant="ghost" size="sm" onClick={onRetry} className="-my-1.5 -mr-1.5">{retryLabel}</Button>}
    </div>
  )
}
