// Weights are stored in lb; the person's unit only changes display and input
import { describe, it, expect } from 'vitest'
import { fromLb, toLb, fmtWeight } from '../../src/lib/units.js'
import { suggestNext, findNewPRs } from '../../src/lib/progress.js'

describe('units', () => {
  it('converts both ways and round-trips kg', () => {
    expect(fromLb(220.46, 'kg')).toBe(100)
    expect(fromLb(135, 'lb')).toBe(135)
    expect(fromLb(toLb(77, 'kg'), 'kg')).toBe(77)
    expect(toLb('50', 'lb')).toBe(50)
    expect(fmtWeight(toLb(60, 'kg'), 'kg')).toBe('60 kg')
  })
  it('leaves empty values alone', () => {
    expect(fromLb(null, 'kg')).toBeNull()
    expect(fromLb('', 'kg')).toBe('')
  })

  describe('regression: fixed in the October 2026 review', () => {
    // Onboarding offered kg, but every screen after it was hardcoded to lb
    it('suggests kg jumps and words them in kg', () => {
      const sessions = [{ sets: [{ weight: toLb(60, 'kg'), reps: 12 }] }]
      const s = suggestNext(sessions, { minReps: 8, maxReps: 12, unit: 'kg' })
      expect(fromLb(s.weight, 'kg')).toBe(62.5)
      expect(s.reason).toContain('add 2.5 kg')
    })
    it('reports PRs in kg', () => {
      const history = [{ sets: [{ ex: 'Bench', weight: toLb(60, 'kg'), reps: 5 }] }]
      const [pr] = findNewPRs([{ ex: 'Bench', weight: toLb(65, 'kg'), reps: 5 }], history, 'kg')
      expect(pr.value).toBe('65 kg × 5')
    })
  })
})
