import { useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from '../Sheet.jsx'

// Explanations live behind this button instead of on the page: tap opens a sheet
export default function InfoButton({ title, children, label = title, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={label}
        className={`press w-9 h-9 -m-1 rounded-full flex items-center justify-center text-muted hover:text-neon-ink hover:bg-raised flex-shrink-0 ${className}`}>
        <Icon icon="mdi:information-outline" width={18} aria-hidden="true" />
      </button>
      {open && <Sheet title={title} onClose={() => setOpen(false)}>{children}</Sheet>}
    </>
  )
}

// Small neon chip for key facts ("45 min", "8 weeks")
export function Fact({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-neon-ink bg-neon-tint border border-neon-stroke/25 rounded-md px-2 py-0.5">
      {icon && <Icon icon={icon} width={14} aria-hidden="true" />}{children}
    </span>
  )
}
