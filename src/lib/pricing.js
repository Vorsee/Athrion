// What the app shows for Pro. The Stripe prices behind STRIPE_PRICE_MONTHLY and
// STRIPE_PRICE_ANNUAL (Vercel env) must match these amounts.
export const TRIAL_DAYS = 7
// Saved workouts a free account can keep; Pro is unlimited
export const FREE_WORKOUT_LIMIT = 3

export const PLANS = {
  monthly: { id: 'monthly', price: 4.99, label: 'Monthly', per: 'month' },
  annual: { id: 'annual', price: 49.99, label: 'Yearly', per: 'year' },
}

// The coach and club plan (039): Pro, plus clubs, rooms of 12 and workout templates.
// STRIPE_PRICE_COACH_MONTHLY / STRIPE_PRICE_COACH_ANNUAL (Vercel env) must match these.
// Off until the two Stripe prices exist: nothing offers the plan, its prices or its features.
// Turn on together with the Stripe env vars, the coach card in index.html's JSON-LD and the terms (section 2).
export const COACH_PLAN_ON_SALE = false
export const COACH_PLANS = {
  coach_monthly: { id: 'coach_monthly', price: 9.99, label: 'Monthly', per: 'month' },
  coach_annual: { id: 'coach_annual', price: 99.99, label: 'Yearly', per: 'year' },
}
export const CLUB_SIZE = 50
export const COACH_ROOM_SIZE = 12
export const COACH_FEATURES = [
  { icon: 'mdi:account-group-outline', title: `Clubs up to ${CLUB_SIZE} people`, body: 'An invite link and your own monthly leaderboard, for a bootcamp, run club or team. Members join free.' },
  { icon: 'mdi:sofa-single-outline', title: `Rooms up to ${COACH_ROOM_SIZE} people`, body: 'Rooms you host hold twice as many: lead a whole class live.' },
  { icon: 'mdi:content-copy', title: 'Workout templates', body: 'Save a workout once and send it to many clients at once.' },
  { icon: 'mdi:star-four-points-outline', title: 'Everything in Pro', body: 'Your own AI plan, meal plan, themes and the rest.' },
]

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
  { icon: 'mdi:camera-outline', title: 'Unlimited meal photo scans', body: 'Snap your plate and get calories and macros in seconds. Free accounts get one a day.' },
  { icon: 'mdi:dumbbell', title: 'Unlimited saved workouts', body: 'Free accounts can save 3.' },
  { icon: 'mdi:palette-outline', title: 'Colour themes', body: 'Blossom, Blue and Mono, on top of the free Dark, Light and seasonal Christmas.' },
]

// ATHRION's share of each coach sale (api/_coach-fee.js charges it; a test keeps them equal)
export const COACH_FEE_RATE = 0.2
