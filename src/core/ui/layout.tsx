// The kit's layout parts (design-system.md §4.3): the folding section, the page head, a bar of controls, the chart's split
// frame, tabs and a side-nav link. Logical sides only (ms- me- ps- start-), so a right-to-left page needs no second style.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { NavLink, type NavLinkProps } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from './tone'
import { useFold } from './fold'
import { Card, Count, Heading } from './display'

type SectionProps = {
  id?: string                     // with an id the fold is remembered (useFold); without one the section does not fold
  title: ReactNode; count?: number | string; summary?: ReactNode /* shown while folded */; right?: ReactNode
  start?: boolean                 // open at first (default true)
  variant?: 'panel' | 'compact'   // a settings page · the chart's record panel and side boxes
  flush?: boolean                 // the body is a list that brings its own row padding
  tone?: 'default' | 'attention'  // attention: a warn edge
  className?: string; children: ReactNode
}
/** a titled panel that folds; folded, it still says what is inside */
export function Section({ id, ...p }: SectionProps) {
  return id ? <Folding id={id} {...p} /> : <SectionFrame {...p} open fold={null} />
}
function Folding({ id, start = true, ...p }: SectionProps & { id: string }) {
  const [open, setOpen] = useFold(id, start)
  return <SectionFrame {...p} open={open} fold={() => setOpen(!open)} />
}
function SectionFrame({ title, count, summary, right, variant = 'panel', flush, tone, className, children, open, fold }: Omit<SectionProps, 'id' | 'start'> & { open: boolean; fold: (() => void) | null }) {
  const compact = variant === 'compact'
  const head = <>
    {fold && <ChevronRight aria-hidden className={cn('size-4 shrink-0 text-faint transition-transform duration-base rtl:-scale-x-100', open && 'rotate-90 rtl:-rotate-90')} />}
    {compact ? <Heading count={count}>{title}</Heading> : <><span className="shrink-0 text-14 font-semibold text-fg">{title}</span>{count !== undefined && <Count>{count}</Count>}</>}
    {!open && summary && <span className="min-w-0 truncate text-12 text-faint">{summary}</span>}
  </>
  return <Card className={cn('overflow-hidden', tone === 'attention' && 'ring-1 ring-warn-line', className)}>
    <div className={cn('flex items-center gap-2', compact ? 'px-3.5 pt-3 pb-1' : 'px-4 py-2.5', !compact && open && 'border-b border-line')}>
      {fold ? <button type="button" onClick={fold} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-start focus-ring">{head}</button>
        : <div className="flex min-w-0 flex-1 items-center gap-2">{head}</div>}
      {right && <div className="ms-auto flex shrink-0 items-center gap-1">{right}</div>}
    </div>
    {open && (flush ? children : <div className={compact ? 'px-3.5 pb-3' : 'p-4'}>{children}</div>)}
  </Card>
}

/** the page's title and what the page is for */
export function PageHead({ title, hint, right, className }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-end gap-3', className)}>
    <div className="min-w-0 flex-1"><h2 className="text-18 font-semibold tracking-tight text-fg">{title}</h2>{hint && <p className="mt-0.5 text-14 text-muted">{hint}</p>}</div>
    {right && <div className="flex items-center gap-2">{right}</div>}
  </div>
}

/** a bar of controls: in the flow, or stuck to the top or the bottom of the page (the bench's release bar) */
export function Toolbar({ children, position = 'static', inner, className }: { children: ReactNode; position?: 'static' | 'top' | 'bottom'; inner?: string; className?: string }) {
  if (position === 'static') return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
  return <div className={cn('z-sticky bg-surface/90 backdrop-blur', position === 'top' ? 'sticky top-0 border-b border-line' : 'fixed inset-x-0 bottom-0 border-t border-line', className)}>
    <div className={cn('mx-auto flex flex-wrap items-center gap-3 px-4 py-2.5', inner)}>{children}</div>
  </div>
}

