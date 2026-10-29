// A suggested day of eating that fits someone's targets: everyday foods, sized in grams.
// Each meal is a template whose protein foods are sized to the meal's share of protein and
// whose carb and fat foods then fill its share of calories. Values per 100 g (USDA, rounded).
// Nothing here is medical advice; it is a starting point the person can log and change.

// kcal, protein, carbs, fat per 100 g. diet: what it is not suitable for.
export const FOODS = {
  oats:        { name: 'Oats',                 kcal: 379, p: 13,  c: 68, f: 6.5, step: 10 },
  greekYogurt: { name: 'Greek yogurt (0%)',    kcal: 59,  p: 10,  c: 3.6, f: 0.4, step: 25, not: ['vegan'] },
  soyYogurt:   { name: 'Soy yogurt',           kcal: 66,  p: 4,   c: 6,  f: 3.5, step: 25 },
  berries:     { name: 'Berries',              kcal: 50,  p: 0.7, c: 12, f: 0.3, step: 25 },
  banana:      { name: 'Banana',               kcal: 89,  p: 1.1, c: 23, f: 0.3, step: 10 },
  peanutButter:{ name: 'Peanut butter',        kcal: 588, p: 25,  c: 20, f: 50,  step: 5 },
  eggs:        { name: 'Eggs',                 kcal: 143, p: 13,  c: 0.7, f: 9.5, step: 50, unit: 'egg', per: 50, not: ['vegan'] },
  bread:       { name: 'Whole-grain bread',    kcal: 247, p: 13,  c: 41, f: 3.4, step: 10 },
  avocado:     { name: 'Avocado',              kcal: 160, p: 2,   c: 9,  f: 15,  step: 10 },
  tofu:        { name: 'Firm tofu',            kcal: 144, p: 17,  c: 3,  f: 8.7, step: 25 },
  chicken:     { name: 'Chicken breast',       kcal: 165, p: 31,  c: 0,  f: 3.6, step: 25, not: ['vegan', 'vegetarian'] },
  salmon:      { name: 'Salmon',               kcal: 208, p: 20,  c: 0,  f: 13,  step: 25, not: ['vegan', 'vegetarian'] },
  beef:        { name: 'Lean beef (5% fat)',   kcal: 137, p: 21,  c: 0,  f: 5,   step: 25, not: ['vegan', 'vegetarian'] },
  tuna:        { name: 'Tuna in water',        kcal: 116, p: 26,  c: 0,  f: 1,   step: 25, not: ['vegan', 'vegetarian'] },
  lentils:     { name: 'Cooked lentils',       kcal: 116, p: 9,   c: 20, f: 0.4, step: 25 },
  chickpeas:   { name: 'Cooked chickpeas',     kcal: 164, p: 8.9, c: 27, f: 2.6, step: 25 },
  tempeh:      { name: 'Tempeh',               kcal: 192, p: 20,  c: 7.6, f: 11, step: 25 },
  rice:        { name: 'Cooked rice',          kcal: 130, p: 2.7, c: 28, f: 0.3, step: 25 },
  quinoa:      { name: 'Cooked quinoa',        kcal: 120, p: 4.4, c: 21, f: 1.9, step: 25 },
  potatoes:    { name: 'Potatoes',             kcal: 87,  p: 1.9, c: 20, f: 0.1, step: 25 },
  pasta:       { name: 'Cooked whole-wheat pasta', kcal: 149, p: 6, c: 30, f: 1.7, step: 25 },
  veg:         { name: 'Mixed vegetables',     kcal: 35,  p: 2,   c: 7,  f: 0.3, step: 25 },
  salad:       { name: 'Salad leaves',         kcal: 17,  p: 1.4, c: 3,  f: 0.2, step: 25 },
  oliveOil:    { name: 'Olive oil',            kcal: 884, p: 0,   c: 0,  f: 100, step: 5 },
  almonds:     { name: 'Almonds',              kcal: 579, p: 21,  c: 22, f: 50,  step: 5 },
  apple:       { name: 'Apple',                kcal: 52,  p: 0.3, c: 14, f: 0.2, step: 10 },
  cottage:     { name: 'Cottage cheese',       kcal: 98,  p: 11,  c: 3.4, f: 4.3, step: 25, not: ['vegan'] },
  hummus:      { name: 'Hummus',               kcal: 166, p: 7.9, c: 14, f: 9.6, step: 10 },
  milk:        { name: 'Milk (semi-skimmed)',  kcal: 50,  p: 3.4, c: 4.8, f: 2,  step: 50, unit: 'ml', not: ['vegan'] },
  soyMilk:     { name: 'Soy milk',             kcal: 43,  p: 3.3, c: 2.5, f: 1.8, step: 50, unit: 'ml' },
}

