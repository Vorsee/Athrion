import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, StatTiles, InfoButton, InlineError } from './ui/index.js'
import Sheet from './Sheet.jsx'
import LineChart from './LineChart.jsx'
import WeightTarget, { readWeightTarget } from './WeightTarget.jsx'
import { GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'
import { isWeightGoal, goalProgress, directionOf } from '../lib/weightGoal.js'
import { toggleGoal, blockedBy, orderGoals, goalsLabel, MAX_GOALS } from '../lib/goalPick.js'
import { KEY_LIFTS, MAX_LIFTS, GOAL_REPS, hasLiftGoal, bestSet, suggestTarget, liftProgress } from '../lib/liftGoals.js'
import { useUnit } from '../lib/units.js'
import { localDateKey, todayKey } from '../lib/data.js'

const fmtDay = key => (key ? new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–')
const daysUntil = key => (key ? Math.ceil((new Date(`${key}T12:00:00`) - new Date(`${todayKey()}T12:00:00`)) / 86400000) : null)

// A ring that fills with pct (0-1); whatever's inside sits in the middle. expected (0-1, optional)
// marks where the person should be by today, so ahead or behind shows on the ring itself.
export function ProgressRing({ pct, expected = null, size = 136, stroke = 12, label, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamp = v => Math.max(0, Math.min(1, v))
  // The marker sits on the track, clockwise from the top like the fill
  const at = expected == null ? null : clamp(expected) * 2 * Math.PI
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-raised" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - clamp(pct))}
            className="text-neon-stroke transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
        </g>
        {at != null && (
          <circle cx={size / 2 + r * Math.sin(at)} cy={size / 2 - r * Math.cos(at)} r={stroke / 2 - 1.5}
            fill="currentColor" stroke="rgb(var(--surface))" strokeWidth={3} className="text-ink" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

// Label and figure rows beside the ring
function Figures({ rows }) {
  return (
    <dl className="grow basis-0 min-w-[8.5rem] divide-y divide-line">
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className={`font-bold text-lg tabular-nums leading-tight text-right ${tone ?? 'text-ink'}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// Monday to Sunday: done, planned, rest; today outlined
export function WeekStrip({ days }) {
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="This week">
      {days.map(d => {
        const state = d.done ? 'done' : d.planned ? (d.date < todayKey() ? 'missed' : 'planned') : 'rest'
        return (
          <li key={d.day} className="flex flex-col items-center gap-1" aria-label={`${d.day}: ${state === 'done' ? 'trained' : state === 'missed' ? 'missed' : state === 'planned' ? `planned${d.title ? `, ${d.title}` : ''}` : 'rest'}`}>
            <span className={`text-xs ${d.today ? 'font-bold text-ink' : 'text-muted'}`} aria-hidden="true">{d.day[0]}</span>
            <span aria-hidden="true" className={`w-8 h-8 max-w-full rounded-full flex items-center justify-center border-2 ${
              state === 'done' ? 'bg-neon border-neon text-on-neon'
                : state === 'missed' ? 'border-danger/40 text-danger/70'
                : state === 'planned' ? 'border-neon-stroke/50 text-neon-ink'
                : 'border-line text-muted'} ${d.today ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink/30' : ''}`}>
              <Icon icon={state === 'done' ? 'mdi:check' : state === 'missed' ? 'mdi:close' : state === 'planned' ? 'mdi:dumbbell' : 'mdi:minus'} width={16} />
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The goal at the top of Plan: a ring, the dates, where things stand, this week.
 * fp: fitness_profiles row; weights: merged weigh-ins oldest first; progress: planProgress()
 */
export function GoalCard({ fp, profile, weights, progress, history = [], onEditGoal, onLogWeight }) {
  const { unit, fromLb } = useUnit()
  const goal = fp?.primary_goal
  const weightGoal = isWeightGoal(goal) && fp?.target_weight_lb
  const g = weightGoal ? goalProgress({
    startLb: Number(fp.goal_start_weight_lb ?? profile?.weight_lb), targetLb: Number(fp.target_weight_lb),
    startDate: fp.goal_start_date, targetDate: fp.goal_target_date,
    weights: weights.length ? weights : profile?.weight_lb ? [{ date: todayKey(), weight_lb: profile.weight_lb }] : [],
  }) : null
  const allGoals = [goal, ...(fp?.secondary_goals ?? [])].filter(Boolean)
  const liftGoal = allGoals.some(hasLiftGoal)
  // Building muscle or strength: lift targets, when set, show under the ring; without a weight goal the ring measures them
  const lifts = liftGoal ? liftProgress(fp?.goal_lifts, history, fp?.goal_start_date) : null
  const endKey = weightGoal ? fp.goal_target_date : progress.endDate
  const left = daysUntil(endKey)
  const pct = g ? g.pct : lifts ? lifts.pct : progress.pct
  const dir = directionOf(goal)
  const w = lb => `${fromLb(lb)} ${unit}`

  // On a dated weight goal, where the straight line from start to target puts them today
  const expected = g?.expectedLb != null ? (g.expectedLb - g.startLb) / (g.targetLb - g.startLb) : null
  const status = g?.onTrack != null && g.leftLb > 0 ? (g.onTrack ? 'on' : 'behind') : null
  const when = left == null ? null : left > 0 ? `${left} days left` : g && g.leftLb > 0 ? 'Target date passed' : 'Done'

  return (
    <Card hero className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neon-ink flex items-center gap-1">
            <Icon icon={GOAL_ICONS[goal] ?? 'mdi:target'} width={14} aria-hidden="true" />{allGoals.length ? goalsLabel(allGoals) : 'Your goal'}
          </div>
          <h2 className="font-bold text-[1.75rem] text-ink leading-[1.1] tracking-tight mt-1 break-words">
            {g ? `${dir === 'lose' ? 'Lose' : 'Gain'} ${fromLb(Math.abs(g.targetLb - g.startLb))} ${unit}` : `Week ${Math.min(progress.week, progress.weeks)} of ${progress.weeks}`}
          </h2>
          <p className="text-sm text-ink-2 mt-1">
            {endKey && <>{weightGoal ? 'By' : 'Ends'} {fmtDay(endKey)}</>}{endKey && when && ' · '}{when && <span className="tabular-nums">{when}</span>}
          </p>
        </div>
        {status && (
          <span className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${status === 'on' ? 'bg-neon-tint text-neon-ink border border-neon-stroke/25' : 'bg-warn/15 text-warn'}`}>
            <Icon icon={status === 'on' ? 'mdi:check' : 'mdi:clock-alert-outline'} width={14} aria-hidden="true" />{status === 'on' ? 'On track' : 'Behind'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex flex-col items-center gap-2">
          <ProgressRing pct={pct} expected={expected}
            label={g ? `${Math.round(pct * 100)}% of the way to ${w(g.targetLb)}${expected != null ? `; the pace you set puts you at ${Math.round(expected * 100)}% today` : ''}` : lifts ? `${Math.round(pct * 100)}% of the way to your lift targets` : `${progress.done} of ${progress.planned} planned workouts done`}>
            <span className="font-bold text-[2.25rem] text-ink tabular-nums leading-none tracking-tight">{Math.round(pct * 100)}<span className="text-xl">%</span></span>
            <span className="text-xs text-muted mt-1">{g || lifts ? 'to goal' : 'workouts done'}</span>
          </ProgressRing>
          {expected != null && (
            <span className="text-xs text-muted flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-ink" aria-hidden="true" />Where your pace puts you
            </span>
          )}
        </div>
        <Figures rows={g ? [
          ['Now', w(g.currentLb)],
          [dir === 'lose' ? 'Lost' : 'Gained', `${g.doneLb < 0 ? '−' : ''}${fromLb(Math.abs(g.doneLb))} ${unit}`, g.doneLb > 0 ? 'text-neon-ink' : undefined],
          ['To go', w(g.leftLb)],
          ['Started', `${fmtDay(fp?.goal_start_date ?? progress.startDate)}`],
        ] : [
          ['Done', `${progress.done} of ${progress.planned}`],
          ['This week', `${progress.weekDone} of ${progress.weekPlanned}`],
          ['Per week', progress.perWeek || '–'],
          ['Started', `${fmtDay(fp?.goal_start_date ?? progress.startDate)}`],
        ]} />
      </div>

      {lifts ? (
        <ul className="space-y-3" aria-label="Lift targets">
          {lifts.lifts.map(l => (
            <li key={l.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold text-ink">{l.name}</span>
                <span className="tabular-nums text-ink-2">
                  <span className="font-bold text-ink">{fromLb(l.currentLb)}</span> of {fromLb(l.targetLb)} {unit} × {GOAL_REPS}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-raised overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-neon transition-[width] duration-700" style={{ width: `${Math.round(l.pct * 100)}%` }} />
              </div>
              <div className="text-xs text-muted mt-1 tabular-nums">
                {l.pct >= 1 ? 'Target reached' : `${fromLb(Math.max(0, l.targetLb - l.currentLb))} ${unit} to go`} · started at {fromLb(l.startLb)} {unit}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold text-ink">This week</span>
          <span className="text-xs text-muted tabular-nums">{progress.weekDone} of {progress.weekPlanned} workouts</span>
        </div>
        <WeekStrip days={progress.thisWeek} />
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button variant="secondary" icon="mdi:scale-bathroom" onClick={onLogWeight}>Log weight</Button>
        <Button variant="secondary" icon="mdi:target" onClick={onEditGoal}>{weightGoal || goal ? 'Edit goal' : 'Set a goal'}</Button>
      </div>
      {!lifts && liftGoal && (
        <button onClick={onEditGoal} className="press w-full text-left rounded-xl border border-dashed border-neon-stroke/40 px-3 py-2.5 text-sm text-ink-2">
          <span className="font-semibold text-neon-ink">Set lift targets</span> to see your strength go up here, like your bench press from 80 to 90 kg.
        </button>
      )}
      {g?.lastDate && <p className="text-xs text-muted -mt-2">Last weigh-in {fmtDay(g.lastDate)}. Weigh in once a week, same time of day.</p>}
    </Card>
  )
}

// Results since the goal started: the weight line toward the target, and a dated timeline
export function ResultsCard({ fp, weights, progress, history }) {
  const { unit, fromLb } = useUnit()
  const start = fp?.goal_start_date ?? progress.startDate
  const since = weights.filter(x => !start || x.date >= start)
  const target = isWeightGoal(fp?.primary_goal) && fp?.target_weight_lb ? fromLb(Number(fp.target_weight_lb)) : null
  const logs = history.filter(h => (h.date ?? localDateKey(h.created_at)) >= (start ?? ''))
  const volume = logs.reduce((a, h) => a + (Number(h.volume) || 0), 0)
  const first = since[0], last = since[since.length - 1]

  const timeline = [
    start && { date: start, icon: 'mdi:flag-outline', text: `Goal started${fp?.goal_start_weight_lb ? ` at ${fromLb(Number(fp.goal_start_weight_lb))} ${unit}` : ''}` },
    ...logs.slice(0, 50).reduce((acc, h) => {
      const d = h.date ?? localDateKey(h.created_at)
      return acc.some(x => x.date === d && x.kind === 'w') ? acc : [...acc, { date: d, kind: 'w', icon: 'mdi:dumbbell', text: h.name || 'Workout' }]
    }, []),
    ...since.map(x => ({ date: x.date, icon: 'mdi:scale-bathroom', text: `Weighed ${fromLb(x.weight_lb)} ${unit}` })),
    fp?.goal_target_date && { date: fp.goal_target_date, icon: 'mdi:flag-checkered', text: target != null ? `Target: ${target} ${unit}` : 'Goal date', future: fp.goal_target_date > todayKey() },
  ].filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? timeline : timeline.slice(0, 6)

  return (
    <Card className="space-y-4">
      <SectionTitle action={<InfoButton title="Results">
        Everything since your goal started: weigh-ins from check-ins and Progress, and every logged workout. The dashed line is your target.
      </InfoButton>}>Results</SectionTitle>

      <StatTiles items={[
        ['Workouts', logs.length],
        ['Volume', volume ? `${Math.round(fromLb(volume)).toLocaleString()} ${unit}` : '–'],
        ['Weight', first && last && first !== last ? `${last.weight_lb - first.weight_lb > 0 ? '+' : '−'}${fromLb(Math.abs(last.weight_lb - first.weight_lb))} ${unit}` : '–'],
      ]} />

      {since.length > 1 && <LineChart data={since.map(x => ({ date: x.date, value: fromLb(x.weight_lb) }))} unit={unit} label="Weight" target={target} />}

      {timeline.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-ink mb-2">Timeline</div>
          <ol className="relative border-l border-line ml-2 space-y-3">
            {shown.map((t, i) => (
              <li key={i} className="pl-4 relative">
                <span className={`absolute -left-[9px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${t.future ? 'bg-raised border border-line-strong' : 'bg-neon/20'}`} aria-hidden="true">
                  <Icon icon={t.icon} width={10} className={t.future ? 'text-muted' : 'text-neon-ink'} />
                </span>
                <div className="text-xs text-muted tabular-nums">{fmtDay(t.date)}{t.future ? ' · upcoming' : ''}</div>
                <div className="text-sm text-ink break-words">{t.text}</div>
              </li>
            ))}
          </ol>
          {timeline.length > 6 && (
            <button onClick={() => setShowAll(s => !s)} className="press text-xs font-semibold text-neon-ink mt-2 min-h-[32px]">
              {showAll ? 'Show less' : `Show all ${timeline.length}`}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

// Pick a goal and, for weight goals, the target and pace. onSave({ goal, targetLb, pace, plan })
export function GoalSheet({ fp, profile, history = [], onClose, onSave, saving, error, rebuilds }) {
  const { fromLb } = useUnit()
  const [lifts, setLifts] = useState(() => fp?.goal_lifts ?? [])
  const [goals, setGoals] = useState(() => [fp?.primary_goal ?? 'general_fitness', ...(fp?.secondary_goals ?? [])].slice(0, MAX_GOALS))
  const [goal, ...secondaryGoals] = orderGoals(goals)
  const liftGoal = goals.some(hasLiftGoal)
  const [targetText, setTargetText] = useState(fp?.target_weight_lb ? String(fromLb(Number(fp.target_weight_lb))) : '')
  const [pace, setPace] = useState(fp?.goal_pace ?? 'steady')
  const activityLevel = fp?.activity_level ?? 'moderately_active'
  const wt = isWeightGoal(goal) ? readWeightTarget({ goal, targetText, pace, profile, activityLevel }) : null
  const liftsOk = !liftGoal || lifts.every(l => l.startLb > 0 && l.targetLb > l.startLb)
  const ready = !!goal && (!isWeightGoal(goal) || !!wt?.plan) && liftsOk

  return (
    <Sheet title="Your goals" onClose={onClose} footer={
      <Button full onClick={() => onSave({ goal, secondaryGoals, targetLb: wt?.targetLb ?? null, pace: wt ? pace : null, plan: wt?.plan ?? null, lifts: liftGoal ? lifts : [] })} disabled={!ready || saving}>
        {saving ? 'Saving…' : rebuilds ? 'Save and rebuild my plan' : 'Save goal'}
      </Button>
    }>
      <p className="text-xs text-muted">Pick one, or two that go together. {rebuilds ? 'Your daily targets and plan are rebuilt for them; takes about a minute.' : 'Your daily calorie and protein targets follow them.'}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
        {Object.entries(GOAL_LABELS).map(([id, label]) => {
          const on = goals.includes(id), why = blockedBy(goals, id)
          return (
            <button key={id} onClick={() => setGoals(toggleGoal(goals, id))} aria-pressed={on} disabled={!!why}
              className={`press flex items-center gap-2 px-3 py-3 rounded-xl border text-left text-sm transition-colors disabled:opacity-40 ${
                on ? 'border-neon-stroke bg-neon/10 text-ink' : 'border-line bg-surface text-muted hover:border-line-strong'}`}>
              <Icon icon={GOAL_ICONS[id]} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
              <span className="leading-tight min-w-0">{label}{why && <span className="block text-xs">{why}</span>}</span>
            </button>
          )
        })}
      </div>
      {isWeightGoal(goal) && (
        <WeightTarget goal={goal} targetText={targetText} setTargetText={setTargetText} pace={pace} setPace={setPace} profile={profile} activityLevel={activityLevel} />
      )}
      {liftGoal && <LiftTargets lifts={lifts} setLifts={setLifts} history={history} />}
      {error && <InlineError>{error}</InlineError>}
    </Sheet>
  )
}

// Up to three lifts, each with today's best set of 5 and a target. Today's best comes from the log
// when there is one; otherwise it's typed in.
function LiftTargets({ lifts, setLifts, history }) {
  const { unit, fromLb, toLb } = useUnit()
  const picked = new Set(lifts.map(l => l.name))
  function toggle(name) {
    if (picked.has(name)) return setLifts(lifts.filter(l => l.name !== name))
    if (lifts.length >= MAX_LIFTS) return
    const best = bestSet(history, name)?.lb ?? 0
    setLifts([...lifts, { name, startLb: best, targetLb: suggestTarget(best, unit) ?? 0 }])
  }
  // What's typed stays as typed (so "82." keeps its dot); the stored value is in lb
  const [texts, setTexts] = useState({})
  const shown = (l, k) => texts[`${l.name}:${k}`] ?? (l[k] ? String(fromLb(l[k])) : '')
  function set(name, k, v) {
    setTexts(t => ({ ...t, [`${name}:${k}`]: v }))
    const n = parseFloat(v)
    setLifts(lifts.map(l => (l.name === name ? { ...l, [k]: n > 0 ? toLb(n) : 0 } : l)))
  }
  const field = 'w-20 bg-raised border border-line rounded-lg px-2 py-1.5 text-sm font-semibold text-ink tabular-nums focus:outline-none focus:border-neon-stroke/40'

  return (
    <div className="space-y-3 bg-surface border border-line rounded-2xl p-4">
      <div>
        <div className="text-sm font-semibold text-ink">Lift targets</div>
        <div className="text-xs text-muted">Pick up to {MAX_LIFTS}. Each is your heaviest set of {GOAL_REPS} reps; Plan shows it rise as you log.</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KEY_LIFTS.map(l => (
          <button key={l.name} type="button" onClick={() => toggle(l.name)} aria-pressed={picked.has(l.name)}
            disabled={!picked.has(l.name) && lifts.length >= MAX_LIFTS}
            className={`press text-xs font-semibold rounded-lg border px-2.5 py-1.5 disabled:opacity-40 ${picked.has(l.name) ? 'border-neon-stroke bg-neon/10 text-ink' : 'border-line text-ink-2'}`}>
            {l.name}
          </button>
        ))}
      </div>
      {lifts.map(l => (
        <div key={l.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <span className="grow basis-0 min-w-[7rem] text-sm font-semibold text-ink">{l.name}</span>
          <label className="flex items-center gap-1.5 text-xs text-muted">Now
            <input type="number" inputMode="decimal" step="0.5" value={shown(l, 'startLb')} placeholder="0" aria-label={`${l.name}, best set of ${GOAL_REPS} now, ${unit}`}
              onChange={e => set(l.name, 'startLb', e.target.value)} className={field} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">Target
            <input type="number" inputMode="decimal" step="0.5" value={shown(l, 'targetLb')} placeholder="0" aria-label={`${l.name}, target, ${unit}`}
              onChange={e => set(l.name, 'targetLb', e.target.value)} className={field} />
            <span>{unit}</span>
          </label>
          {l.startLb > 0 && l.targetLb > 0 && l.targetLb <= l.startLb && <p className="w-full text-xs text-danger">Set the target above today's weight</p>}
        </div>
      ))}
    </div>
  )
}

// One number: today's weight
export function WeightSheet({ onClose, onSave, saving, error }) {
  const { unit, toLb } = useUnit()
  const [v, setV] = useState('')
  const n = parseFloat(v)
  const ok = n > (unit === 'kg' ? 25 : 55) && n < (unit === 'kg' ? 300 : 660)
  return (
    <Sheet title="Log weight" onClose={onClose} footer={
      <Button full onClick={() => onSave(toLb(n))} disabled={!ok || saving}>{saving ? 'Saving…' : 'Save'}</Button>
    }>
      <label className="block">
        <span className="text-sm text-muted">Today's weight ({unit})</span>
        <input type="number" inputMode="decimal" step="0.1" autoFocus value={v} onChange={e => setV(e.target.value)}
          className="mt-1 w-full bg-raised border border-line rounded-xl px-3 py-3 text-2xl font-bold text-ink tabular-nums focus:outline-none focus:border-neon-stroke/40" />
      </label>
      <p className="text-xs text-muted">Also updates your weight on Progress and your profile.</p>
      {error && <InlineError>{error}</InlineError>}
    </Sheet>
  )
}
