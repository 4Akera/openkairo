// The kit's display parts (design-system.md §4.2–4.3): containers, words on a row, numbers and notices. Tokens only; colour
// marks state, and a state never shows by colour alone (a glyph or a word goes with it).
import { Fragment, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { TONE, cn, flagMark, flagTone, flagWord, initials, interpMark, interpWord, toTone, trendMark, type Flag, type LegacyTone, type Tone } from './tone'
import { hm, shortDate, ymd } from './time'

/** a panel: the one container every screen uses */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-line bg-surface shadow-xs', className)} {...rest}>{children}</div>
}

/** a count beside a heading */
export const Count = ({ children }: { children: ReactNode }) => <span className="shrink-0 rounded-full bg-sunken px-1.5 text-11 font-medium text-faint ring-1 ring-inset ring-line tnum">{children}</span>
/** a small uppercase heading with an optional count and actions at the end (brand and alert are the old names of accent and danger) */
export function Heading({ children, count, right, className, tone = 'muted' }: { children: ReactNode; count?: number | string; right?: ReactNode; className?: string; tone?: 'muted' | 'accent' | 'danger' | 'brand' | 'alert' }) {
  return <div className={cn('flex items-center gap-2', className)}>
    <h3 className={cn('text-11 font-semibold uppercase tracking-[0.08em]', tone === 'muted' && 'text-faint', (tone === 'accent' || tone === 'brand') && 'text-accent', (tone === 'danger' || tone === 'alert') && 'text-danger')}>{children}</h3>
    {count !== undefined && <Count>{count}</Count>}
    {right && <div className="ms-auto flex items-center gap-1">{right}</div>}
  </div>
}

/** a status: a word in a ringed chip */
export function Badge({ children, tone = 'neutral', icon: I, className }: { children: ReactNode; tone?: Tone | LegacyTone; icon?: LucideIcon; className?: string }) {
  const t = TONE[toTone(tone)]
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-px text-11 font-medium ring-1 ring-inset', t.soft, t.text, t.line, className)}>{I && <I aria-hidden className="size-3" />}{children}</span>
}
/** a small word on a row: back, urgent, sample taken (a Badge has a ring; a Tag has none) */
export function Tag({ tone = 'neutral', children, icon: I, title, className }: { tone?: Tone | LegacyTone; children: ReactNode; icon?: LucideIcon; title?: string; className?: string }) {
  const t = TONE[toTone(tone)]
  return <span title={title} className={cn('inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-px text-11 font-medium', t.soft, t.text, className)}>{I && <I aria-hidden className="size-3" />}{children}</span>
}
/** a key; it takes the colour around it, so it works on any fill (no opacity: dimmed faint text fails AA) */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-current/25 px-1 font-sans text-11 font-medium', className)}>{children}</kbd>
}
/** a person's initials; the name is written next to it, so it is hidden from screen readers */
export function Avatar({ name, size = 'md', muted, className }: { name: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean; className?: string }) {
  return <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold', { sm: 'size-6 text-11', md: 'size-7 text-11', lg: 'size-9 text-13' }[size],
    muted ? 'bg-sunken text-faint' : 'bg-accent-soft text-accent', className)}>{initials(name)}</span>
}

const num = (v: ReactNode) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null
const when = (at: string) => isNaN(Date.parse(at)) ? at : shortDate(at)

/** the "nothing here" line: sm inside a panel, md for a page or a list */
export function Empty({ children, icon: I, action, size = 'md', className }: { children: ReactNode; icon?: LucideIcon; action?: ReactNode; size?: 'sm' | 'md'; className?: string }) {
  return size === 'sm' ? <p className={cn('py-1.5 text-12 text-faint', className)}>{children}</p>
    : <div className={cn('px-4 py-8 text-center text-14 text-faint', className)}>{I && <I aria-hidden className="mx-auto mb-2 size-5" />}<p>{children}</p>{action && <div className="mt-3">{action}</div>}</div>
}
/** a loading placeholder where the shape is known; the region around it says aria-busy */
export function Skeleton({ className, lines }: { className?: string; lines?: number }) {
  const bar = 'animate-pulse rounded-md bg-sunken motion-reduce:animate-none'
  return lines ? <div aria-hidden className={cn('grid gap-2', className)}>{Array.from({ length: lines }, (_, i) => <div key={i} className={cn(bar, 'h-3', i === lines - 1 && 'w-3/5')} />)}</div>
    : <div aria-hidden className={cn(bar, className)} />
}
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="flex items-center gap-2 text-14 text-muted" role="status"><span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-none" />{label}</div>
}
export function Centered({ children }: { children: ReactNode }) { return <div className="grid min-h-[60vh] place-items-center">{children}</div> }

const CALLOUT_ICON: Record<Tone, LucideIcon> = { neutral: Info, accent: Info, info: Info, ok: CircleCheck, warn: TriangleAlert, danger: CircleAlert }
/** a notice in the page's flow (an error, a warning to confirm, "✓ sent"): never an overlay */
export function Callout({ tone, title, children, actions, icon, role, className }: { tone: Tone; title?: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: LucideIcon | false; role?: 'alert' | 'status'; className?: string }) {
  const t = TONE[tone]; const I = icon === false ? null : icon ?? CALLOUT_ICON[tone]
  return <div role={role ?? (tone === 'danger' || tone === 'warn' ? 'alert' : 'status')} className={cn('flex animate-pop items-start gap-2.5 rounded-lg px-3 py-2 text-14 ring-1 ring-inset', t.soft, t.text, t.line, className)}>
    {I && <I aria-hidden className="mt-0.5 size-4 shrink-0" />}
    <div className={cn('min-w-0 flex-1', tone === 'neutral' && 'text-fg')}>{title && <p className="font-medium">{title}</p>}{children}{actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}</div>
  </div>
}

