// Everyday foods for logging on Food without the AI: kcal, protein (p), carbs (c), fat (f)
// per 100 g (per 100 ml for drinks, `ml: true`), from standard nutrition tables (USDA
// FoodData Central, rounded). servings: [label, grams] for the common portions, so "1 cup"
// or "2 slices" can be picked instead of weighing. Cooked foods are as eaten.

export const FOOD_GROUPS = ['Grains', 'Protein', 'Dairy and eggs', 'Fruit', 'Vegetables', 'Beans', 'Nuts and seeds', 'Fats and sauces', 'Drinks', 'Snacks', 'Meals']

const F = (id, name, group, kcal, p, c, f, servings = [], extra = {}) => ({ id, name, group, kcal, p, c, f, servings, ...extra })

export const FOOD_LIBRARY = [
  // Grains
  F('rice-white', 'White rice, cooked', 'Grains', 130, 2.7, 28, 0.3, [['1 cup', 158], ['1/2 cup', 79]]),
  F('rice-brown', 'Brown rice, cooked', 'Grains', 123, 2.7, 26, 1, [['1 cup', 195], ['1/2 cup', 98]]),
  F('oats', 'Oats, dry', 'Grains', 379, 13, 68, 6.5, [['1/2 cup', 40]]),
  F('oatmeal', 'Oatmeal, made with water', 'Grains', 71, 2.5, 12, 1.5, [['1 bowl', 234]]),
  F('pasta', 'Pasta, cooked', 'Grains', 158, 5.8, 31, 0.9, [['1 cup', 140]]),
  F('pasta-ww', 'Whole-wheat pasta, cooked', 'Grains', 149, 6, 30, 1.7, [['1 cup', 140]]),
  F('noodles', 'Egg noodles, cooked', 'Grains', 138, 4.5, 25, 2.1, [['1 cup', 160]]),
  F('bread-white', 'White bread', 'Grains', 266, 8.9, 49, 3.3, [['1 slice', 28]]),
  F('bread-wg', 'Whole-grain bread', 'Grains', 247, 13, 41, 3.4, [['1 slice', 32]]),
  F('bagel', 'Bagel', 'Grains', 257, 10, 51, 1.6, [['1 bagel', 105]]),
  F('tortilla-flour', 'Flour tortilla', 'Grains', 306, 8.2, 50, 8, [['1 tortilla', 49]]),
  F('tortilla-corn', 'Corn tortilla', 'Grains', 218, 5.7, 45, 2.9, [['1 tortilla', 26]]),
  F('quinoa', 'Quinoa, cooked', 'Grains', 120, 4.4, 21, 1.9, [['1 cup', 185]]),
  F('couscous', 'Couscous, cooked', 'Grains', 112, 3.8, 23, 0.2, [['1 cup', 157]]),
  F('cornflakes', 'Corn flakes', 'Grains', 357, 7.5, 84, 0.4, [['1 cup', 28]]),
  F('granola', 'Granola', 'Grains', 471, 10, 64, 20, [['1/2 cup', 60]]),
  F('potato', 'Potato, boiled', 'Grains', 87, 1.9, 20, 0.1, [['1 medium', 173]]),
  F('sweet-potato', 'Sweet potato, baked', 'Grains', 90, 2, 21, 0.2, [['1 medium', 114]]),
  F('fries', 'French fries', 'Grains', 312, 3.4, 41, 15, [['1 medium serving', 117]]),

  // Protein
  F('chicken-breast', 'Chicken breast, cooked', 'Protein', 165, 31, 0, 3.6, [['1 breast', 170]]),
  F('chicken-thigh', 'Chicken thigh, cooked', 'Protein', 209, 26, 0, 11, [['1 thigh', 85]]),
  F('turkey', 'Turkey breast, cooked', 'Protein', 135, 30, 0, 1, []),
  F('beef-mince', 'Ground beef (85% lean), cooked', 'Protein', 250, 26, 0, 15, [['1 patty', 85]]),
  F('steak', 'Beef steak, cooked', 'Protein', 217, 26, 0, 12, [['1 steak', 170]]),
  F('pork-chop', 'Pork chop, cooked', 'Protein', 231, 26, 0, 14, [['1 chop', 145]]),
  F('bacon', 'Bacon, cooked', 'Protein', 541, 37, 1.4, 42, [['1 slice', 8]]),
  F('salmon', 'Salmon, cooked', 'Protein', 206, 22, 0, 12, [['1 fillet', 154]]),
  F('tuna', 'Tuna in water, drained', 'Protein', 116, 26, 0, 0.8, [['1 can', 113]]),
  F('cod', 'Cod, cooked', 'Protein', 105, 23, 0, 0.9, [['1 fillet', 180]]),
  F('shrimp', 'Shrimp, cooked', 'Protein', 99, 24, 0.2, 0.3, [['10 large', 60]]),
  F('tofu', 'Firm tofu', 'Protein', 144, 17, 3, 8.7, []),
  F('tempeh', 'Tempeh', 'Protein', 192, 20, 7.6, 11, []),
  F('whey', 'Whey protein powder', 'Protein', 400, 80, 8, 6, [['1 scoop', 30]]),

  // Dairy and eggs
  F('egg', 'Egg', 'Dairy and eggs', 143, 12.6, 0.7, 9.5, [['1 large egg', 50]]),
  F('egg-white', 'Egg white', 'Dairy and eggs', 52, 11, 0.7, 0.2, [['1 egg white', 33]]),
  F('milk-whole', 'Whole milk', 'Dairy and eggs', 61, 3.2, 4.8, 3.3, [['1 cup', 244]], { ml: true }),
  F('milk-semi', 'Milk, 2% / semi-skimmed', 'Dairy and eggs', 50, 3.3, 4.8, 2, [['1 cup', 244]], { ml: true }),
  F('milk-skim', 'Skim milk', 'Dairy and eggs', 34, 3.4, 5, 0.1, [['1 cup', 245]], { ml: true }),
  F('greek-0', 'Greek yogurt, 0% fat', 'Dairy and eggs', 59, 10, 3.6, 0.4, [['1 pot', 170]]),
  F('greek-full', 'Greek yogurt, full fat', 'Dairy and eggs', 97, 9, 4, 5, [['1 pot', 170]]),
  F('yogurt', 'Plain yogurt', 'Dairy and eggs', 61, 3.5, 4.7, 3.3, [['1 cup', 245]]),
  F('cottage', 'Cottage cheese', 'Dairy and eggs', 98, 11, 3.4, 4.3, [['1/2 cup', 113]]),
  F('cheddar', 'Cheddar cheese', 'Dairy and eggs', 403, 25, 1.3, 33, [['1 slice', 28]]),
  F('mozzarella', 'Mozzarella', 'Dairy and eggs', 300, 22, 2.2, 22, [['1 oz', 28]]),
  F('parmesan', 'Parmesan', 'Dairy and eggs', 392, 36, 3.2, 26, [['1 tbsp grated', 5]]),
  F('cream-cheese', 'Cream cheese', 'Dairy and eggs', 342, 5.9, 4.1, 34, [['1 tbsp', 15]]),
  F('butter', 'Butter', 'Dairy and eggs', 717, 0.9, 0.1, 81, [['1 tbsp', 14], ['1 tsp', 5]]),

  // Fruit
  F('apple', 'Apple', 'Fruit', 52, 0.3, 14, 0.2, [['1 medium', 182]]),
  F('banana', 'Banana', 'Fruit', 89, 1.1, 23, 0.3, [['1 medium', 118]]),
  F('orange', 'Orange', 'Fruit', 47, 0.9, 12, 0.1, [['1 medium', 131]]),
  F('pear', 'Pear', 'Fruit', 57, 0.4, 15, 0.1, [['1 medium', 178]]),
  F('strawberries', 'Strawberries', 'Fruit', 32, 0.7, 7.7, 0.3, [['1 cup', 152]]),
  F('blueberries', 'Blueberries', 'Fruit', 57, 0.7, 14.5, 0.3, [['1 cup', 148]]),
  F('grapes', 'Grapes', 'Fruit', 69, 0.7, 18, 0.2, [['1 cup', 151]]),
  F('mango', 'Mango', 'Fruit', 60, 0.8, 15, 0.4, [['1 cup', 165]]),
  F('pineapple', 'Pineapple', 'Fruit', 50, 0.5, 13, 0.1, [['1 cup', 165]]),
  F('watermelon', 'Watermelon', 'Fruit', 30, 0.6, 7.6, 0.2, [['1 cup', 152]]),
  F('avocado', 'Avocado', 'Fruit', 160, 2, 8.5, 15, [['1/2 avocado', 75]]),
  F('dates', 'Dates', 'Fruit', 277, 1.8, 75, 0.2, [['1 date', 24]]),
  F('raisins', 'Raisins', 'Fruit', 299, 3.1, 79, 0.5, [['1 small box', 43]]),

  // Vegetables
  F('broccoli', 'Broccoli', 'Vegetables', 34, 2.8, 6.6, 0.4, [['1 cup', 91]]),
  F('spinach', 'Spinach', 'Vegetables', 23, 2.9, 3.6, 0.4, [['1 cup', 30]]),
  F('carrot', 'Carrot', 'Vegetables', 41, 0.9, 9.6, 0.2, [['1 medium', 61]]),
  F('tomato', 'Tomato', 'Vegetables', 18, 0.9, 3.9, 0.2, [['1 medium', 123]]),
  F('cucumber', 'Cucumber', 'Vegetables', 15, 0.7, 3.6, 0.1, [['1/2 cucumber', 150]]),
  F('pepper', 'Bell pepper', 'Vegetables', 31, 1, 6, 0.3, [['1 medium', 119]]),
  F('onion', 'Onion', 'Vegetables', 40, 1.1, 9.3, 0.1, [['1 medium', 110]]),
  F('salad', 'Salad leaves', 'Vegetables', 17, 1.4, 3, 0.2, [['1 bowl', 50]]),
  F('green-beans', 'Green beans', 'Vegetables', 31, 1.8, 7, 0.2, [['1 cup', 100]]),
  F('corn', 'Sweetcorn, cooked', 'Vegetables', 96, 3.4, 21, 1.5, [['1 cup', 145]]),
  F('peas', 'Peas', 'Vegetables', 81, 5.4, 14.5, 0.4, [['1 cup', 145]]),
  F('mushrooms', 'Mushrooms', 'Vegetables', 22, 3.1, 3.3, 0.3, [['1 cup', 70]]),
  F('zucchini', 'Zucchini', 'Vegetables', 17, 1.2, 3.1, 0.3, [['1 medium', 196]]),
  F('cauliflower', 'Cauliflower', 'Vegetables', 25, 1.9, 5, 0.3, [['1 cup', 107]]),
  F('mixed-veg', 'Mixed vegetables', 'Vegetables', 35, 2, 7, 0.3, [['1 cup', 150]]),

  // Beans
  F('lentils', 'Lentils, cooked', 'Beans', 116, 9, 20, 0.4, [['1 cup', 198]]),
  F('chickpeas', 'Chickpeas, cooked', 'Beans', 164, 8.9, 27, 2.6, [['1 cup', 164]]),
  F('black-beans', 'Black beans, cooked', 'Beans', 132, 8.9, 24, 0.5, [['1 cup', 172]]),
  F('kidney-beans', 'Kidney beans, cooked', 'Beans', 127, 8.7, 23, 0.5, [['1 cup', 177]]),
  F('baked-beans', 'Baked beans', 'Beans', 94, 4.8, 21, 0.4, [['1/2 cup', 127]]),
  F('edamame', 'Edamame', 'Beans', 121, 12, 8.9, 5.2, [['1 cup', 155]]),
  F('hummus', 'Hummus', 'Beans', 166, 7.9, 14, 9.6, [['2 tbsp', 30]]),

  // Nuts and seeds
  F('almonds', 'Almonds', 'Nuts and seeds', 579, 21, 22, 50, [['1 handful', 28]]),
  F('peanuts', 'Peanuts', 'Nuts and seeds', 567, 26, 16, 49, [['1 handful', 28]]),
  F('walnuts', 'Walnuts', 'Nuts and seeds', 654, 15, 14, 65, [['1 handful', 28]]),
  F('cashews', 'Cashews', 'Nuts and seeds', 553, 18, 30, 44, [['1 handful', 28]]),
  F('peanut-butter', 'Peanut butter', 'Nuts and seeds', 588, 25, 20, 50, [['1 tbsp', 16]]),
  F('chia', 'Chia seeds', 'Nuts and seeds', 486, 16.5, 42, 31, [['1 tbsp', 12]]),
  F('sunflower', 'Sunflower seeds', 'Nuts and seeds', 584, 21, 20, 51.5, [['1 handful', 28]]),

  // Fats and sauces
  F('olive-oil', 'Olive oil', 'Fats and sauces', 884, 0, 0, 100, [['1 tbsp', 14], ['1 tsp', 5]]),
  F('veg-oil', 'Vegetable oil', 'Fats and sauces', 884, 0, 0, 100, [['1 tbsp', 14], ['1 tsp', 5]]),
  F('mayo', 'Mayonnaise', 'Fats and sauces', 680, 1, 0.6, 75, [['1 tbsp', 14]]),
  F('ketchup', 'Ketchup', 'Fats and sauces', 101, 1, 27, 0.1, [['1 tbsp', 17]]),
  F('honey', 'Honey', 'Fats and sauces', 304, 0.3, 82, 0, [['1 tbsp', 21], ['1 tsp', 7]]),
  F('sugar', 'Sugar', 'Fats and sauces', 387, 0, 100, 0, [['1 tsp', 4]]),
  F('jam', 'Jam', 'Fats and sauces', 278, 0.4, 69, 0.1, [['1 tbsp', 20]]),

  // Drinks
  F('orange-juice', 'Orange juice', 'Drinks', 45, 0.7, 10.4, 0.2, [['1 glass', 248]], { ml: true }),
  F('cola', 'Cola', 'Drinks', 42, 0, 10.6, 0, [['1 can', 330]], { ml: true }),
  F('beer', 'Beer', 'Drinks', 43, 0.5, 3.6, 0, [['1 bottle', 330]], { ml: true }),
  F('wine', 'Red wine', 'Drinks', 85, 0.1, 2.6, 0, [['1 glass', 150]], { ml: true }),
  F('coffee', 'Coffee, black', 'Drinks', 2, 0.3, 0, 0, [['1 cup', 240]], { ml: true }),
  F('soy-milk', 'Soy milk', 'Drinks', 43, 3.3, 2.5, 1.8, [['1 cup', 240]], { ml: true }),
  F('almond-milk', 'Almond milk, unsweetened', 'Drinks', 15, 0.6, 0.3, 1.2, [['1 cup', 240]], { ml: true }),

  // Snacks
  F('dark-choc', 'Dark chocolate (70-85%)', 'Snacks', 598, 7.8, 46, 43, [['1 square', 10]]),
  F('milk-choc', 'Milk chocolate', 'Snacks', 535, 7.7, 59, 30, [['1 bar', 43]]),
  F('chips', 'Potato chips', 'Snacks', 536, 7, 53, 35, [['1 small bag', 28]]),
  F('popcorn', 'Popcorn, air-popped', 'Snacks', 387, 13, 78, 4.5, [['1 cup', 8]]),
  F('ice-cream', 'Vanilla ice cream', 'Snacks', 207, 3.5, 24, 11, [['1/2 cup', 66]]),
  F('cookie', 'Chocolate chip cookie', 'Snacks', 488, 5.4, 65, 24, [['1 cookie', 15]]),
  F('rice-cake', 'Rice cake', 'Snacks', 387, 8.2, 82, 2.8, [['1 rice cake', 9]]),
  F('croissant', 'Croissant', 'Snacks', 406, 8.2, 46, 21, [['1 croissant', 57]]),

  // Meals
  F('pizza', 'Cheese pizza', 'Meals', 266, 11, 33, 10, [['1 slice', 107]]),
  F('cheeseburger', 'Cheeseburger', 'Meals', 265, 15, 25, 12, [['1 burger', 120]]),
]