type TabItem<T> = { id: T; label: ReactNode; count?: number | string; icon?: LucideIcon }
/** switches what a region shows; ←/→ Home End move between tabs */
export function Tabs<T extends string>({ value, tabs, onChange, variant = 'line', className, 'aria-label': label }: { value: T; tabs: TabItem<T>[]; onChange: (v: T) => void; variant?: 'line' | 'pill'; className?: string; 'aria-label': string }) {
  const at = Math.max(0, tabs.findIndex((t) => t.id === value))
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null
    if (n === null) return
    e.preventDefault(); const i = (n + tabs.length) % tabs.length; onChange(tabs[i].id); e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[i]?.focus()
  }
  return <div role="tablist" aria-label={label} onKeyDown={keys} className={cn(variant === 'line' ? 'flex gap-4 border-b border-line' : 'flex flex-wrap gap-1', className)}>
    {tabs.map((t, i) => <button key={t.id} type="button" role="tab" aria-selected={t.id === value} tabIndex={i === at ? 0 : -1} onClick={() => onChange(t.id)}
      className={cn('inline-flex items-center gap-1.5 text-muted transition-colors hover:text-fg focus-ring', variant === 'line'
        ? 'relative -mb-px h-9 border-b-2 border-transparent text-13 aria-selected:border-accent aria-selected:font-medium aria-selected:text-fg'
        : 'h-7 rounded-full px-3 text-12 hover:bg-hover aria-selected:bg-accent-soft aria-selected:font-medium aria-selected:text-accent')}>
      {t.icon && <t.icon aria-hidden className="size-3.5" />}{t.label}{t.count !== undefined && <span className="font-normal text-faint tnum">{t.count}</span>}
    </button>)}
  </div>
}

/** The chart's frame: the encounter (60 %) and the record (40 %) side by side from 640 px of its own width (a container query, so
 *  it works in any box), tabs below that, on a phone. Both panes stay mounted, so the composer's line and drafts survive a tab change. */
export function SplitPane({ main, aside, mainTab, asideTab, tab, onTab, className }: { main: ReactNode; aside: ReactNode; mainTab: ReactNode; asideTab: ReactNode; tab?: 'main' | 'aside'; onTab?: (t: 'main' | 'aside') => void; className?: string }) {
  const [own, setOwn] = useState<'main' | 'aside'>('main')
  const t = tab ?? own; const set = onTab ?? setOwn
  return <div className={cn('@container', className)}>
    <div className="sticky top-[var(--chart-top,0px)] z-sticky mb-4 bg-canvas px-4 @split:hidden">
      <Tabs aria-label="Chart" value={t} onChange={set} tabs={[{ id: 'main', label: mainTab }, { id: 'aside', label: asideTab }]} />
    </div>
    {/* the encounter 60 %, the record 40 %, at every width from the split up (owner, 2026-09-28) */}
    <div className="mx-auto grid max-w-chart gap-4 px-4 @split:grid-cols-[minmax(0,3fr)_minmax(15rem,2fr)]">
      <section aria-label="Encounter" className={cn('min-w-0', t !== 'main' && '@max-split:hidden')}>{main}</section>
      <aside aria-label="Record" className={cn('min-w-0 @split:sticky @split:top-[calc(var(--chart-top,0px)+1rem)] @split:max-h-[calc(100dvh-var(--chart-top,0px)-2rem)] @split:self-start @split:overflow-y-auto @split:overflow-x-hidden @split:overscroll-contain',
        t !== 'aside' && '@max-split:hidden')}>{aside}</aside>
    </div>
  </div>
}

/** a side-navigation link (Settings, /design): the current page is marked */
export function NavItem({ icon: I, count, children, className, ...rest }: Omit<NavLinkProps, 'className' | 'children'> & { icon?: LucideIcon; count?: number | string; children: ReactNode; className?: string }) {
  return <NavLink {...rest} className={cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-14 text-muted transition-colors hover:bg-hover hover:text-fg focus-ring aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent', className)}>
    {I && <I aria-hidden className="size-4 opacity-70" />}{children}{count !== undefined && <span className="ms-auto text-11 text-faint tnum">{count}</span>}
  </NavLink>
}
