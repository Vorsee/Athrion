// Bundles every mdi:* icon used in src/ into src/lib/icons.json, so icons render
// instantly and offline instead of being fetched from api.iconify.design at runtime.
// Run after adding an icon: npm run icons
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { icons as mdi } from '@iconify-json/mdi'

const files = []
const walk = dir => readdirSync(dir).forEach(f => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (/\.(js|jsx)$/.test(f)) files.push(p)
})
walk('src')

const used = new Set()
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`]mdi:([a-z0-9-]+)['"`]/g)) used.add(m[1])

const subset = { prefix: 'mdi', width: mdi.width, height: mdi.height, icons: {} }
for (const name of [...used].sort()) {
  const icon = mdi.icons[name] ?? mdi.icons[mdi.aliases?.[name]?.parent]
  if (!icon) throw new Error(`Unknown icon mdi:${name}`)
  subset.icons[name] = icon
}
writeFileSync('src/lib/icons.json', JSON.stringify(subset))
console.log(`Bundled ${used.size} icons into src/lib/icons.json`)
