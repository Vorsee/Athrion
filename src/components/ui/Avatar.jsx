// A person as a round initial. The colour comes from the name, so a friend looks the same
// on every screen (rooms, friends, the leaderboard).
const TONES = ['bg-info', 'bg-rose', 'bg-lilac', 'bg-neon']
const SIZES = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-14 h-14 text-2xl', xl: 'w-16 h-16 text-3xl' }

export function toneFor(name = '') {
  let h = 0
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export default function Avatar({ name, size = 'md', ring = false, className = '' }) {
  const letter = String(name || '?').replace(/^@/, '').charAt(0).toUpperCase() || '?'
  return (
    <span aria-hidden="true"
      className={`${SIZES[size]} ${toneFor(name)} rounded-full avatar-ink font-bold flex items-center justify-center flex-shrink-0 select-none ${ring ? 'ring-2 ring-surface' : ''} ${className}`}>
      {letter}
    </span>
  )
}

// Overlapping avatars; empty seats show as dashed circles
export function AvatarStack({ names, seats = 0, size = 'sm', className = '' }) {
  return (
    <span className={`flex items-center ${className}`} aria-hidden="true">
      {names.map((n, i) => (
        <Avatar key={n + i} name={n} size={size} ring className={`pop-in ${i ? '-ml-2' : ''}`} />
      ))}
      {Array.from({ length: seats }, (_, i) => (
        <span key={`seat${i}`} className={`${SIZES[size]} rounded-full border-2 border-dashed border-line-strong bg-surface flex-shrink-0 pop-in ${names.length || i ? '-ml-2' : ''}`}
          style={{ animationDelay: `${(names.length + i) * 70}ms` }} />
      ))}
    </span>
  )
}
