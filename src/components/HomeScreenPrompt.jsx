import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

const STORAGE_KEY = 'athrion_pwa_dismissed'

function isInstalled() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream
}

export default function HomeScreenPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isInstalled()) return
    if (localStorage.getItem(STORAGE_KEY)) return
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!visible) return null

  const ios = isIOS()

  return (
    <div
      className="fixed z-50 bottom-[100px] right-3 w-[220px] rounded-2xl border border-line-strong bg-overlay p-4 slide-up"
      style={{ boxShadow: 'var(--sheet-shadow)' }}
    >
      <button
        onClick={dismiss}
        aria-label="Close"
        className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-ink transition-colors"
      >
        <Icon icon="mdi:close" width={18} />
      </button>

      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-neon/10 border border-neon-stroke/20 flex items-center justify-center flex-shrink-0">
          <Icon icon="mdi:cellphone-arrow-down" width={18} className="text-neon-ink" />
        </div>
        <div>
          <div className="text-xs font-bold text-ink leading-tight">Add to Home Screen</div>
        </div>
      </div>

      <div className="space-y-2">
        {ios ? (
          <>
            <Step n={1} text={<>Tap the <span className="text-neon-ink font-semibold">Share</span> button below</>} />
            <Step n={2} text={<>Tap <span className="text-neon-ink font-semibold">Add to Home Screen</span></>} />
            <Step n={3} text="Tap Add, and you're set." />
          </>
        ) : (
          <>
            <Step n={1} text={<>Tap the <span className="text-neon-ink font-semibold">menu</span> (<Icon icon="mdi:dots-vertical" width={14} className="inline -mt-0.5" aria-hidden="true" />) in your browser</>} />
            <Step n={2} text={<>Tap <span className="text-neon-ink font-semibold">Add to Home Screen</span></>} />
            <Step n={3} text="Tap Add, and you're set." />
          </>
        )}
      </div>

      <button
        onClick={dismiss}
        className="mt-3 w-full text-xs text-muted hover:text-ink transition-colors"
      >
        Don't show again
      </button>
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-full bg-neon/20 text-neon-ink text-2xs font-bold tabular-nums flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="text-xs text-muted leading-tight">{text}</div>
    </div>
  )
}
