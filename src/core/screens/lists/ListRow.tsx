import type { ReactNode } from 'react'
import { Kbd, cn } from '../../ui'

/** The one patient row every list uses (spec 05, 2026-09-24): number · name · age and sex · what is happening, in words ·
 *  who or where · waiting time. Staff moving between the desk, the clinic and the lab read it the same way. */
// next: the patient to call next (teal). selected: where the arrows are (a bar), shown only while they are used.
// enter: what ↵ opens while a filter is typed, a small ↵ beside the name and nothing more, so it never reads as hover.
// The mouse never moves the selection: hover only shades the row under it, and not while the keys are in use (typing
// shifts the list under a still mouse, and a shaded row would read as a second selection).
export function ListRow({ number, name, age, status, who, minutes, next, selected, enter, muted, onOpen, actions, className, hover = true }: {
  number: ReactNode; name: ReactNode; age: ReactNode; status?: ReactNode; who?: ReactNode; minutes?: number | null
  next?: boolean; selected?: boolean; enter?: boolean; muted?: boolean; onOpen?: () => void; actions?: ReactNode; className?: string; hover?: boolean
}) {
  return <li aria-selected={selected || undefined} className={cn('group border-t border-neutral-100 first:border-t-0', next && 'bg-teal-50/80', selected && 'shadow-[inset_3px_0_0_var(--color-teal-700)]', selected && !next && 'bg-neutral-50', className)}>
    <div role={onOpen ? 'button' : undefined} tabIndex={onOpen ? -1 : undefined} onClick={onOpen}
      className={cn('grid grid-cols-[3rem_minmax(8rem,11rem)_3.5rem_minmax(0,1fr)_auto_3rem] items-center gap-2 px-4 py-2 text-[13.5px]', onOpen && 'cursor-pointer', onOpen && hover && 'hover:bg-neutral-50', next && hover && 'hover:bg-teal-50', muted && 'text-neutral-500')}>
      <span className="font-mono text-xs text-neutral-400 tnum">{number}</span>
      <span className={cn('truncate', next ? 'font-semibold text-neutral-900' : 'font-medium')}>{name}{enter && <Kbd className="ml-1.5 align-[1px] text-teal-800">↵</Kbd>}</span>
      <span className="text-xs text-neutral-500 tnum">{age}</span>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-neutral-700">{status}</span>
      <span className="flex items-center justify-end gap-2 text-xs text-neutral-500" onClick={(e) => actions && e.stopPropagation()}>{actions ?? who}</span>
      <span className={cn('text-right text-xs tnum', minutes == null ? '' : minutes >= 60 ? 'font-medium text-red-700' : minutes >= 30 ? 'text-amber-700' : 'text-neutral-400')}>{minutes == null ? '' : minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`}</span>
    </div>
  </li>
}

/** a small word on a row: back, urgent, sample taken */
export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  return <span className={cn('shrink-0 rounded px-1.5 py-px text-[11px] font-medium', {
    neutral: 'bg-neutral-100 text-neutral-600', green: 'bg-teal-50 text-teal-800', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', blue: 'bg-sky-50 text-sky-800' }[tone])}>{children}</span>
}

/** a list's section heading, or a folded section with its count */
export function ListSection({ title, count, children, folded, onToggle }: { title: string; count?: number; children?: ReactNode; folded?: boolean; onToggle?: () => void }) {
  return <>
    <li className={cn('border-t border-neutral-100 px-4 pb-1 pt-2.5 text-[11px] font-medium text-neutral-500 first:border-t-0', onToggle && 'cursor-pointer hover:text-neutral-800')} onClick={onToggle}>
      {onToggle && <span className="mr-1 inline-block w-3">{folded ? '›' : '⌄'}</span>}{title}{count != null && <span className="ml-1.5 tnum text-neutral-400">{count}</span>}</li>
    {!folded && children}
  </>
}
