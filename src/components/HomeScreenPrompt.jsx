import { useState, useEffect } from 'react'

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
      className="fixed z-50 bottom-[100px] right-3 w-[220px] rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 slide-up"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px #2a2a2a' }}
    >
      <button
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 text-gray-600 hover:text-white text-sm leading-none transition-colors"
      >
        ✕
      </button>

      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-neon/10 border border-neon/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base">⚡</span>
        </div>
        <div>
          <div className="text-xs font-bold text-white leading-tight">Add to Home Screen</div>
          <div className="text-[10px] text-gray-600">Quick access anytime</div>
        </div>
      </div>

      <div className="space-y-2">
        {ios ? (
          <>
            <Step n={1} text={<>Tap the <span className="text-neon font-semibold">Share</span> button below ↑</>} />
            <Step n={2} text={<>Tap <span className="text-neon font-semibold">Add to Home Screen</span></>} />
            <Step n={3} text="Tap Add — you're set!" />
          </>
        ) : (
          <>
            <Step n={1} text={<>Tap the <span className="text-neon font-semibold">⋮ menu</span> in your browser</>} />
            <Step n={2} text={<>Tap <span className="text-neon font-semibold">Add to Home Screen</span></>} />
            <Step n={3} text="Tap Add — you're set!" />
          </>
        )}
      </div>

      <button
        onClick={dismiss}
        className="mt-3 w-full text-[10px] text-gray-700 hover:text-gray-500 transition-colors"
      >
        Don't show again
      </button>
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-full bg-neon/20 text-neon text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="text-[11px] text-gray-400 leading-tight">{text}</div>
    </div>
  )
}
