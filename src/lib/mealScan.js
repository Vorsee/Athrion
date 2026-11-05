// Editing what the AI photo scan found, before it's added: the amount (grams when the scan
// gave a weight, else servings) rescales calories and macros from what the scan first said.

const r1 = n => Math.round(n * 10) / 10

// The weight the scan estimated: its `grams`, else a weight written in the portion ("150 g")
export function scanGrams(f) {
  const g = Number(f.grams)
  if (g > 0) return Math.round(g)
  const m = String(f.portion || '').match(/(\d+(?:[.,]\d+)?)\s*(g|grams?|ml)\b/i)
  return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null
}

// Each found food with what the scan said kept as `base`, so changing the amount back and
// forth never drifts and an amount of 0 can be undone
export function withBase(foods = []) {
  return foods.map(f => {
    const grams = scanGrams(f)
    return {
      ...f,
      kcal: Math.round(+f.kcal || 0), protein: r1(+f.protein || 0), carbs: r1(+f.carbs || 0), fat: r1(+f.fat || 0),
      base: { unit: grams ? 'g' : 'serving', amount: grams || 1, portion: f.portion || '',
        kcal: +f.kcal || 0, protein: +f.protein || 0, carbs: +f.carbs || 0, fat: +f.fat || 0 },
      amount: grams || 1,
    }
  })
}

// A new amount: everything scaled from the base
export function rescale(f, amount) {
  const b = f.base
  const a = Math.max(0, parseFloat(amount) || 0)
  const k = b.amount > 0 ? a / b.amount : 0
  const portion = b.unit === 'g' ? `${a} g` : a === 1 ? b.portion : `${a} × ${b.portion || 'serving'}`
  return { ...f, amount: a, portion,
    kcal: Math.round(b.kcal * k), protein: r1(b.protein * k), carbs: r1(b.carbs * k), fat: r1(b.fat * k) }
}

// What gets saved to the day: the editing helpers left out
export function toEntry({ base, amount, grams, ...f }) {
  return f
}
