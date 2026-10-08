// The Print key (spec/openCare.md §3.13 Printing, (p1)): P prints what the screen offers to print — never while typing in a field, never
// with a modifier (so the browser's own Cmd-P / Ctrl-P stays the browser's), never held down. The P key is the letter P, or, with a
// keyboard that types no Latin letters (Arabic: that key types ح), the key where P is. Where several printouts are on screen, the one
// shown last answers. The test (npm run test:print) reads isPrintKey and the stack.
import { useEffect, useRef } from 'react'

/** the parts of a key event the rule reads */
export interface KeyLike { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat?: boolean; defaultPrevented?: boolean
  target: unknown }
/** is the event's target a place to type (a field, a text area, a list to choose from, an editable text) */
export const typingIn = (target: unknown) => {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? '') || !!el.isContentEditable)
}
/** the key is P: the letter P (Caps Lock or not, whatever key types it), or the key where P is when the keyboard types something that
 *  is not a Latin letter there (an Arabic layout); a Latin layout that puts another letter there (Dvorak) keeps that letter */
const isP = (e: Pick<KeyLike, 'key' | 'code'>) => e.key === 'p' || e.key === 'P' || (e.code === 'KeyP' && !/^[a-z]$/i.test(e.key))
/** P alone, outside a field */
export const isPrintKey = (e: KeyLike) =>
  isP(e) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat && !e.defaultPrevented && !typingIn(e.target)

// the printouts on screen that answer P, the last shown first
const stack: { id: number; fn: () => void }[] = []
let next = 0
/** take P for this printout while it is shown (and enabled); give it back when it goes */
export function holdPrintKey(fn: () => void): () => void {
  const id = next++; stack.push({ id, fn })
  return () => { const i = stack.findIndex((x) => x.id === id); if (i >= 0) stack.splice(i, 1) }
}
/** a key down: P prints the last shown; true when it did */
export function onPrintKey(e: KeyLike & { preventDefault?: () => void }): boolean {
  if (!isPrintKey(e) || !stack.length) return false
  e.preventDefault?.(); stack[stack.length - 1].fn(); return true
}
let listening = false
/** P prints with fn while this is shown and on */
export function usePrintKey(fn: () => void, on = true) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => {
    if (!on) return
    if (!listening && typeof window !== 'undefined') { listening = true; window.addEventListener('keydown', (e) => { onPrintKey(e) }) }
    return holdPrintKey(() => ref.current())
  }, [on])
}
