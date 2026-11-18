import { useSyncExternalStore } from 'react'

// Colour schemes. Dark and Light are free; the rest come with Pro. Each one is a set of
// CSS token overrides in src/index.css (`.theme-<id>`); `base` is the free theme it builds
// on: light-based ones also take `.light` (its remaps for older hex classes), and it is the
// theme shown when Pro ends. The choice stays saved on this device, so it comes back with Pro.
export const THEMES = [
  { id: 'dark',      label: 'Dark',      base: 'dark' },
  { id: 'light',     label: 'Light',     base: 'light' },
  { id: 'blossom',   label: 'Blossom',   base: 'light', pro: true },
  { id: 'blue',      label: 'Blue',      base: 'dark',  pro: true },
  { id: 'christmas', label: 'Christmas', base: 'dark',  pro: true, note: 'Snow and lights' },
]

const BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]))
const KEY = 'athrion_theme'

export const isProTheme = id => !!BY_ID[id]?.pro

export function readTheme() {
  try { const t = localStorage.getItem(KEY); return BY_ID[t] ? t : 'dark' } catch { return 'dark' }
}

export function saveTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
}

// What actually shows: a Pro theme without Pro falls back to its base. While the Pro state
// is still loading (`isPro` undefined) the saved theme shows, so Pro users see no flash.
export function shownTheme(id, isPro) {
  const t = BY_ID[id] ?? BY_ID.dark
  return t.pro && isPro === false ? t.base : t.id
}

// Classes for <html> and the app root
export function themeClasses(id) {
  const t = BY_ID[id] ?? BY_ID.dark
  return [t.base === 'light' ? 'light' : '', t.id !== t.base ? `theme-${t.id}` : ''].filter(Boolean).join(' ')
}

// The theme on screen, for parts that draw extras (Christmas lights and snow)
let active = 'dark'
const listeners = new Set()

export function applyTheme(id) {
  const root = document.documentElement
  for (const t of THEMES) root.classList.remove(`theme-${t.id}`)
  root.classList.remove('light')
  for (const c of themeClasses(id).split(' ').filter(Boolean)) root.classList.add(c)
  if (id !== active) { active = id; listeners.forEach(l => l()) }
}

export function useActiveTheme() {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l) }, () => active)
}
