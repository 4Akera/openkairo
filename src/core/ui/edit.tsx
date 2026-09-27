// Editing parts (design-system.md §4.3), moved from screens/settings/parts.tsx so a pack's settings page looks native: a row
// that opens its editor under it, the editor, a new thing's card, a setting's row, a group of settings, save state, delete.
import type { ReactNode } from 'react'
import { Check, ChevronRight, Trash2 } from 'lucide-react'
import { cn } from './tone'
import { errorText } from './time'
import { Card, Kbd } from './display'
import { Button } from './controls'

const Dot = () => <span className="size-1.5 shrink-0 rounded-full bg-warn" title="Changed, not saved yet" />

/** a list row that opens into its editor, right under it */
export function Row({ open, onToggle, muted, children, editor }: { open: boolean; onToggle: () => void; muted?: boolean; children: ReactNode; editor?: () => ReactNode }) {
  return <li>
    <button type="button" onClick={onToggle} aria-expanded={open} className={cn('group flex w-full items-center gap-3 px-4 py-2.5 text-start text-14 transition-colors hover:bg-hover focus-ring', open && 'bg-accent-soft/40 hover:bg-accent-soft/40', muted && 'text-faint')}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</span>
      <span className={cn('shrink-0 text-12 text-faint opacity-0 transition-opacity group-hover:opacity-100', open && 'opacity-100')}>{open ? 'Close' : 'Edit'}</span>
      <ChevronRight aria-hidden className={cn('size-4 shrink-0 text-faint transition-transform group-hover:text-muted rtl:-scale-x-100', open && 'rotate-90 text-accent rtl:-rotate-90 group-hover:text-accent')} />
    </button>
    {open && editor?.()}
  </li>
}

/** the editor under a row: marks unsaved changes, saves on ⌘S or Enter, closes on esc */
export function EditPanel({ dirty, saving, error, canSave = true, onSave, onCancel, aside, children }: { dirty: boolean; saving: boolean; error: Error | null; canSave?: boolean; onSave: () => void; onCancel: () => void; aside?: ReactNode; children: ReactNode }) {
  const go = () => { if (dirty && canSave && !saving) onSave() }
  return <form onSubmit={(e) => { e.preventDefault(); go() }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); go() } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
    className="border-y border-accent-line bg-accent-soft/30 px-4 py-4">
    <div className="grid gap-4">{children}</div>
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent-line/60 pt-3">
      {aside}
      {error ? <span role="alert" className="text-14 text-danger">{errorText(error)}</span> : dirty && <SaveState state="unsaved" />}
      <span className="ms-auto hidden text-11 text-faint sm:inline"><Kbd>⌘S</Kbd> save · <Kbd>esc</Kbd> close</span>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit" size="sm" disabled={!dirty || !canSave || saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
  </form>
}

/** a new thing's editor, above the lists until it is saved */
export const NewCard = ({ title, children }: { title: ReactNode; children: ReactNode }) =>
  <Card className="overflow-hidden ring-2 ring-accent/15"><p className="px-4 pt-3 text-14 font-semibold text-fg">{title}</p>{children}</Card>

/** One setting: what it is and what it does on the left, the control on the right; a dot when it differs from what is saved.
 *  inline: a composer card's labelled row (a short label, then its chips or fields). */
export function FormRow({ label, hint, changed, inline, className, children }: { label?: ReactNode; hint?: ReactNode; changed?: boolean; inline?: boolean; className?: string; children: ReactNode }) {
  if (inline) return <div className={cn('flex flex-wrap items-center gap-1.5', className)}>{label && <span className="w-16 shrink-0 text-11 text-faint">{label}</span>}{children}</div>
  return <div className={cn('grid gap-2 md:grid-cols-[15rem_1fr] md:gap-6', className)}>
    <div><p className="flex items-center gap-1.5 text-14 font-medium text-fg">{label}{changed && <Dot />}</p>
      {hint && <p className="mt-0.5 text-12 leading-relaxed text-faint">{hint}</p>}</div>
    <div className="min-w-0 self-center">{children}</div>
  </div>
}

/** a bordered group of settings inside an editor */
export function Fieldset({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 rounded-lg bg-surface p-4 ring-1 ring-line', className)}>
    <p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">{title}</p>{children}</div>
}

/** unsaved changes (a warn dot) or saved (a check) */
export function SaveState({ state }: { state: 'unsaved' | 'saved' }) {
  return state === 'unsaved' ? <span className="inline-flex items-center gap-1.5 text-12 text-warn"><span className="size-1.5 rounded-full bg-warn" />Unsaved changes</span>
    : <span role="status" className="inline-flex items-center gap-1 text-12 text-ok"><Check aria-hidden className="size-3.5" />Saved</span>
}

/** delete a mistake: gone for good, and only if nothing ever used it — the server refuses anything used (retire that) */
export function DeleteButton({ what, onDelete }: { what: string; onDelete: () => void }) {
  return <Button type="button" size="sm" variant="danger-ghost" aria-label={`Delete ${what}`} title="Only for a mistake that was never used"
    onClick={() => confirm(`Delete ${what}? It goes for good — this works only if nothing ever used it. Anything used stays and can be retired.`) && onDelete()}>Delete</Button>
}
/** retire from inside the editor, never by a stray click on a row */
export const RetireButton = ({ what, onRetire }: { what: string; onRetire: () => void }) =>
  <Button type="button" size="sm" variant="danger-ghost" onClick={() => confirm(`Retire ${what}?`) && onRetire()}><Trash2 className="size-3.5" />Retire</Button>