/** label and value pairs: a result's details, a block's Details, the fallback block */
export function KV({ items, labelWidth, dense, className }: { items: [ReactNode, ReactNode][]; labelWidth?: string; dense?: boolean; className?: string }) {
  return <dl style={labelWidth ? { '--kv': labelWidth } as CSSProperties : undefined} className={cn('grid grid-cols-[var(--kv,8rem)_1fr] gap-x-3', dense ? 'gap-y-0.5 text-12' : 'gap-y-1 text-13', className)}>
    {items.map(([k, v], i) => <Fragment key={i}><dt className="text-muted">{k}</dt><dd className="min-w-0 text-fg">{v}</dd></Fragment>)}</dl>
}

export interface AnalyteRow { name: ReactNode; value: ReactNode; unit?: string | null; flag?: Flag | string | null; interp?: string | null; low?: number | null; high?: number | null; text?: string | null; previous?: { value: ReactNode; at: string } | null; onOpen?: () => void }
const range = (lo?: number | null, hi?: number | null) => lo != null && hi != null ? `${lo}\u2009–\u2009${hi}` : hi != null ? `≤\u2009${hi}` : lo != null ? `≥\u2009${lo}` : ''
/** a result's analytes: a flagged value is bold, in its tone and with its glyph (and the word for screen readers); a critical row is tinted.
 *  interp is the analyte's own interpretation (LL, HH keep the direction the flag folds away). */
export function AnalyteTable({ rows, showPrevious, dense, nameHead = 'Test', className }: { rows: AnalyteRow[]; showPrevious?: boolean; dense?: boolean; nameHead?: string; className?: string }) {
  const cell = dense ? 'py-1' : 'py-1.5'
  return <table className={cn('w-full tnum', dense ? 'text-12' : 'text-13', className)}>
    <thead><tr className="border-b border-line text-11 uppercase tracking-[0.08em] text-faint">{[nameHead, 'Result', 'Unit', 'Reference', ...(showPrevious ? ['Before'] : [])].map((h, i) =>
      <th key={h} className={cn('py-1.5 pe-3 font-medium', i === 1 ? 'text-end' : 'text-start')}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => {
      const flagged = !!r.flag && r.flag !== 'normal'; const mark = r.interp ? interpMark(r.interp) : flagMark(r.flag); const word = r.interp ? interpWord(r.interp) : flagWord(r.flag)
      return <tr key={i} tabIndex={r.onOpen ? 0 : undefined} onClick={r.onOpen} onKeyDown={r.onOpen && ((e) => { if (e.key === 'Enter') r.onOpen?.() })}
        className={cn('border-b border-line last:border-0', r.flag === 'critical' && 'bg-danger-soft', r.onOpen && 'cursor-pointer hover:bg-hover focus-ring')}>
        <td className={cn(cell, 'ps-1 pe-3 text-muted')}>{r.name}{r.text && <span className="block text-12 text-faint">{r.text}</span>}</td>
        <td className={cn(cell, 'pe-3 text-end', flagged ? cn('font-semibold', TONE[flagTone(r.flag)].text) : 'text-fg')}>{r.value}{mark && <span aria-hidden> {mark}</span>}{word && (flagged || r.interp) && <span className="sr-only"> {word}</span>}</td>
        <td className={cn(cell, 'pe-3 text-faint')}>{r.unit}</td>
        <td className={cn(cell, 'pe-3 text-faint')}>{range(r.low, r.high)}</td>
        {showPrevious && <td className={cn(cell, 'pe-1 text-faint')}>{r.previous && <>{trendMark(num(r.value), num(r.previous.value))} {r.previous.value} · {when(r.previous.at)}</>}</td>}
      </tr>
    })}</tbody>
  </table>
}

export interface Step { key: string; label: string; at?: string | null; state: 'done' | 'current' | 'todo' | 'failed' }
const STEP_DOT = { done: 'bg-accent', current: 'bg-info ring-3 ring-info/20', todo: 'bg-line-strong', failed: 'bg-danger' }
const STEP_WORD = { done: 'done', current: 'now', todo: 'to come', failed: 'failed' }
const stepAt = (at: string) => ymd(at) === ymd(new Date().toISOString()) ? hm(at) : shortDate(at)
/** an order's progress (Sent → Collected → Received → Resulted), from the service's own step keys */
export function Steps({ steps, dense, className }: { steps: Step[]; dense?: boolean; className?: string }) {
  return <ol aria-label="Progress" className={cn('flex flex-wrap items-center gap-1.5 text-12', className)}>
    {steps.map((s, i) => <li key={s.key} className="flex items-center gap-1.5">
      {i > 0 && <span aria-hidden className="h-px w-4 bg-line" />}<span aria-hidden className={cn('size-2 shrink-0 rounded-full', STEP_DOT[s.state])} />
      <span className={s.state === 'todo' ? 'text-faint' : s.state === 'failed' ? 'text-danger' : cn('text-fg', s.state === 'current' && 'font-medium')}>{s.label}<span className="sr-only"> ({STEP_WORD[s.state]})</span></span>
      {s.at && !dense && <span className="text-faint tnum">{stepAt(s.at)}</span>}
    </li>)}
  </ol>
}
