// One segmented control for every page. The selected segment is a raised surface
// with ink text, not a neon fill: neon is reserved for "go".
// options: [[id, label], ...]. With more than 4 options it scrolls horizontally (pass scroll={false} for short labels).
// kind: 'tabs' switches views (tablist); 'choice' picks a value (radiogroup)
export default function Segmented({ options, value, onChange, label, kind = 'tabs', scroll = options.length > 4, className = '' }) {
  const radio = kind === 'choice'
  return (
    <div className={`relative ${className}`}>
      <div role={radio ? 'radiogroup' : 'tablist'} aria-label={label}
        className="flex gap-1 bg-raised border border-line rounded-xl p-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}>
        {options.map(([id, text]) => {
          const on = value === id
          return (
            <button key={id} type="button" role={radio ? 'radio' : 'tab'} aria-selected={radio ? undefined : on} aria-checked={radio ? on : undefined} onClick={() => onChange(id)}
              className={`press ${scroll ? 'flex-shrink-0 px-4' : 'flex-1 min-w-max px-2'} min-h-[40px] rounded-[10px] text-sm font-semibold whitespace-nowrap border transition-colors duration-200 ${
                on ? 'bg-surface text-ink border-line-strong' : 'text-muted border-transparent hover:text-ink-2'
              }`}>
              {text}
            </button>
          )
        })}
      </div>
      {scroll && <div aria-hidden="true" className="pointer-events-none absolute right-px top-px bottom-px w-6 rounded-r-xl bg-gradient-to-l from-raised to-transparent" />}
    </div>
  )
}
