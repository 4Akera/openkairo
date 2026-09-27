// The theme (design-system.md §3.2): System (the default) follows the OS; Light or Dark is this browser's choice, kept in
// localStorage 'oc.theme' (not the user's record: it survives sign-out, and each demo port is its own origin). index.html sets
// data-theme before first paint; initTheme() (main.tsx) keeps it in step after that. Nothing here touches window at import,
// so a node test may import the kit.
// Until every screen is on tokens, System means light (a half-swept app in dark would be unreadable): only a chosen Dark is
// dark. Build plan 2.11 turns FOLLOW_OS on, here and in index.html's script, when the raw palette is cleared.
import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'oc.theme'
const FOLLOW_OS = false
const CANVAS = { light: '#f3f5f5', dark: '#0e1212' }   // the browser's own chrome (theme-color) matches the page
const browser = () => typeof window !== 'undefined' && typeof document !== 'undefined'
const saved = (): ThemePref => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' } }   // storage blocked: System
const osDark = () => FOLLOW_OS && browser() && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
let pref: ThemePref | null = null   // read on first use, never at import
const current = (): ThemePref => pref ??= browser() ? saved() : 'system'
const resolved = (): 'light' | 'dark' => browser() && document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
const subs = new Set<() => void>()

function apply() {
  const p = current(); const dark = p === 'dark' || (p === 'system' && osDark())
  const d = document.documentElement
  d.setAttribute('data-theme', dark ? 'dark' : 'light'); d.setAttribute('data-theme-pref', p)
  // on System each theme-color keeps its own media; a choice makes both say the chosen canvas
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = p === 'system' && FOLLOW_OS ? CANVAS[m.media.includes('dark') ? 'dark' : 'light'] : CANVAS[dark ? 'dark' : 'light'] })
  subs.forEach((f) => f())
}

let started = false
/** once, from main.tsx: follow the OS while on System, and a choice made in another tab of this origin */
export function initTheme() {
  if (started || !browser()) return
  started = true
  pref = saved()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (current() === 'system') apply() })   // the OS switched at sunset
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { pref = saved(); apply() } })
  apply()
}

export function setTheme(p: ThemePref) {
  pref = p
  try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p) } catch { /* storage blocked: this tab only */ }
  if (browser()) apply()
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** the choice and what it resolves to now */
export function useTheme() {
  const snap = useSyncExternalStore(subscribe, () => `${current()}:${resolved()}`, () => 'system:light')
  const [p, r] = snap.split(':') as [ThemePref, 'light' | 'dark']
  return { pref: p, resolved: r, setTheme }
}
