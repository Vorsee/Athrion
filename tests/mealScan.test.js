import { describe, it, expect } from 'vitest'
import { scanGrams, withBase, rescale, toEntry } from '../src/lib/mealScan.js'

describe('editing a photo scan', () => {
  it('reads the weight from grams or the portion text', () => {
    expect(scanGrams({ grams: 160 })).toBe(160)
    expect(scanGrams({ portion: 'about 150 g' })).toBe(150)
    expect(scanGrams({ portion: '1 cup' })).toBe(null)
  })

  it('rescales from what the scan said, and back without drift', () => {
    const [rice] = withBase([{ name: 'Rice', kcal: 200, protein: 4, carbs: 44, fat: 0.4, portion: '1 cup', grams: 160 }])
    const more = rescale(rice, 240)
    expect(more).toMatchObject({ amount: 240, portion: '240 g', kcal: 300, protein: 6, carbs: 66, fat: 0.6 })
    expect(rescale(rescale(more, 0), 160)).toMatchObject({ kcal: 200, protein: 4, carbs: 44 })
  })

  it('uses servings when the scan gave no weight', () => {
    const [egg] = withBase([{ name: 'Egg', kcal: 70, protein: 6, carbs: 0, fat: 5, portion: '1 large' }])
    expect(egg.base.unit).toBe('serving')
    expect(rescale(egg, 2)).toMatchObject({ portion: '2 × 1 large', kcal: 140, protein: 12 })
  })

  it('saves only the food, not the editing helpers', () => {
    const [f] = withBase([{ name: 'Apple', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3, grams: 180 }])
    expect(toEntry(f)).toEqual({ name: 'Apple', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3 })
  })
})
