import { fromLb, toLb } from '../lib/units.js'
import { PACES, directionOf, targetProblem, weightPlan } from '../lib/weightGoal.js'

const fmtDate = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// The weight goal's numbers from what's typed: { targetLb, plan, problem }
export function readWeightTarget({ goal, targetText, pace, profile, activityLevel }) {
  const unit = profile?.weight_unit === 'kg' ? 'kg' : 'lb'
  const targetLb = targetText === '' ? null : toLb(parseFloat(targetText), unit)
  const args = { goal, weightLb: profile?.weight_lb, targetLb, heightCm: profile?.height_cm }
  const problem = targetProblem(args)
  const plan = problem ? null : weightPlan({ ...args, pace, sex: profile?.sex, age: profile?.age, activityLevel })
  return { targetLb, plan, problem }
}

// For lose / gain weight: how much, and how fast. Shows the date and the daily calories it means.
export default function WeightTarget({ goal, targetText, setTargetText, pace, setPace, profile, activityLevel = 'moderately_active' }) {
  const dir = directionOf(goal)
  if (!dir) return null
  const unit = profile?.weight_unit === 'kg' ? 'kg' : 'lb'
  const now = fromLb(profile?.weight_lb, unit)
  const { targetLb, plan, problem } = readWeightTarget({ goal, targetText, pace, profile, activityLevel })
  const diff = targetLb && profile?.weight_lb ? Math.abs(fromLb(targetLb - profile.weight_lb, unit)) : null

  return (
    <div className="space-y-3 bg-surface border border-line rounded-2xl p-4">
      <label className="block">
        <span className="text-sm font-semibold text-ink">Weight you want to reach</span>
        <span className="block text-xs text-muted">You weigh {now} {unit} now</span>
        <span className="mt-2 flex items-center gap-2">
          <input type="number" inputMode="decimal" step="0.1" value={targetText} onChange={e => setTargetText(e.target.value)}
            placeholder={String(Math.round(dir === 'lose' ? now * 0.92 : now * 1.06))} aria-label={`Target weight in ${unit}`}
            className="w-28 bg-raised border border-line rounded-xl px-3 py-2 text-lg font-bold text-ink tabular-nums placeholder:text-placeholder placeholder:font-normal focus:outline-none focus:border-neon-stroke/40" />
          <span className="text-sm text-muted">{unit}</span>
          {diff > 0 && !problem && <span className="ml-auto text-sm font-semibold text-neon-ink tabular-nums">{dir === 'lose' ? '−' : '+'}{diff} {unit}</span>}
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold text-ink mb-1.5">Pace</legend>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5.5rem), 1fr))' }}>
          {PACES[dir].map(p => {
            const weekly = profile?.weight_lb ? fromLb(profile.weight_lb * p.pct, unit) : null
            const on = pace === p.id
            return (
              <button key={p.id} type="button" onClick={() => setPace(p.id)} aria-pressed={on}
                className={`press rounded-xl border px-2 py-2 text-center ${on ? 'border-neon-stroke bg-neon/10' : 'border-line bg-raised hover:border-line-strong'}`}>
                <span className="block text-sm font-semibold text-ink">{p.label}</span>
                {weekly != null && <span className="block text-xs text-muted tabular-nums">{weekly} {unit} a week</span>}
              </button>
            )
          })}
        </div>
      </fieldset>

      {targetText !== '' && problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
      {plan && (
        <div className="rounded-xl bg-neon/10 border border-neon-stroke/30 px-3 py-2.5 text-sm text-ink-2" aria-live="polite">
          <span className="font-semibold text-ink">{dir === 'lose' ? 'Lose' : 'Gain'} {diff} {unit} by {plan.targetDate ? fmtDate(plan.targetDate) : 'later'}</span>
          <span className="block text-xs text-muted tabular-nums mt-0.5">
            About {fromLb(plan.weeklyLb, unit)} {unit} a week · {plan.calories.toLocaleString()} kcal a day ({plan.dailyAdjustment > 0 ? '+' : '−'}{Math.abs(plan.dailyAdjustment)} from what you burn)
          </span>
          {plan.floored && <span className="block text-xs text-muted mt-1">Calories stay at a safe minimum, so this takes a little longer.</span>}
        </div>
      )}
    </div>
  )
}
