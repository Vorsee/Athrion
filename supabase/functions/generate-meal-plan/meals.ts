// The AI meal plan's prompt, schema and checks, with no Deno or network dependencies so Vitest can test them.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DIETS = ['vegetarian', 'vegan', 'halal', 'fasting']
export const COOK_TIMES = { quick: 'under 15 minutes', normal: 'under 30 minutes', any: 'any time, including batch cooking' }

export const MEAL_SYSTEM = `You are a sports nutritionist who writes practical weekly meal plans for people training at the gym.

Rules:
- Hit the daily calorie and protein targets: each day within 5% of the calories and at or above 95% of the protein. Carbs and fat roughly as given.
- Everyday foods from a normal supermarket, weighed in grams (raw unless the name says cooked), or ml for liquids. Eggs may be counted ("2 eggs") with grams.
- Respect the diet strictly: vegetarian has no meat or fish; vegan has no animal products at all (no dairy, eggs or honey); halal has no pork or alcohol and only halal meat; fasting means two meals and one snack inside the eating window, no breakfast.
- Never use the foods the person dislikes. Use the foods they like often but not at every meal.
- Keep cooking within the time they gave. Reuse ingredients across the week so the shopping list stays short, and repeat a favourite lunch or breakfast on 2-3 days when it helps.
- Each meal: a short plain title, the minutes to make it, 2-7 ingredients with amounts, up to 3 short steps, and its kcal, protein, carbs and fat. Make the numbers add up from the ingredients.
- The grocery list totals each ingredient for the whole week, grouped by name, in grams or a count.
- Do not give medical advice or recommend supplements other than a protein powder when protein is hard to reach.`

const str = { type: 'string' }
const int = { type: 'integer' }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

export const MEAL_SCHEMA = obj({
  days: { type: 'array', items: obj({
    day: { type: 'string', enum: DAYS },
    meals: { type: 'array', items: obj({
      meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      title: str, minutes: int,
      ingredients: { type: 'array', items: obj({ name: str, amount: str }) },
      steps: { type: 'array', items: str },
      kcal: int, protein: int, carbs: int, fat: int,
    }) },
  }) },
  groceries: { type: 'array', items: obj({ item: str, amount: str }) },
  tips: { type: 'array', items: str },
})

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
const within = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null }

// The request from the app: targets, diet and preferences. Returns { input } or { error }.
export function readMealInput(body: any) {
  const calories = within(body?.calories, 1200, 6000)
  const protein = within(body?.protein, 40, 400)
  if (!calories || !protein) return { error: 'Set your calorie and protein targets first.' }
  const diet = (Array.isArray(body?.diet) ? body.diet : []).filter((d: string) => DIETS.includes(d))
  return {
    input: {
      calories, protein,
      carbs: within(body?.carbs, 0, 1000), fat: within(body?.fat, 0, 400),
      diet,
      likes: clean(body?.likes, 300), dislikes: clean(body?.dislikes, 300),
      cookTime: Object.hasOwn(COOK_TIMES, body?.cookTime) ? body.cookTime : 'normal',
    },
  }
}

export function buildMealMessage(input: any): string {
  return JSON.stringify({
    instruction: 'Write a 7-day meal plan, Monday to Sunday, for this person.',
    dailyTargets: { calories: input.calories, proteinGrams: input.protein, carbGrams: input.carbs, fatGrams: input.fat },
    diet: input.diet.length ? input.diet : ['no restrictions'],
    mealsPerDay: input.diet.includes('fasting') ? 'lunch, dinner and one snack' : 'breakfast, lunch, dinner and one snack',
    likes: input.likes || 'not given', dislikes: input.dislikes || 'none',
    cookingTime: COOK_TIMES[input.cookTime as keyof typeof COOK_TIMES],
  })
}

// 7 days in order, each with meals that have a title and numbers
export function isValidMealPlan(plan: any): boolean {
  if (!Array.isArray(plan?.days) || plan.days.length !== 7) return false
  return plan.days.every((d: any, i: number) => d?.day === DAYS[i] && Array.isArray(d.meals) && d.meals.length >= 2 &&
    d.meals.every((m: any) => m?.title && Number.isFinite(m.kcal) && Number.isFinite(m.protein) && Array.isArray(m.ingredients)))
}

// Each day's totals, from its meals
export function withTotals(plan: any) {
  for (const d of plan.days) {
    d.totals = d.meals.reduce((a: any, m: any) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  }
  return plan
}
