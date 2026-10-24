// One surface for everything you act on. `hero` marks the single card per screen that
// holds the main action: neon tint fading down the whole card, and a neon edge.
const PAD = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' }
// tone: default surface, neon edge (highlights such as PRs), or a warn wash (safety notes)
const TONE = { default: 'bg-surface border-line', neon: 'bg-surface border-neon-stroke/30', warn: 'bg-warn/5 border-warn/25' }

export default function Card({ as: Tag = 'div', hero = false, tone = 'default', pad = 'md', className = '', style, children, ...rest }) {
  const heroStyle = hero
    ? { background: 'linear-gradient(to bottom, rgb(var(--neon-tint)), rgb(var(--surface)))' }
    : null
  return (
    <Tag {...rest}
      className={`rounded-2xl border ${hero ? 'border-neon-stroke/25' : TONE[tone]} ${PAD[hero && pad === 'md' ? 'lg' : pad]} ${className}`}
      style={heroStyle ? { ...heroStyle, ...style } : style}>
      {children}
    </Tag>
  )
}
