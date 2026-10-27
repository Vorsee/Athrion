// The ATHRION logo: the A with the podium bars (public/icons/athrion-logo-black-bg.png),
// drawn as SVG so it's sharp at any size and follows the theme (the A is ink, the bars brand).
export function BrandMark({ className = 'h-6' }) {
  return (
    <svg viewBox="312 296 456 474" className={`flex-shrink-0 w-auto ${className}`} aria-hidden="true" focusable="false">
      <path className="fill-ink" d="M312 770 498 296h84l186 474h-96L540 422 408 770z" />
      <g className="fill-brand">
        <rect x="462" y="644" width="51" height="126" />
        <rect x="516" y="578" width="51" height="192" />
        <rect x="570" y="692" width="51" height="78" />
        <circle cx="541" cy="533" r="21" />
      </g>
    </svg>
  )
}

// Mark and name together. size: the text class; the mark is sized to match it.
export default function Brand({ size = 'text-xl', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[0.35em] font-black italic tracking-tight text-ink leading-none ${size} ${className}`}>
      <BrandMark className="h-[1.15em]" />
      <span>ATHRION</span>
    </span>
  )
}
