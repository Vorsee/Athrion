import { createPortal } from 'react-dom'

// Bottom sheet rendered into <body> so it sits above the fixed nav
export default function Sheet({ title, onClose, children, footer }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col bg-[#111] border-t border-[#1e1e1e] rounded-t-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="font-bebas text-2xl text-white tracking-wide">{title}</div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-4">{children}</div>
        {footer && (
          <div className="px-5 pt-3 border-t border-[#1e1e1e]" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
