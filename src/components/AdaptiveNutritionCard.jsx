import { useState, useEffect } from 'react'
import { Button, Card, SectionTitle, InfoButton, StatTiles, Fact } from './ui/index.js'
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
      <Card>
        <SectionTitle action={
          <InfoButton title="Adaptive targets">
            <p className="text-sm text-ink-2">Log food and weigh in regularly, and your calorie target adjusts to how your body actually responds.</p>
            <p className="text-sm text-ink-2">Weigh-ins need to span at least {p.neededSpan} days. Add them in Progress.</p>
          </InfoButton>
        }>Adaptive targets</SectionTitle>
        <StatTiles items={[
          ['Days logged', <>{Math.min(p.loggedDays, p.neededDays)}<span className="text-muted text-sm">/{p.neededDays}</span></>],
          ['Weigh-ins', <>{Math.min(p.weighIns, p.neededWeighIns)}<span className="text-muted text-sm">/{p.neededWeighIns}</span></>],
        ]} />
      </Card>
    )
  }

  const trend = est.weeklyChangeLb === 0 ? 'stable' : `${est.weeklyChangeLb > 0 ? '+' : ''}${fromLb(est.weeklyChangeLb)} ${unit}/week`

  return (
    <Card tone="neon">
      <SectionTitle action={<>
        {!est.suggestion && <Fact icon="mdi:check">On target</Fact>}
        {est.formulaTdee && (
          <InfoButton title="Adaptive targets">
            <p className="text-sm text-ink-2">Your current target assumed {Math.round(est.formulaTdee)} kcal a day. Your logs and weigh-ins say you burn {est.estimatedTdee}.</p>
          </InfoButton>
        )}
      </>}>Adaptive targets</SectionTitle>
      <StatTiles items={[['Avg eaten', est.avgIntake], ['Weight', trend], ['Real burn', <span className="text-neon-ink">{est.estimatedTdee}</span>]]} />
      {est.suggestion && (
        <>
          <div className="flex items-baseline justify-between gap-2 mt-4">
            <span className="text-sm font-semibold text-ink-2">New target</span>
            <span className="font-bold text-2xl text-neon-ink tabular-nums">{est.suggestion.calorieTarget} <span className="text-sm text-muted font-semibold">kcal ({est.diff > 0 ? '+' : ''}{est.diff})</span></span>
          </div>
          <div className="text-xs text-muted text-right tabular-nums">P {est.suggestion.proteinGrams}g · C {est.suggestion.carbGrams}g · F {est.suggestion.fatGrams}g</div>
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
          <Button full onClick={apply} disabled={saving} className="mt-3">
            {saving ? 'Updating...' : 'Apply new targets'}
          </Button>
        </>
      )}
    </Card>
  )
}
