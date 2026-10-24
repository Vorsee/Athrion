// A Pro-only page shown for real but dimmed and inert, with an upgrade card kept in view
export default function ProLock({ description, onUpgrade, children }) {
  return (
    <div className="relative min-h-[70dvh]">
      <div aria-hidden="true" inert="" className="pointer-events-none select-none">
        {children}
      </div>

      <div className="absolute inset-0 bg-black/75 rounded-2xl" />
      <div className="absolute inset-0 px-4">
        <div className="sticky top-[calc(var(--header-h)+env(safe-area-inset-top)+4rem)] pt-16">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-3xl p-7 w-full max-w-sm mx-auto text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon/25 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔒</span>
            </div>
            <div className="font-bebas text-3xl tracking-wide mb-2">PRO FEATURE</div>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">{description}</p>
            <button onClick={onUpgrade}
              className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest hover:shadow-[0_6px_24px_rgba(200,241,53,0.4)] transition-all">
              Get Pro →
            </button>
            <div className="text-[10px] text-gray-600 mt-3">$5.99 / month · Cancel anytime</div>
          </div>
        </div>
      </div>
    </div>
  )
}
