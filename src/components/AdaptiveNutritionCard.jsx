import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from './ui/index.js'
import { estimateAdaptiveTargets } from '../lib/adaptiveNutrition.js'
import { fetchMeasurements, fetchCheckinWeights } from '../lib/progressApi.js'
import { fetchFitnessProfile, saveNutritionTarget } from '../lib/fitnessApi.js'
import { saveGoals } from '../lib/api.js'
import { useUnit } from '../lib/units.js'

// Shows the real-expenditure estimate and offers to update the calorie target.
export default function AdaptiveNutritionCard({ calorieLogs, current, profile, onApplied }) {
  const { unit, fromLb } = useUnit()
  const [weights, setWeights] = useState(null)
  const [goal, setGoal]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    Promise.all([
      fetchMeasurements(60).catch(() => []),
      fetchCheckinWeights().catch(() => []),
      fetchFitnessProfile().catch(() => null),
    ]).then(([measurements, checkins, fp]) => {
      // Body measurements win over check-ins on the same day
      const byDate = {}
      for (const c of checkins) byDate[c.date] = c
      for (const m of measurements) if (m.weight_lb) byDate[m.date] = { date: m.date, weight_lb: m.weight_lb }
      setWeights(Object.values(byDate))
      setGoal(fp?.primary_goal ?? 'general_fitness')
    })
  }, [])

  if (!weights || !current) return null

  const est = estimateAdaptiveTargets({ calorieLogs, weights, current, sex: profile?.sex, primaryGoal: goal })

  async function apply() {
    setSaving(true)
    setError('')
    try {
      const s = est.suggestion
      const row = await saveNutritionTarget({ ...s, safetyFlags: s.safetyFlags })
      await saveGoals({ calorie_goal: s.calorieTarget, protein_goal: s.proteinGrams, carb_goal: s.carbGrams })
      onApplied?.(row)
    } catch (e) {
      setError(e.message || 'Could not update targets')
    } finally {
      setSaving(false)
    }
  }

  if (!est.ready) {
    const p = est.progress
    return (
      <div className="bg-surface border border-line rounded-2xl p-4">
        <div className="text-lg leading-[1.3] font-semibold text-ink mb-1">Adaptive targets</div>
        <p className="text-xs text-muted leading-relaxed">
          Log food and weigh in regularly and your targets will adjust to how your body actually responds.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3 text-center">
          {[
            ['Days logged', p.loggedDays, p.neededDays],
            ['Weigh-ins', p.weighIns, p.neededWeighIns],
          ].map(([label, have, need]) => (
            <div key={label} className="bg-raised rounded-xl py-2">
              <div className="font-bold text-lg text-ink">{Math.min(have, need)}<span className="text-muted text-sm">/{need}</span></div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">Weigh-ins need to span at least {p.neededSpan} days. Add them in the Progress tab.</p>
      </div>
    )
  }

  const trend = est.weeklyChangeLb === 0 ? 'stable' : `${est.weeklyChangeLb > 0 ? '+' : ''}${fromLb(est.weeklyChangeLb)} ${unit}/week`

  return (
    <div className="bg-surface border border-neon-stroke/20 rounded-2xl p-4">
      <div className="text-xs text-neon-ink mb-2">Adaptive targets</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="font-bold text-lg text-ink">{est.avgIntake}</div><div className="text-sm font-semibold text-ink-2">Avg eaten</div></div>
        <div><div className="font-bold text-lg text-ink">{trend}</div><div className="text-sm font-semibold text-ink-2">Weight</div></div>
        <div><div className="font-bold text-lg text-neon-ink">{est.estimatedTdee}</div><div className="text-sm font-semibold text-ink-2">Real burn</div></div>
      </div>
      {est.formulaTdee && (
        <p className="text-xs text-muted mt-2">Your current target assumed {Math.round(est.formulaTdee)} kcal/day; your data says {est.estimatedTdee}.</p>
      )}
      {est.suggestion ? (
        <>
          <p className="text-xs text-muted mt-3">
            Suggested target: <span className="text-ink font-semibold">{est.suggestion.calorieTarget} kcal</span>
            {' '}({est.diff > 0 ? '+' : ''}{est.diff}) · P {est.suggestion.proteinGrams}g · C {est.suggestion.carbGrams}g · F {est.suggestion.fatGrams}g
          </p>
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
          <Button full onClick={apply} disabled={saving} className="mt-3">
            {saving ? 'Updating...' : 'Apply new targets'}
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted mt-3 flex items-center gap-1.5"><Icon icon="mdi:check-circle-outline" width={14} className="text-neon-ink flex-shrink-0" />Your current target already matches your real burn.</p>
      )}
    </div>
  )
}
