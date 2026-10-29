import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, SectionTitle, Fact, StatTiles, InfoButton, InlineError } from './ui/index.js'
import Sheet from './Sheet.jsx'
import LineChart from './LineChart.jsx'
import WeightTarget, { readWeightTarget } from './WeightTarget.jsx'
import { GOAL_LABELS, GOAL_ICONS } from '../lib/nutrition.js'
import { isWeightGoal, goalProgress, directionOf } from '../lib/weightGoal.js'
import { useUnit } from '../lib/units.js'
import { localDateKey, todayKey } from '../lib/data.js'

const fmtDay = key => (key ? new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–')
const daysUntil = key => (key ? Math.ceil((new Date(`${key}T12:00:00`) - new Date(`${todayKey()}T12:00:00`)) / 86400000) : null)

// A ring that fills with pct (0-1); whatever's inside sits in the middle
export function ProgressRing({ pct, size = 120, stroke = 10, label, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} className="text-neon-ink transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
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
export function GoalCard({ fp, profile, weights, progress, onEditGoal, onLogWeight }) {
  const { unit, fromLb } = useUnit()
  const goal = fp?.primary_goal
  const weightGoal = isWeightGoal(goal) && fp?.target_weight_lb
  const g = weightGoal ? goalProgress({
    startLb: Number(fp.goal_start_weight_lb ?? profile?.weight_lb), targetLb: Number(fp.target_weight_lb),
    startDate: fp.goal_start_date, targetDate: fp.goal_target_date,
    weights: weights.length ? weights : profile?.weight_lb ? [{ date: todayKey(), weight_lb: profile.weight_lb }] : [],
  }) : null
  const endKey = weightGoal ? fp.goal_target_date : progress.endDate
  const left = daysUntil(endKey)
  const pct = g ? g.pct : progress.pct
  const dir = directionOf(goal)
  const w = lb => `${fromLb(lb)} ${unit}`

  return (
    <Card hero className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <ProgressRing pct={pct} label={g ? `${Math.round(pct * 100)}% of the way to ${w(g.targetLb)}` : `${progress.done} of ${progress.planned} planned workouts done`}>
          <span className="font-bold text-3xl text-ink tabular-nums leading-none">{Math.round(pct * 100)}%</span>
          <span className="text-xs text-muted mt-1">{g ? 'to goal' : 'workouts'}</span>
        </ProgressRing>
        <div className="grow basis-0 min-w-[9rem] space-y-2">
          <div>
            <div className="text-xs font-semibold text-neon-ink flex items-center gap-1">
              <Icon icon={GOAL_ICONS[goal] ?? 'mdi:target'} width={14} aria-hidden="true" />{GOAL_LABELS[goal] ?? 'Your goal'}
            </div>
            <div className="font-bold text-xl text-ink leading-tight">
              {g ? `${dir === 'lose' ? 'Lose' : 'Gain'} ${fromLb(Math.abs(g.targetLb - g.startLb))} ${unit}` : `Week ${Math.min(progress.week, progress.weeks)} of ${progress.weeks}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Fact icon="mdi:flag-outline">Started {fmtDay(fp?.goal_start_date ?? progress.startDate)}</Fact>
            {endKey && <Fact icon="mdi:flag-checkered">{weightGoal ? 'Target' : 'Ends'} {fmtDay(endKey)}</Fact>}
          </div>
          {left != null && (
            <div className="text-sm text-ink-2">
              {left > 0 ? <><span className="font-bold text-ink tabular-nums">{left}</span> days left</> : g && g.leftLb > 0 ? 'Target date passed' : 'Done'}
              {g?.onTrack != null && g.leftLb > 0 && (
                <span className={`ml-2 inline-flex text-xs font-semibold px-1.5 py-0.5 rounded-md ${g.onTrack ? 'bg-neon/15 text-neon-ink' : 'bg-warn/15 text-warn'}`}>
                  {g.onTrack ? 'On track' : 'Behind'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {g ? (
        <StatTiles items={[
          ['Now', w(g.currentLb)],
          [dir === 'lose' ? 'Lost' : 'Gained', `${g.doneLb < 0 ? '−' : ''}${fromLb(Math.abs(g.doneLb))} ${unit}`],
          ['To go', w(g.leftLb)],
        ]} />
      ) : (
        <StatTiles items={[
          ['Done', `${progress.done} of ${progress.planned}`],
          ['This week', `${progress.weekDone} of ${progress.weekPlanned}`],
          ['Per week', progress.perWeek || '–'],
        ]} />
      )}

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
    fp?.goal_target_date && { date: fp.goal_target_date, icon: 'mdi:flag-checkered', text: `Target: ${target} ${unit}`, future: fp.goal_target_date > todayKey() },
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
export function GoalSheet({ fp, profile, onClose, onSave, saving, error, rebuilds }) {
  const { fromLb } = useUnit()
  const [goal, setGoal] = useState(fp?.primary_goal ?? 'general_fitness')
  const [targetText, setTargetText] = useState(fp?.target_weight_lb ? String(fromLb(Number(fp.target_weight_lb))) : '')
  const [pace, setPace] = useState(fp?.goal_pace ?? 'steady')
  const activityLevel = fp?.activity_level ?? 'moderately_active'
  const wt = isWeightGoal(goal) ? readWeightTarget({ goal, targetText, pace, profile, activityLevel }) : null
  const ready = !isWeightGoal(goal) || !!wt?.plan

  return (
    <Sheet title="Your goal" onClose={onClose} footer={
      <Button full onClick={() => onSave({ goal, targetLb: wt?.targetLb ?? null, pace: wt ? pace : null, plan: wt?.plan ?? null })} disabled={!ready || saving}>
        {saving ? 'Saving…' : rebuilds ? 'Save and rebuild my plan' : 'Save goal'}
      </Button>
    }>
      <p className="text-xs text-muted">{rebuilds ? 'Your daily targets and plan are rebuilt for it. Takes about a minute.' : 'Your daily calorie and protein targets follow it.'}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))' }}>
        {Object.entries(GOAL_LABELS).map(([id, label]) => (
          <button key={id} onClick={() => setGoal(id)} aria-pressed={goal === id}
            className={`press flex items-center gap-2 px-3 py-3 rounded-xl border text-left text-sm transition-colors ${
              goal === id ? 'border-neon-stroke bg-neon/10 text-ink' : 'border-line bg-surface text-muted hover:border-line-strong'}`}>
            <Icon icon={GOAL_ICONS[id]} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
      {isWeightGoal(goal) && (
        <WeightTarget goal={goal} targetText={targetText} setTargetText={setTargetText} pace={pace} setPace={setPace} profile={profile} activityLevel={activityLevel} />
      )}
      {error && <InlineError>{error}</InlineError>}
    </Sheet>
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
