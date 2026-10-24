// Every icon used in src/ must be in the bundled subset, or it silently falls back
// to a network fetch from the Iconify API. Fix with: npm run icons
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import icons from '../../src/lib/icons.json'

const ROOT = join(__dirname, '../../src')
const files = []
const walk = dir => readdirSync(dir).forEach(f => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (/\.(js|jsx)$/.test(f)) files.push(p)
})
walk(ROOT)

describe('bundled icons', () => {
  it('include every mdi icon referenced in the app', () => {
    const missing = new Set()
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`]mdi:([a-z0-9-]+)['"`]/g))
      if (!icons.icons[m[1]]) missing.add(m[1])
    expect([...missing]).toEqual([])
  })
})