// role: protein (sized to protein), base (carbs, sized to fill), fat (sized to fill), fixed (as given)
export const MEALS = {
  breakfast: [
    { title: 'Oats with yogurt and berries', items: [['greekYogurt', 'protein', 200], ['oats', 'base', 60], ['berries', 'fixed', 100], ['peanutButter', 'fat', 10]] },
    { title: 'Eggs on toast with avocado',   items: [['eggs', 'protein', 150], ['bread', 'base', 70], ['avocado', 'fat', 40], ['salad', 'fixed', 50]] },
    { title: 'Tofu scramble on toast',       items: [['tofu', 'protein', 200], ['bread', 'base', 70], ['avocado', 'fat', 30], ['veg', 'fixed', 75]] },
    { title: 'Soy yogurt, oats and banana',  items: [['soyYogurt', 'protein', 200], ['oats', 'base', 50], ['banana', 'fixed', 100], ['almonds', 'fat', 15]] },
  ],
  lunch: [
    { title: 'Chicken, rice and vegetables', items: [['chicken', 'protein', 150], ['rice', 'base', 200], ['veg', 'fixed', 150], ['oliveOil', 'fat', 10]] },
    { title: 'Tuna and potato salad',        items: [['tuna', 'protein', 130], ['potatoes', 'base', 250], ['salad', 'fixed', 75], ['oliveOil', 'fat', 10]] },
    { title: 'Lentil and quinoa bowl',       items: [['lentils', 'protein', 250], ['quinoa', 'base', 150], ['veg', 'fixed', 150], ['oliveOil', 'fat', 10]] },
    { title: 'Chickpea and hummus wrap bowl', items: [['chickpeas', 'protein', 200], ['bread', 'base', 60], ['salad', 'fixed', 75], ['hummus', 'fat', 50]] },
  ],
  dinner: [
    { title: 'Salmon, potatoes and greens',  items: [['salmon', 'protein', 150], ['potatoes', 'base', 250], ['veg', 'fixed', 150], ['oliveOil', 'fat', 5]] },
    { title: 'Beef and pasta with vegetables', items: [['beef', 'protein', 150], ['pasta', 'base', 200], ['veg', 'fixed', 150], ['oliveOil', 'fat', 5]] },
    { title: 'Tempeh stir-fry with rice',    items: [['tempeh', 'protein', 150], ['rice', 'base', 200], ['veg', 'fixed', 200], ['oliveOil', 'fat', 10]] },
    { title: 'Chicken and quinoa plate',     items: [['chicken', 'protein', 150], ['quinoa', 'base', 200], ['veg', 'fixed', 150], ['avocado', 'fat', 50]] },
  ],
  snack: [
    { title: 'Cottage cheese and apple',     items: [['cottage', 'protein', 150], ['apple', 'base', 150]] },
    { title: 'Greek yogurt and almonds',     items: [['greekYogurt', 'protein', 170], ['almonds', 'fat', 15], ['berries', 'fixed', 50]] },
    { title: 'Soy milk, banana and almonds', items: [['soyMilk', 'protein', 300], ['banana', 'base', 100], ['almonds', 'fat', 15]] },
    { title: 'Hummus and vegetables',        items: [['hummus', 'protein', 80], ['veg', 'fixed', 150], ['bread', 'base', 30]] },
  ],
}

