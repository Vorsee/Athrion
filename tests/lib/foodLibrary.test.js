import { describe, it, expect, beforeEach } from 'vitest'
import { FOOD_LIBRARY, FOOD_GROUPS, libraryFood, portion, searchFoods, recentFoods, rememberFood } from '../../src/lib/foodLibrary.js'

describe('food library', () => {
  beforeEach(() => localStorage.clear())
  it('has sane entries: unique ids, known groups, calories that match the macros', () => {
    expect(new Set(FOOD_LIBRARY.map(x => x.id)).size).toBe(FOOD_LIBRARY.length)
    for (const x of FOOD_LIBRARY) {
      expect(FOOD_GROUPS).toContain(x.group)
      // 4 / 4 / 9 kcal per gram, within a margin for fibre and alcohol
      const est = x.p * 4 + x.c * 4 + x.f * 9
      if (!['beer', 'wine'].includes(x.id)) expect(Math.abs(est - x.kcal)).toBeLessThanOrEqual(Math.max(20, x.kcal * 0.15))
    }
  })
  it('counts a portion in servings or grams', () => {
    const rice = libraryFood('rice-white')
    expect(portion(rice, 2, 0)).toEqual({ grams: 316, entry: { name: 'White rice, cooked, 2 × 1 cup', kcal: 411, protein: 8.5, carbs: 88.5, fat: 0.9 } })
    expect(portion(rice, 150).entry).toMatchObject({ name: 'White rice, cooked, 150 g', kcal: 195, carbs: 42 })
    expect(portion(libraryFood('egg'), 1, 0).entry.name).toBe('Egg, 1 large egg')
    expect(portion(libraryFood('milk-whole'), 200).entry.name).toBe('Whole milk, 200 ml')
  })
  it('finds foods by any word, within a group, and remembers recent picks', () => {
    expect(searchFoods('rice').map(x => x.id)).toEqual(expect.arrayContaining(['rice-white', 'rice-brown', 'rice-cake']))
    expect(searchFoods('rice', 'Snacks').map(x => x.id)).toEqual(['rice-cake'])
    rememberFood('banana'); rememberFood('oats'); rememberFood('banana')
    expect(recentFoods().map(x => x.id)).toEqual(['banana', 'oats'])
  })
})
