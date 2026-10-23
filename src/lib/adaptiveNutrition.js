// Adaptive calorie targets: estimate real expenditure from what was eaten and how
// weight actually moved, instead of trusting the BMR formula.
import { macrosForCalories, GOAL_ADJUSTMENTS } from './nutrition.js'

const KCAL_PER_LB = 3500
const WINDOW_DAYS = 21
const MIN_LOGGED_DAYS = 10
const MIN_WEIGH_INS = 3
const MIN_SPAN_DAYS = 10

const dayNum = d => Math.floor(new Date(d).getTime() / 86400000)

// Least-squares slope of weight over time, in lb per day. Smooths out water-weight noise.
function weightSlope(points) {
  const n = points.length
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  return den ? num / den : 0
}

/**
 * @param calorieLogs  rows from calorie_logs ({ date, total_calories })
 * @param weights      [{ date, weight_lb }] from body_measurements and check-ins
 * @param current      latest nutrition_targets row
 * @param profile      { sex, weight_lb } plus primaryGoal
 * @returns null when there isn't enough data, otherwise the estimate and a suggested target
 */
export function estimateAdaptiveTargets({ calorieLogs, weights, current, sex, primaryGoal }) {
  const today = dayNum(Date.now())
  const inWindow = d => today - dayNum(d) <= WINDOW_DAYS

  // Ignore days that were clearly only partly logged
  const floor = (current?.calorie_target ?? 2000) * 0.4
  const intake = (calorieLogs ?? [])
    .filter(l => inWindow(l.date) && l.total_calories >= floor)
    .map(l => l.total_calories)

  const pts = (weights ?? [])
    .filter(w => w.weight_lb && inWindow(w.date))
    .map(w => ({ x: dayNum(w.date), y: Number(w.weight_lb) }))
  const span = pts.length ? Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)) : 0

  const progress = {
    loggedDays: intake.length, neededDays: MIN_LOGGED_DAYS,
    weighIns: pts.length, neededWeighIns: MIN_WEIGH_INS,
    spanDays: span, neededSpan: MIN_SPAN_DAYS,
  }
  if (intake.length < MIN_LOGGED_DAYS || pts.length < MIN_WEIGH_INS || span < MIN_SPAN_DAYS) {
    return { ready: false, progress }
  }

  const avgIntake = intake.reduce((a, b) => a + b, 0) / intake.length
  const slope = weightSlope(pts) // lb/day
  const tdee = Math.round(avgIntake - slope * KCAL_PER_LB)

  const adjustment = GOAL_ADJUSTMENTS[primaryGoal] ?? 0
  const latestWeight = pts.sort((a, b) => b.x - a.x)[0].y
  const macros = macrosForCalories({ calories: tdee + adjustment, sex, weightLb: latestWeight, primaryGoal })

  // Only worth suggesting when it moves the target meaningfully
  const diff = macros.calorieTarget - (current?.calorie_target ?? 0)

  return {
    ready: true,
    progress,
    avgIntake: Math.round(avgIntake),
    weeklyChangeLb: Math.round(slope * 7 * 10) / 10,
    estimatedTdee: tdee,
    formulaTdee: current?.tdee ?? null,
    suggestion: Math.abs(diff) >= 75 ? {
      ...macros,
      bmr: current?.bmr ?? null,
      tdee,
      goalAdjustment: adjustment,
      activityMultiplier: current?.activity_multiplier ?? null,
      calculationFormula: 'adaptive_intake_weight_trend',
      calculationVersion: 1,
    } : null,
    diff,
  }
}
