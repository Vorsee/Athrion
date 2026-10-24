import { useState, useRef, useEffect } from 'react'

const PAD = { top: 16, right: 44, bottom: 22, left: 36 }

function niceTicks(min, max, count = 3) {
  if (min === max) { min -= 1; max += 1 }
  const step = Math.pow(10, Math.floor(Math.log10((max - min) / count)))
  const err = (max - min) / count / step
  const nice = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1)
  const lo = Math.floor(min / nice) * nice
  const hi = Math.ceil(max / nice) * nice
  const ticks = []
  for (let v = lo; v <= hi + nice / 2; v += nice) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

// A bare YYYY-MM-DD is a calendar day: read it as local midnight, not UTC (which shows the day before in the Americas)
const asDate = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d))
const fmtDate = d => asDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * Single-series line chart. Hover or drag shows a crosshair and tooltip.
 * @param data  [{ date, value }] in any order
 * @param unit  appended to values, e.g. "lb"
 */
export default function LineChart({ data, unit = '', height = 170, label = 'Value' }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = [...(data || [])]
    .filter(d => d.value != null && !Number.isNaN(Number(d.value)))
    .map(d => ({ t: asDate(d.date).getTime(), date: d.date, value: Number(d.value) }))
    .sort((a, b) => a.t - b.t)

  if (points.length < 2) {
    return <div className="text-xs text-gray-400 py-6 text-center">Add at least two entries to see a trend.</div>
  }

  const fmt = v => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`
  const ticks = niceTicks(Math.min(...points.map(p => p.value)), Math.max(...points.map(p => p.value)))
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const tMin = points[0].t, tMax = points[points.length - 1].t
  const iw = width - PAD.left - PAD.right
  const ih = height - PAD.top - PAD.bottom
  const x = t => PAD.left + (tMax === tMin ? iw / 2 : ((t - tMin) / (tMax - tMin)) * iw)
  const y = v => PAD.top + ih - ((v - yMin) / (yMax - yMin)) * ih
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left
    let best = points[0]
    for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p
    setHover(best)
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} className="block touch-none select-none"
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
        role="img" aria-label={`${label} over time, latest ${fmt(last.value)}`}>
        {/* Recessive grid + y labels */}
        {ticks.map(t => (
          <g key={t} className="text-gray-800">
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-gray-600" fontSize="10">{t}</text>
          </g>
        ))}
        <text x={PAD.left} y={height - 6} className="fill-gray-600" fontSize="10">{fmtDate(points[0].date)}</text>
        <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-gray-600" fontSize="10">{fmtDate(last.date)}</text>

        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-neon" />

        {/* Direct label on the latest point */}
        <circle cx={x(last.t)} cy={y(last.value)} r="4" className="text-neon" fill="currentColor" stroke="#111" strokeWidth="2" />
        <text x={x(last.t) + 8} y={y(last.value) + 3} fontSize="10" className="fill-gray-300">{Math.round(last.value * 10) / 10}</text>

        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={PAD.top + ih} stroke="currentColor" className="text-gray-400" strokeDasharray="3 3" />
            <circle cx={x(hover.t)} cy={y(hover.value)} r="5" className="text-neon" fill="currentColor" stroke="#111" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hover && (
        <div className="absolute top-0 pointer-events-none bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs whitespace-nowrap"
          style={{ left: Math.min(Math.max(x(hover.t) - 50, 0), width - 110) }}>
          <div className="text-gray-400">{fmtDate(hover.date)}</div>
          <div className="text-white font-semibold">{fmt(hover.value)}</div>
        </div>
      )}

      <button onClick={() => setShowTable(s => !s)} className="text-xs text-gray-400 hover:text-gray-400 mt-1">
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table className="w-full text-xs mt-2">
          <thead><tr className="text-gray-400 text-left"><th className="font-normal py-1">Date</th><th className="font-normal py-1 text-right">{label}</th></tr></thead>
          <tbody>
            {[...points].reverse().map(p => (
              <tr key={p.t} className="border-t border-[#1e1e1e]">
                <td className="py-1 text-gray-400">{fmtDate(p.date)}</td>
                <td className="py-1 text-right text-white">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
