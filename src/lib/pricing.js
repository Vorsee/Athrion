// What the app shows for Pro. The Stripe prices behind STRIPE_PRICE_MONTHLY and
// STRIPE_PRICE_ANNUAL (Vercel env) must match these amounts.
export const TRIAL_DAYS = 7
// Saved workouts a free account can keep; Pro is unlimited
export const FREE_WORKOUT_LIMIT = 3

export const PLANS = {
  monthly: { id: 'monthly', price: 4.99, label: 'Monthly', per: 'month' },
  annual: { id: 'annual', price: 49.99, label: 'Yearly', per: 'year' },
}

export const annualPerMonth = Math.floor((PLANS.annual.price / 12) * 100) / 100 // 4.16
export const annualSavingPct = Math.round((1 - PLANS.annual.price / (PLANS.monthly.price * 12)) * 100) // 17

export const money = n => `$${n.toFixed(2)}`

// How prices are quoted outside the plan picker: the real monthly and yearly charges, not a per-month average
export const priceLine = () => `${money(PLANS.monthly.price)} a month or ${money(PLANS.annual.price)} a year`

// One list, used everywhere Pro is described
export const PRO_FEATURES = [
  { icon: 'mdi:calendar-check-outline', title: 'A training plan that coaches you', body: 'Next-session targets on every exercise, a weekly review, missed days moved and lighter weeks built in.' },
  { icon: 'mdi:swim', title: 'Pool workouts and stroke charts', body: 'Swim sessions with drills and send-offs in your plan, and your pace for every stroke over time.' },
  { icon: 'mdi:silverware-fork-knife', title: 'An AI meal plan for your week', body: '7 days of meals for your targets, diet and tastes, with a shopping list.' },
  { icon: 'mdi:target', title: 'Calorie targets that follow your real weight', body: 'Adjusted every week from your weigh-ins and meals.' },
  { icon: 'mdi:camera-outline', title: 'Log a meal from a photo', body: 'Snap your plate and get calories and macros in seconds.' },
  { icon: 'mdi:dumbbell', title: 'Unlimited saved workouts', body: 'Free accounts can save 3.' },
]

// ATHRION's share of each coach sale (api/_coach-fee.js charges it; a test keeps them equal)
export const COACH_FEE_RATE = 0.2