const byId = Object.fromEntries(FOOD_LIBRARY.map(x => [x.id, x]))
export const libraryFood = id => byId[id] ?? null

const r1 = n => Math.round(n * 10) / 10
// A logged amount of a library food, as a food log entry (calories rounded, macros to 0.1 g).
// unit: 'g' (or ml) with amount in grams, or a serving's index with amount the number of them.
export function portion(food, amount, unit = 'g') {
  const n = Math.max(0, Number(amount) || 0)
  const serving = unit === 'g' ? null : food.servings[unit]
  const grams = serving ? n * serving[1] : n
  const k = grams / 100
  const size = serving ? `${n === 1 ? '' : `${n} × `}${serving[0]}` : `${Math.round(grams)} ${food.ml ? 'ml' : 'g'}`
  return {
    grams,
    entry: { name: `${food.name}, ${size}`, kcal: Math.round(food.kcal * k), protein: r1(food.p * k), carbs: r1(food.c * k), fat: r1(food.f * k) },
  }
}

// Search by any word of the name ("rice" finds white and brown rice), within a group
export function searchFoods(query, group = 'All') {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return FOOD_LIBRARY.filter(x => (group === 'All' || x.group === group) && words.every(w => x.name.toLowerCase().includes(w)))
}

// The last foods picked from the library, on this device, newest first
const RECENT_KEY = 'athrion_recent_foods'
export function recentFoods() {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).map(libraryFood).filter(Boolean) } catch { return [] }
}
export function rememberFood(id) {
  try {
    const ids = [id, ...(JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).filter(x => x !== id)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids))
  } catch { /* only a convenience */ }
}
