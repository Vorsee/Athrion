// Weight goals: from today's weight, a target weight and a pace, the weekly rate, the daily
// calorie change that gets there and the date it should land. Weights in lb (as stored).
//
// Rate: a share of body weight per week, the usual safe range (loss 0.5-1%, gain 0.25-0.5%).
// Energy: about 3,500 kcal per lb of body weight, spread over the week.
// Limits: no more than 1,000 kcal a day off, 500 a day on, and never a target under a BMI of
// 18.5. When the calorie floor (MIN_CALORIES) bites, the real rate is slower: the date says so.
import { calcBMR, calcTDEE, MIN_CALORIES } from './nutrition.js'

export const KCAL_PER_LB = 3500
export const WEIGHT_GOALS = ['lose_weight', 'gain_weight']

export const PACES = {
  lose: [
    { id: 'gentle', label: 'Gentle', pct: 0.005 },
    { id: 'steady', label: 'Steady', pct: 0.0075 },
    { id: 'fast',   label: 'Faster', pct: 0.01 },
  ],
  gain: [
    { id: 'gentle', label: 'Gentle', pct: 0.0025 },
    { id: 'steady', label: 'Steady', pct: 0.00375 },
    { id: 'fast',   label: 'Faster', pct: 0.005 },
  ],
}
const MAX_DEFICIT = 1000
const MAX_SURPLUS = 500
const MIN_BMI = 18.5

export const isWeightGoal = goal => WEIGHT_GOALS.includes(goal)
export const directionOf = goal => (goal === 'lose_weight' ? 'lose' : goal === 'gain_weight' ? 'gain' : null)

// The lightest healthy target for a height (BMI 18.5), in lb
export function minHealthyLb(heightCm) {
  const m = heightCm / 100
  return Math.ceil(MIN_BMI * m * m * 2.20462)
}

// Why a target can't be used, or null. weightLb / targetLb in lb.
export function targetProblem({ goal, weightLb, targetLb, heightCm }) {
  const dir = directionOf(goal)
  if (!dir) return null
  if (!(targetLb > 0)) return 'Enter the weight you want to reach'
  if (dir === 'lose' && targetLb >= weightLb) return 'For losing weight, the target has to be under your weight now'
  if (dir === 'gain' && targetLb <= weightLb) return 'For gaining weight, the target has to be over your weight now'
  if (dir === 'lose' && heightCm && targetLb < minHealthyLb(heightCm)) return 'That is under a healthy weight for your height'
  if (Math.abs(targetLb - weightLb) > weightLb * 0.5) return 'That is a very big change. Set a nearer target first'
  return null
}

const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + Math.round(n)); return d }

/**
 * The plan for a weight goal.
 * @param {{ goal, pace, weightLb, targetLb, sex, heightCm, age, activityLevel, start?: Date }} p
 * @returns null for other goals, else
 *   { direction, weeklyLb, dailyAdjustment, calories, weeks, targetDate, floored }
 */
export function weightPlan({ goal, pace = 'steady', weightLb, targetLb, sex, heightCm, age, activityLevel, start = new Date() }) {
  const direction = directionOf(goal)
  if (!direction || !(weightLb > 0) || !(targetLb > 0) || targetProblem({ goal, weightLb, targetLb, heightCm })) return null
  const pct = (PACES[direction].find(p => p.id === pace) ?? PACES[direction][1]).pct
  let weeklyLb = weightLb * pct
  let dailyAdjustment = (weeklyLb * KCAL_PER_LB) / 7
  dailyAdjustment = direction === 'lose' ? -Math.min(dailyAdjustment, MAX_DEFICIT) : Math.min(dailyAdjustment, MAX_SURPLUS)

  const tdee = calcTDEE(calcBMR({ sex, weightLb, heightCm, age }), activityLevel)
  let calories = tdee + dailyAdjustment
  const floor = MIN_CALORIES[sex] ?? MIN_CALORIES.other
  const floored = calories < floor
  if (floored) {
    calories = floor
    dailyAdjustment = floor - tdee
  }
  // What the calories actually deliver, which is the rate the date is based on
  weeklyLb = Math.abs(dailyAdjustment) * 7 / KCAL_PER_LB
  const weeks = weeklyLb > 0 ? Math.abs(targetLb - weightLb) / weeklyLb : Infinity
  return {
    direction,
    weeklyLb: Math.round(weeklyLb * 100) / 100,
    dailyAdjustment: Math.round(dailyAdjustment),
    calories: Math.round(calories),
    weeks: Math.ceil(weeks),
    targetDate: Number.isFinite(weeks) ? addDays(start, weeks * 7) : null,
    floored,
  }
}

/**
 * How far along a goal is, from the weigh-ins since it started.
 * weights: [{ date, weight_lb }] any order. Returns null without a start and target.
 *   { startLb, currentLb, targetLb, doneLb, leftLb, pct, expectedLb, onTrack, lastDate }
 */
export function goalProgress({ startLb, targetLb, startDate, targetDate, weights = [], today = new Date() }) {
  if (!(startLb > 0) || !(targetLb > 0) || startLb === targetLb) return null
  const since = weights.filter(w => !startDate || w.date >= startDate).sort((a, b) => a.date.localeCompare(b.date))
  const last = since[since.length - 1]
  const currentLb = last ? Number(last.weight_lb) : startLb
  const total = targetLb - startLb
  const done = currentLb - startLb
  const pct = Math.max(0, Math.min(1, done / total))
  // Where the straight line from start to target says they should be today
  let expectedLb = null, onTrack = null
  if (startDate && targetDate) {
    const s = new Date(`${startDate}T12:00:00`), e = new Date(`${targetDate}T12:00:00`)
    const t = Math.max(0, Math.min(1, (today - s) / (e - s)))
    expectedLb = startLb + total * t
    // On track when at least 80% of the way the line expects (or no time has passed)
    onTrack = t === 0 || (done / total) >= t * 0.8
  }
  return {
    startLb, currentLb, targetLb,
    // Toward the target is positive; the wrong way is negative
    doneLb: Math.round(done * Math.sign(total) * 10) / 10,
    leftLb: Math.round(Math.max(0, (targetLb - currentLb) * Math.sign(total)) * 10) / 10,
    pct, expectedLb, onTrack, lastDate: last?.date ?? null,
  }
}
