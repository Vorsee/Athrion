// App shell state shared by the header, the tab bar and the pages:
// - pushed sub-screens register a back handler, mirrored into browser history,
//   so the header chevron and the phone's back gesture do the same thing
// - a page can put one action in the header (Food: Log food, Progress: Log weight)
// - an active workout turns on focus mode, which hides the header and the tab bar
// UI state only; nothing here is saved.
import { useEffect, useRef, useSyncExternalStore } from 'react'

const hasHistory = typeof window !== 'undefined' && !!window.history

// ── History, one operation at a time ────────────────────────────────────────
// history.go() is async. Pushes made while it's in flight wait for its popstate,
// or they would land on the entry that is about to be left.
let pending = 0
let queued = []
let pageListener = null
let listening = false

function run(op) {
  if (!hasHistory) return
  if (pending) queued.push(op)
  else op()
}

function ensureListener() {
  if (listening || !hasHistory) return
  listening = true
  window.addEventListener('popstate', onPopState)
}

function onPopState(e) {
  if (pending) {
    pending--
    if (!pending) { const ops = queued; queued = []; ops.forEach(op => op()) }
    return
  }
  const top = stack.pop()
  if (top) { top.popped = true; emit(); top.onBack.current?.(); return }
  pageListener?.(e.state)
}

// Step back n entries without treating it as the person pressing back
export function silentBack(n = 1) {
  if (!hasHistory || n <= 0) return
  ensureListener()
  pending++
  window.history.go(-n)
}

export function pushEntry(state) {
  ensureListener()
  run(() => window.history.pushState({ ...state, athrion: 1 }, ''))
}

export function replaceEntry(state) {
  ensureListener()
  run(() => window.history.replaceState({ ...state, athrion: 1 }, ''))
}

// App listens for back presses that aren't taken by a sub-screen (page changes)
export function onPageBack(fn) {
  ensureListener()
  pageListener = fn
  return () => { if (pageListener === fn) pageListener = null }
}

// ── Store for the header ────────────────────────────────────────────────────
const stack = []    // back handlers, innermost last
const actions = []  // header actions, latest wins
let focus = 0
const listeners = new Set()
let snapshot = { back: null, action: null, focus: false }

function emit() {
  const top = [...stack].reverse().find(e => !e.overlay) // sheets take back presses but not the header
  const act = actions[actions.length - 1]
  snapshot = {
    back: top ? { label: top.label.current, title: top.title.current } : null,
    action: act ? { icon: act.icon, label: act.label, onClick: act.onClick } : null,
    focus: focus > 0,
  }
  listeners.forEach(l => l())
}

function subscribe(l) { listeners.add(l); return () => listeners.delete(l) }
const getSnapshot = () => snapshot

export function useShell() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// While `active`, this screen sits on top of its parent: back (header chevron or
// system gesture) calls onBack. `label` is the parent's name for "‹ Parent".
// overlay: a sheet or full-screen flow; back closes it, the header is left alone.
export function useBackHandler(active, onBack, label, title, overlay = false) {
  const cb = useRef(onBack)
  cb.current = onBack
  const lab = useRef(label)
  const ttl = useRef(title)

  useEffect(() => {
    lab.current = label; ttl.current = title
    if (active) emit()
  }, [label, title])

  useEffect(() => {
    if (!active) return
    const entry = { onBack: cb, label: lab, title: ttl, popped: false, overlay }
    stack.push(entry)
    pushEntry({ ...(hasHistory ? window.history.state : null), sub: stack.length })
    emit()
    return () => {
      if (entry.popped) return
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      entry.popped = true
      silentBack(1)
      emit()
    }
  }, [active])
}

// Header chevron on a pushed sub-screen
export function goBack() {
  const top = stack.pop()
  if (!top) return false
  top.popped = true
  silentBack(1)
  emit()
  top.onBack.current?.()
  return true
}

// Page change: sub-screens of the old page go away with it.
// Returns how many history entries they held, so App can step over them.
export function dropBackHandlers() {
  const n = stack.length
  stack.forEach(e => { e.popped = true })
  stack.length = 0
  if (n) emit()
  return n
}

export function useHeaderAction(icon, label, onClick) {
  const cb = useRef(onClick)
  cb.current = onClick
  useEffect(() => {
    const entry = { icon, label, onClick: () => cb.current?.() }
    actions.push(entry)
    emit()
    return () => {
      const i = actions.indexOf(entry)
      if (i >= 0) actions.splice(i, 1)
      emit()
    }
  }, [icon, label])
}

// Hides the header and the tab bar while `active` (an active workout)
export function useFocusMode(active) {
  useEffect(() => {
    if (!active) return
    focus++
    emit()
    return () => { focus--; emit() }
  }, [active])
}

// ── Active session, read from the workout's saved state ─────────────────────
export const SESSION_EVENT = 'athrion:session'

export function notifySession() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EVENT))
}

export function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem('athrion_workout') || 'null')
    return s?.startTime ? s : null
  } catch { return null }
}

export function setSessionMinimised(minimised) {
  const s = readSession()
  if (!s) return
  localStorage.setItem('athrion_workout', JSON.stringify({ ...s, minimised }))
  notifySession()
}
