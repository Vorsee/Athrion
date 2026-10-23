import { describe, it, expect, beforeEach, vi } from 'vitest'

// Small slices of both libraries, in their real formats
const FREE = [
  { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'barbell', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], instructions: ['Lie down.'], category: 'strength', images: ['Barbell_Bench_Press_-_Medium_Grip/0.jpg', 'Barbell_Bench_Press_-_Medium_Grip/1.jpg'] },
  { id: 'Dumbbell_Bench_Press', name: 'Dumbbell Bench Press', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'dumbbell', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], instructions: ['Press.'], category: 'strength', images: ['a/0.jpg', 'a/1.jpg'] },
  { id: 'Pushups', name: 'Pushups', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'body only', primaryMuscles: ['chest'], secondaryMuscles: [], instructions: ['Push.'], category: 'strength', images: ['p/0.jpg'] },
  { id: 'Clean', name: 'Power Clean', force: 'pull', level: 'intermediate', mechanic: 'compound', equipment: 'barbell', primaryMuscles: ['chest'], secondaryMuscles: [], instructions: [], category: 'strength', images: [] },
  { id: 'Face_Pull', name: 'Face Pull', force: 'pull', level: 'intermediate', mechanic: 'compound', equipment: 'cable', primaryMuscles: ['shoulders'], secondaryMuscles: ['middle back'], instructions: ['Pull.'], category: 'strength', images: ['f/0.jpg', 'f/1.jpg'] },
  { id: 'Plank', name: 'Plank', force: 'static', level: 'beginner', mechanic: 'isolation', equipment: 'body only', primaryMuscles: ['abdominals'], secondaryMuscles: [], instructions: ['Hold.'], category: 'strength', images: ['pl/0.jpg'] },
]
const EDB = [
  { id: 'EDB1', name: 'barbell bench press', target: ['pectorals'], secondary: ['triceps'], equipment: 'barbell', bodyPart: 'chest', instructions: ['Settle onto a bench.'] },
  { id: 'EDB2', name: 'push-up', target: ['pectorals'], secondary: [], equipment: 'body weight', bodyPart: 'chest', instructions: ['Push.'] },
  { id: 'EDB3', name: 'push-up (bosu ball)', target: ['pectorals'], secondary: [], equipment: 'bosu ball', bodyPart: 'chest', instructions: [] },
  { id: 'EDB4', name: 'barbell full squat', target: ['glutes'], secondary: ['quads'], equipment: 'barbell', bodyPart: 'upper legs', instructions: [] },
  { id: 'EDB5', name: 'potty squat', target: ['glutes'], secondary: [], equipment: 'body weight', bodyPart: 'upper legs', instructions: [] },
  { id: 'EDB6', name: 'weighted front plank', target: ['abs'], secondary: [], equipment: 'weighted', bodyPart: 'waist', instructions: [] },
]

let fetchMock
async function load({ edbOk = true, freeOk = true } = {}) {
  vi.resetModules()
  fetchMock = vi.fn(async url => {
    if (String(url) === '/exercisedb-index.json') return edbOk ? { ok: true, json: async () => EDB } : { ok: false, status: 503 }
    return freeOk ? { ok: true, json: async () => FREE } : { ok: false, status: 500 }
  })
  vi.stubGlobal('fetch', fetchMock)
  return import('../../src/lib/exerciseDb.js')
}

beforeEach(() => vi.unstubAllGlobals())

describe('findDemo', () => {
  it('prefers the animated ExerciseDB match and builds its GIF url', async () => {
    const m = await load()
    const d = await m.findDemo('Bench Press')
    expect(d.name).toBe('Barbell Bench Press')
    expect(d.gif).toBe('https://static.exercisedb.dev/media/EDB1.gif')
    expect(d.primaryMuscles).toEqual(['pectorals'])
  })
  it('uses aliases to avoid wrong fuzzy matches', async () => {
    const m = await load()
    expect((await m.findDemo('Push-Up')).name).toBe('Push-Up')
    expect((await m.findDemo('Squat')).name).toBe('Barbell Full Squat')
  })
  it('falls back to free-exercise-db photos when ExerciseDB has no match', async () => {
    const m = await load()
    const d = await m.findDemo('Face Pull')
    expect(d.gif).toBeUndefined()
    expect(m.imageUrl(d.images[0])).toMatch(/free-exercise-db@[0-9a-f]{40}\/exercises\/f\/0\.jpg$/)
  })
  it('does not accept a weak fuzzy match (Plank is not Weighted Front Plank)', async () => {
    const m = await load()
    expect((await m.findDemo('Plank')).name).toBe('Plank')
  })
  it('returns null when nothing is close', async () => {
    const m = await load()
    expect(await m.findDemo('Underwater Basket Weaving')).toBeNull()
  })
  it('still works when the GIF index fails to load', async () => {
    const m = await load({ edbOk: false })
    expect((await m.findDemo('Bench Press')).name).toBe('Barbell Bench Press - Medium Grip')
  })
  it('caches results and loads each library once', async () => {
    const m = await load()
    await m.findDemo('Bench Press'); await m.findDemo('Bench Press'); await m.findDemo('Face Pull')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('throws a readable error when the photo library is down and there is no GIF', async () => {
    const m = await load({ edbOk: false, freeOk: false })
    await expect(m.findDemo('Face Pull')).rejects.toThrow('Exercise library unavailable (500)')
  })
})

describe('tokenize', () => {
  it('normalises plurals, synonyms and push/pull-ups', async () => {
    const m = await load()
    expect(m.tokenize('DB Pull-Ups')).toEqual(['dumbbell', 'pullup'])
    expect(m.tokenize('Heavy Squats (paused)', { query: true })).toEqual(['squat'])
  })
})

describe('findAlternatives', () => {
  it('suggests same-muscle exercises and skips Olympic lifts', async () => {
    const m = await load()
    const alts = await m.findAlternatives('Barbell Bench Press')
    const names = alts.map(a => a.name)
    expect(names).toContain('Dumbbell Bench Press')
    expect(names).not.toContain('Power Clean')
    expect(names).not.toContain('Barbell Bench Press - Medium Grip')
  })
  it('returns nothing for unknown exercises', async () => {
    const m = await load()
    expect(await m.findAlternatives('Nonexistent Move')).toEqual([])
  })
})

describe('youtubeSearchUrl', () => {
  it('encodes the exercise name', async () => {
    const m = await load()
    expect(m.youtubeSearchUrl('Push & Pull')).toContain('how%20to%20do%20Push%20%26%20Pull')
  })
})
