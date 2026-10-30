// Up to two goals at once, like lose weight and build muscle. Goals that pull the scale in
// opposite directions can't go together. With a weight goal in the pair, it comes first: it sets
// the calories and the progress ring; the other shapes the training too.
import { GOAL_LABELS } from './nutrition.js'

export const MAX_GOALS = 2
const WEIGHT = ['lose_weight', 'gain_weight', 'maintain_weight']

// Two goals that can't be picked together, or false
export const clashes = (a, b) => a !== b && WEIGHT.includes(a) && WEIGHT.includes(b)

// Why `id` can't be added to `picked` right now, or null
export function blockedBy(picked, id) {
  if (picked.includes(id)) return null
  const clash = picked.find(p => clashes(p, id))
  return clash ? `Not with ${GOAL_LABELS[clash].toLowerCase()}` : null
}

// Tap a goal: add it, or take it off. A third replaces the second.
export function toggleGoal(picked, id) {
  if (picked.includes(id)) return picked.filter(g => g !== id)
  if (blockedBy(picked, id)) return picked
  return picked.length < MAX_GOALS ? [...picked, id] : [picked[0], id]
}

// [primary, ...secondary]: a weight goal leads
export function orderGoals(picked) {
  const w = picked.find(g => WEIGHT.includes(g))
  return w ? [w, ...picked.filter(g => g !== w)] : picked
}

export const goalsLabel = goals => [...new Set(goals.filter(Boolean))].map((g, i) => (i ? GOAL_LABELS[g]?.toLowerCase() : GOAL_LABELS[g])).join(' + ')