// Shares of the day's calories and protein per meal. Fasting: two meals and a snack.
export function mealSlots(diet = []) {
  return diet.includes('fasting')
    ? [['lunch', 'First meal', 0.45], ['dinner', 'Last meal', 0.45], ['snack', 'Snack', 0.10]]
    : [['breakfast', 'Breakfast', 0.25], ['lunch', 'Lunch', 0.35], ['dinner', 'Dinner', 0.30], ['snack', 'Snack', 0.10]]
}

const suits = (template, diet) => template.items.every(([id]) => !(FOODS[id].not ?? []).some(d => diet.includes(d)))
export const optionsFor = (meal, diet = []) => MEALS[meal].filter(t => suits(t, diet))

const macro = (id, g) => {
  const f = FOODS[id], k = g / 100
  return { kcal: f.kcal * k, protein: f.p * k, carbs: f.c * k, fat: f.f * k }
}
const roundTo = (g, step) => Math.max(step, Math.round(g / step) * step)

// One template sized to { kcal, protein } → { title, items: [{ id, name, grams, unit, kcal, protein, carbs, fat }], totals }
export function sizeMeal(template, { kcal, protein }) {
  const grams = Object.fromEntries(template.items.map(([id, , g]) => [id, g]))
  const by = role => template.items.filter(i => i[1] === role).map(i => i[0])
  const sum = (ids, k) => ids.reduce((a, id) => a + macro(id, grams[id])[k], 0)

  // Protein foods to the meal's protein (from the protein the other foods already bring)
  const pIds = by('protein')
  const otherP = sum(template.items.map(i => i[0]).filter(id => !pIds.includes(id)), 'protein')
  const baseP = sum(pIds, 'protein')
  if (baseP > 0) {
    const k = Math.min(1.8, Math.max(0.4, (protein - otherP) / baseP)) // past that, a portion stops being a meal
    for (const id of pIds) grams[id] *= k
  }
  // Carbs and fats fill the calories that are left
  const flex = [...by('base'), ...by('fat')]
  const fixedKcal = sum(template.items.map(i => i[0]).filter(id => !flex.includes(id)), 'kcal')
  const flexKcal = sum(flex, 'kcal')
  if (flexKcal > 0) {
    const k = Math.min(3, Math.max(0.3, (kcal - fixedKcal) / flexKcal))
    for (const id of flex) grams[id] *= k
  }

  // Plant proteins bring carbs too: if the meal still runs over, shrink everything but the fixed
  // foods to fit (calories come first; protein may then fall a little short)
  const fixedOnly = sum(by('fixed'), 'kcal')
  const all = sum(template.items.map(i => i[0]), 'kcal')
  if (all > kcal * 1.05 && all > fixedOnly) {
    const k = Math.max(0.3, (kcal - fixedOnly) / (all - fixedOnly))
    for (const [id, role] of template.items) if (role !== 'fixed') grams[id] *= k
  }

  const items = template.items.map(([id]) => {
    const f = FOODS[id]
    const g = roundTo(grams[id], f.step)
    const m = macro(id, g)
    return { id, name: f.name, grams: g, unit: f.unit ?? 'g', per: f.per, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])) }
  })
  const totals = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  return { title: template.title, items, totals }
}

// "150 g", "250 ml", or "3 eggs (150 g)"
export function amountText(item) {
  if (item.per) { const n = Math.round(item.grams / item.per); return `${n} ${item.unit}${n === 1 ? '' : 's'} (${item.grams} g)` }
  return `${item.grams} ${item.unit}`
}

/**
 * A day for these targets. picks: { [meal]: index } chooses among the options (wraps around).
 * @returns [{ meal, label, options, index, ...sizeMeal }] and totals
 */
export function buildDay({ calories, protein, diet = [], picks = {} }) {
  const meals = mealSlots(diet).map(([meal, label, share]) => {
    const options = optionsFor(meal, diet)
    const index = ((picks[meal] ?? 0) % options.length + options.length) % options.length
    return { meal, label, share, options: options.length, index, ...sizeMeal(options[index], { kcal: calories * share, protein: protein * share }) }
  })
  const totals = meals.reduce((a, m) => ({ kcal: a.kcal + m.totals.kcal, protein: a.protein + m.totals.protein, carbs: a.carbs + m.totals.carbs, fat: a.fat + m.totals.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  return { meals, totals }
}
