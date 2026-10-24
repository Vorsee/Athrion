import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Card, Sheet } from './ui/index.js'
import { localDateKey, todayKey } from '../lib/data.js'
import { useUnit } from '../lib/units.js'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Monday-first offset of a date's weekday (Mon 0 … Sun 6)
const mondayIndex = d => (d.getDay() + 6) % 7

// Month view of the training log: trained days filled, today outlined, upcoming
// plan days dotted. Tapping a day lists its sessions; each opens the session detail.
export default function TrainingCalendar({ history, planSchedule, onOpenSession }) {
  const { fmtVolume } = useUnit()
  const today = todayKey()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [openDay, setOpenDay] = useState(null) // 'YYYY-MM-DD'

  const byDate = useMemo(() => {
    const map = {}
    for (const h of history) (map[h.date] ??= []).push(h)
    return map
  }, [history])

  const planByWeekday = useMemo(() => {
    const map = {}
    for (const d of planSchedule ?? []) if (d.type === 'workout') map[d.day] = d
    return map
  }, [planSchedule])

  // This Monday-to-Sunday week, by local date
  const weekCount = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayIndex(now))
    let n = 0
    for (let i = 0; i < 7; i++) n += byDate[localDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))]?.length ?? 0
    return n
  }, [byDate])

  const cells = useMemo(() => {
    const first = month
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const out = Array.from({ length: mondayIndex(first) }, () => null)
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(first.getFullYear(), first.getMonth(), d))
    return out
  }, [month])

  const shift = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const isThisMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const openSessions = openDay ? byDate[openDay] ?? [] : []
  const openDate = openDay ? new Date(`${openDay}T12:00:00`) : null
  const openPlan = openDay && openDay > today ? planByWeekday[DAY_FULL[openDate.getDay()]] : null

  return (
    <Card pad="md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg leading-[1.3] font-semibold text-ink">{monthLabel}</div>
          <div className="text-xs text-muted">{weekCount} {weekCount === 1 ? 'session' : 'sessions'} this week</div>
        </div>
        <div className="flex items-center">
          <button onClick={() => shift(-1)} aria-label="Previous month"
            className="press w-11 h-11 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised">
            <Icon icon="mdi:chevron-left" width={22} />
          </button>
          <button onClick={() => shift(1)} aria-label="Next month" disabled={isThisMonth}
            className="press w-11 h-11 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-raised disabled:opacity-30">
            <Icon icon="mdi:chevron-right" width={22} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((d, i) => <div key={i} className="text-xs text-muted pb-1.5" aria-hidden="true">{d}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />
          const key = localDateKey(date)
          const sessions = byDate[key]?.length ?? 0
          const planned = key > today && !!planByWeekday[DAY_FULL[date.getDay()]]
          const isToday = key === today
          const label = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${sessions ? `, ${sessions} ${sessions === 1 ? 'session' : 'sessions'}` : planned ? ', planned workout' : ''}`
          return (
            <button key={key} onClick={() => setOpenDay(key)} aria-label={label}
              className="press h-11 flex items-center justify-center">
              <span className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm tabular-nums
                ${sessions ? 'bg-neon text-on-neon font-semibold' : isToday ? 'border-2 border-neon-stroke text-ink font-semibold' : key > today ? 'text-muted' : 'text-ink-2'}`}>
                {date.getDate()}
                {planned && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-neon-stroke" aria-hidden="true" />}
              </span>
            </button>
          )
        })}
      </div>

      {openDay && (
        <Sheet title={openDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} onClose={() => setOpenDay(null)}>
          {openSessions.length > 0 ? (
            <ul className="divide-y divide-line -mt-2">
              {openSessions.map((s, i) => (
                <li key={s.id ?? i}>
                  <button onClick={() => { setOpenDay(null); onOpenSession(s) }}
                    className="press w-full flex items-center gap-3 py-3 text-left">
                    <Icon icon="mdi:dumbbell" width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{s.name}</div>
                      <div className="text-xs text-muted">{[s.duration, s.volume ? fmtVolume(s.volume) : null, s.pending ? 'Not saved yet' : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Icon icon="mdi:chevron-right" width={20} className="text-muted flex-shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : openPlan ? (
            <p className="text-sm text-ink-2">Planned: <span className="font-semibold text-ink">{openPlan.title}</span></p>
          ) : (
            <p className="text-sm text-muted">{openDay > today ? 'Nothing planned.' : 'No training logged.'}</p>
          )}
        </Sheet>
      )}
    </Card>
  )
}
