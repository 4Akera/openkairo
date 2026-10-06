// The frame every department screen sits in (spec/openCare.md §5.1 rules 5 and 6), base and pack alike: the department's one row of
// tabs (the selected tab is the title: no heading under it), then one toolbar (the screen's own views as counted filters on the left;
// search, date and the main action on the right), then the content, at one width with one margin. A pack fills only the content.
// "Nothing here" is the kit's Empty; "not for your role" is NotForRole below.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { cn } from './tone'
import { Card, Empty } from './display'

/** the one width and margin of a department's screens */
export const FRAME = 'mx-auto w-full max-w-6xl px-4'

type Tab = { key: string; label: ReactNode }
/** the department's tabs: the first few, then More · n, which opens the rest in the row itself (never a menu over the screen); no
 *  onMore: the row stays as it is (the selected tab is one of the rest) */
export function ScreenTabs({ label, first, rest, value, open, onChange, onMore }: { label: string; first: Tab[]; rest: Tab[]; value: string | null; open: boolean
  onChange: (key: string) => void; onMore?: () => void }) {
  const row = useRef<HTMLDivElement>(null)
  const shown = open ? [...first, ...rest] : first
  const at = Math.max(0, shown.findIndex((t) => t.key === value))
  const keys = (e: KeyboardEvent) => {
    const n = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null
    if (n === null || !shown.length) return
    e.preventDefault(); const i = (n + shown.length) % shown.length; onChange(shown[i].key); row.current?.querySelectorAll<HTMLElement>('[role=tab]')[i]?.focus()
  }
  return <div className={cn(FRAME, 'pt-3')}>
    <div className="flex flex-wrap items-end gap-x-5 border-b border-line">
      <div ref={row} role="tablist" aria-label={label} onKeyDown={keys} className="flex flex-wrap gap-x-5">
        {shown.map((t, i) => <button key={t.key} type="button" role="tab" aria-selected={t.key === value} tabIndex={i === at ? 0 : -1} onClick={() => onChange(t.key)}
          className="relative -mb-px h-10 border-b-2 border-transparent text-14 text-muted transition-colors hover:text-fg focus-ring aria-selected:border-accent aria-selected:font-semibold aria-selected:text-fg">
          {t.label}</button>)}
      </div>
      {rest.length > 0 && onMore && <button type="button" aria-expanded={open} onClick={onMore}
        className="-mb-px h-10 border-b-2 border-transparent text-13 text-faint transition-colors hover:text-fg focus-ring">{open ? 'Fewer' : `More · ${rest.length}`}</button>}
    </div>
  </div>
}

/** one of a screen's own views (Collect, Receive, To give…): a filter with its count. needs: the count asks for action, so it
 *  takes a state colour while above 0 (the word says what, the colour never alone) */
export interface ScreenView<T extends string> { id: T; label: string; count?: number; needs?: 'warn' | 'danger' }
function ViewChips<T extends string>({ views, value, onChange }: { views: ScreenView<T>[]; value: T; onChange: (v: T) => void }) {
  return <div role="group" aria-label="Views" className="flex flex-wrap items-center gap-1.5">{views.map((v) => { const needs = v.needs && (v.count ?? 0) > 0
    return <button key={v.id} type="button" aria-pressed={v.id === value} onClick={() => onChange(v.id)}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-13 ring-1 ring-inset transition-colors focus-ring',
        v.id === value ? 'bg-accent-soft font-medium text-accent ring-accent-line' : 'bg-surface text-muted ring-line hover:text-fg hover:ring-line-strong')}>
      {v.label}{v.count !== undefined && <span className={cn('rounded-full px-1.5 text-12 tnum', needs ? (v.needs === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')
        : 'text-faint')}>{v.count}</span>}</button> })}</div>
}

type FrameProps<T extends string> = {
  views?: ScreenView<T>[]; view?: T; onView?: (v: T) => void
  filters?: ReactNode                       // more filters beside the views (a bench's sections)
  search?: ReactNode; date?: ReactNode; action?: ReactNode
  notice?: ReactNode                        // a line under the toolbar: an error, "✓ sent"
  children: ReactNode; className?: string
}
/** a screen's toolbar and content, under the department's tabs */
export function ScreenFrame<T extends string>({ views, view, onView, filters, search, date, action, notice, children, className }: FrameProps<T>) {
  const left = views && view !== undefined && onView ? <ViewChips views={views} value={view} onChange={onView} /> : null
  return <div className={cn(FRAME, 'grid content-start gap-3 py-3', className)}>
    {(left || filters || search || date || action) && <div role="toolbar" aria-label="Views and actions" className="flex flex-wrap items-center gap-2">
      {left}{filters}
      {(search || date || action) && <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{search}{date}{action}</div>}
    </div>}
    {notice}
    {children}
  </div>
}

/** a screen or a part of one this user's role does not open here; sm: one line inside a list or a form (an order the role cannot answer) */
export function NotForRole({ children, className, size = 'md' }: { children?: ReactNode; className?: string; size?: 'sm' | 'md' }) {
  const words = children ?? 'Not for your role here.'
  return size === 'sm' ? <Empty size="sm" className={className}>{words}</Empty> : <Card className={className}><Empty icon={Lock}>{words}</Empty></Card>
}
