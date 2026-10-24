// What the app shows for Pro. The Stripe prices behind STRIPE_PRICE_MONTHLY and
// STRIPE_PRICE_ANNUAL (Vercel env) must match these amounts.
export const TRIAL_DAYS = 7

export const PLANS = {
  monthly: { id: 'monthly', price: 7.99, label: 'Monthly', per: 'month' },
  annual: { id: 'annual', price: 59.99, label: 'Yearly', per: 'year' },
}

export const annualPerMonth = Math.floor((PLANS.annual.price / 12) * 100) / 100 // 4.99
export const annualSavingPct = Math.round((1 - PLANS.annual.price / (PLANS.monthly.price * 12)) * 100) // 37

export const money = n => `$${n.toFixed(2)}`

// One list, used everywhere Pro is described
export const PRO_FEATURES = [
  { icon: 'mdi:calendar-check-outline', title: 'A training plan built for your goal', body: 'Your week of workouts, sets and reps, rebuilt as you log.' },
  { icon: 'mdi:target', title: 'Calorie targets that follow your real weight', body: 'Adjusted every week from your weigh-ins and meals.' },
  { icon: 'mdi:camera-outline', title: 'Log a meal from a photo', body: 'Snap your plate and get calories and macros in seconds.' },
  { icon: 'mdi:dumbbell', title: 'Unlimited saved workouts', body: 'Free accounts can save 3.' },
]
