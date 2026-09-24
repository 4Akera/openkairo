import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Search } from 'lucide-react'
import { Button, Card, Input, Kbd, cn, errorText } from '../../ui'

/** open or folded, remembered in this browser (a private window starts every section open) */
export function useFold(key: string, start = true) {
  const k = `settings.fold.${key}`
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(k); return v === null ? start : v === '1' } catch { return start } })
  useEffect(() => { try { localStorage.setItem(k, open ? '1' : '0') } catch { /* storage blocked */ } }, [k, open])
  return [open, setOpen] as const
}

/** the page's title and what the page is for */
export function PageHead({ title, hint, right }: { title: string; hint?: ReactNode; right?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">
    <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{hint && <p className="mt-0.5 text-sm text-neutral-500">{hint}</p>}</div>
    {right && <div className="flex items-center gap-2">{right}</div>}
  </div>
}

/** a titled panel that folds; folded, it still says what is inside */
export function Section({ id, title, count, summary, right, start = true, children }: { id: string; title: ReactNode; count?: number | string; summary?: ReactNode; right?: ReactNode; start?: boolean; children: ReactNode }) {
  const [open, setOpen] = useFold(id, start)
  return <Card className="overflow-hidden">
    <div className={cn('flex items-center gap-2 px-4 py-2.5', open && 'border-b border-neutral-100 bg-neutral-50/60')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-90')} />
        <span className="shrink-0 text-sm font-semibold">{title}</span>
        {count !== undefined && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500 tnum">{count}</span>}
        {!open && summary && <span className="min-w-0 truncate text-xs text-neutral-400">{summary}</span>}
      </button>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </div>
    {open && children}
  </Card>
}

/** a list row that opens into its editor, right under it */
export function Row({ open, onToggle, muted, children, editor }: { open: boolean; onToggle: () => void; muted?: boolean; children: ReactNode; editor?: () => ReactNode }) {
  return <li>
    <button type="button" onClick={onToggle} aria-expanded={open} className={cn('group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-neutral-50', open && 'bg-teal-50/50 hover:bg-teal-50/50', muted && 'text-neutral-400')}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</span>
      <span className={cn('shrink-0 text-xs text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100', open && 'opacity-100')}>{open ? 'Close' : 'Edit'}</span>
      <ChevronRight className={cn('h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:text-neutral-500', open && 'rotate-90 text-teal-700')} />
    </button>
    {open && editor?.()}
  </li>
}

/** one row open at a time, its draft held against what was loaded so the editor can say what changed */
export function useDraft<T>() {
  const [s, setS] = useState<{ id: string; isNew: boolean; initial: T; draft: T } | null>(null)
  const dirty = !!s && JSON.stringify(s.initial) !== JSON.stringify(s.draft)
  useEffect(() => { if (!dirty) return; const k = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', k); return () => window.removeEventListener('beforeunload', k) }, [dirty])
  const leave = () => !dirty || confirm('Discard your unsaved changes?')
  return {
    id: s?.id ?? null, isNew: !!s?.isNew, draft: s?.draft ?? null, initial: s?.initial ?? null, dirty,
    /** open a row (or a new one); the open row again closes it */
    toggle: (id: string, initial: T, isNew = false) => { if (!leave()) return; setS(s?.id === id ? null : { id, isNew, initial, draft: initial }) },
    set: (p: Partial<T>) => setS((x) => x && { ...x, draft: { ...x.draft, ...p } }),
    changed: (k: keyof T) => !!s && !s.isNew && JSON.stringify(s.initial[k]) !== JSON.stringify(s.draft[k]),
    cancel: () => { if (leave()) setS(null) },
    done: () => setS(null),
  }
}

/** the editor under a row: marks unsaved changes, saves on ⌘S or Enter, closes on esc */
export function EditPanel({ dirty, saving, error, canSave = true, onSave, onCancel, aside, children }: { dirty: boolean; saving: boolean; error: Error | null; canSave?: boolean; onSave: () => void; onCancel: () => void; aside?: ReactNode; children: ReactNode }) {
  const go = () => { if (dirty && canSave && !saving) onSave() }
  return <form onSubmit={(e) => { e.preventDefault(); go() }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); go() } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
    className="border-y border-teal-200 bg-teal-50/30 px-4 py-4">
    <div className="grid gap-4">{children}</div>
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-teal-100 pt-3">
      {aside}
      {error ? <span className="text-sm text-red-700">{errorText(error)}</span> : dirty && <Unsaved />}
      <span className="ml-auto hidden text-[11px] text-neutral-400 sm:inline"><Kbd>⌘S</Kbd> save · <Kbd>esc</Kbd> close</span>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit" size="sm" disabled={!dirty || !canSave || saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
  </form>
}
export const Unsaved = () => <span className="inline-flex items-center gap-1.5 text-xs text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Unsaved changes</span>
export const Saved = () => <span className="inline-flex items-center gap-1 text-xs text-teal-700"><Check className="h-3.5 w-3.5" />Saved</span>

/** one setting: what it is and what it does on the left, the control on the right; a dot when it differs from what is saved */
export function Line({ label, hint, changed, children }: { label: ReactNode; hint?: ReactNode; changed?: boolean; children: ReactNode }) {
  return <div className="grid gap-2 md:grid-cols-[15rem_1fr] md:gap-6">
    <div><p className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">{label}{changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Changed, not saved yet" />}</p>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{hint}</p>}</div>
    <div className="min-w-0 self-center">{children}</div>
  </div>
}

/** one of a few: the chosen one filled */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <span role="radiogroup" className="inline-flex flex-wrap rounded-lg bg-white p-0.5 ring-1 ring-neutral-200">{options.map(([v, l]) =>
    <button type="button" role="radio" aria-checked={value === v} key={v} onClick={() => onChange(v)} className={cn('rounded-md px-2.5 py-1 text-xs transition-colors', value === v ? 'bg-teal-800 font-medium text-white' : 'text-neutral-600 hover:text-neutral-900')}>{l}</button>)}</span>
}

/** a chip that is on or off (departments a reception serves, services in a preset) */
export function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors', on ? 'bg-teal-50 font-medium text-teal-900 ring-teal-300' : 'bg-white text-neutral-600 ring-neutral-200 hover:ring-neutral-400')}>
    {on && <Check className="h-3 w-3" />}{children}</button>
}

/** a label over its control, with an optional line of help */
export function Labeled({ label, hint, changed, className, children }: { label: string; hint?: ReactNode; changed?: boolean; className?: string; children: ReactNode }) {
  return <label className={cn('grid content-start gap-1', className)}><span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">{label}{changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Changed, not saved yet" />}</span>
    {children}{hint && <span className="text-[11px] text-neutral-500">{hint}</span>}</label>
}

/** a bordered group of settings inside an editor */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid gap-4 rounded-lg bg-white p-4 ring-1 ring-neutral-200">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>{children}</div>
}

/** a filter box; Enter picks the first match (onEnter) and never submits the editor around it */
export const Filter = ({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void }) =>
  <div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8"
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }} /></div>
export const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-6 text-center text-sm text-neutral-400">{children}</p>
