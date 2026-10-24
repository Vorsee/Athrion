import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Bottom sheet rendered into <body> so it sits above the fixed nav.
// A dialog: Escape closes, Tab stays inside, focus returns to the opener on close.
// title is the visible heading; pass ariaLabel instead when the sheet draws its own header.
export default function Sheet({ title, ariaLabel, onClose, children, footer, bodyClassName = 'space-y-4' }) {
  const panelRef = useRef(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)]
      if (!items.length) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center backdrop-blur-sm scrim-in"
      style={{ background: 'var(--scrim)' }} onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel}
        className="w-full max-w-lg max-h-[90dvh] flex flex-col bg-overlay border-t border-line rounded-t-3xl outline-none modal-up"
        style={{ boxShadow: 'var(--sheet-shadow)' }}
        onClick={e => e.stopPropagation()}>
        <div aria-hidden="true" className="w-10 h-1 rounded-full bg-line-strong mx-auto mt-2.5" />
        {title ? (
          <div className="flex items-center justify-between gap-3 pl-5 pr-3 pt-2 pb-2">
            <h2 id={titleId} className="text-lg leading-[1.3] font-semibold text-ink min-w-0">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        ) : (
          <div className="flex justify-end pr-3 pt-1"><CloseButton onClick={onClose} /></div>
        )}
        <div className={`flex-1 overflow-y-auto px-5 pb-5 ${bodyClassName}`}
          style={footer ? undefined : { paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          {children}
        </div>
        {footer && (
          <div className="px-5 pt-3 border-t border-line" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function CloseButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close"
      className="press w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-raised transition-colors">
      <Icon icon="mdi:close" width={22} />
    </button>
  )
}
