// The patient in the kit (design-system.md §4.3–4.4): the banner, the one patient row every list uses, a list's section
// heading, and the patient's line in search and new-patient. Moved from screens/lists/ListRow.tsx and renderers/PatientLine.tsx.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { PatientBanner } from '../db/types'
import { TONE, cn, flagMark, flagTone, flagWord, type Flag } from './tone'
import { Card, Kbd } from './display'
import { IconButton } from './controls'

type BannerProps = {
  name: ReactNode                     // given + family
  sub: ReactNode                      // "58 y · F · #10482 · 010 …"
  context?: ReactNode                 // "In consult · follow-up · 6 min" | "Admitted · Bed 3 · day 2"
  flags?: ReactNode                   // allergy and alert Badges, "No known allergies", "Allergies not asked", deceased
  vitals?: { label: string; value: ReactNode; flag?: Flag | string | null }[]
  back?: { label: string; onClick: () => void }
  actions?: ReactNode; strip?: ReactNode /* the clinic's queue strip, above */
  size?: 'full' | 'compact'; sticky?: boolean /* default: full → true */; className?: string
}
/** The patient banner: the clinic visit, the ward stay, and (compact) the bench and the desk. Stuck to the top, it writes its
 *  height to --chart-top so what sticks under it knows where to stop (no guessed offsets). */
export function Banner({ name, sub, context, flags, vitals, back, actions, strip, size = 'full', sticky, className }: BannerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const full = size === 'full'; const stuck = full && (sticky ?? true)
  useLayoutEffect(() => {
    const el = ref.current; if (!stuck || !el) return
    const root = document.documentElement; const put = () => root.style.setProperty('--chart-top', `${el.offsetHeight}px`)
    put(); const ro = new ResizeObserver(put); ro.observe(el)
    return () => { ro.disconnect(); root.style.removeProperty('--chart-top') }
  }, [stuck])
  const who = <div className="min-w-0">
    <p className="flex flex-wrap items-baseline gap-x-2"><span className={cn('font-semibold tracking-tight text-fg', full ? 'text-18' : 'text-16')}>{name}</span><span className="text-13 text-muted tnum">{sub}</span></p>
    {context && <p className="text-12 text-faint tnum">{context}</p>}
  </div>
  const backButton = back && <IconButton size="md" title={back.label} aria-label={back.label} onClick={back.onClick} className="-ms-1"><ArrowLeft className="rtl:-scale-x-100" /></IconButton>
  if (!full) return <Card className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3', className)}>
    {backButton}{who}{flags && <div className="flex flex-wrap items-center gap-1">{flags}</div>}{actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
  </Card>
  return <div ref={ref} className={cn('border-b border-line bg-surface/95 backdrop-blur', stuck && 'sticky top-0 z-sticky', className)}>
    {strip}
    <div className="mx-auto flex max-w-chart flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      {backButton}{who}
      {flags && <div className="flex flex-wrap items-center gap-1">{flags}</div>}
      {vitals && vitals.length > 0 && <div className="flex flex-wrap items-baseline gap-3 text-12 text-faint tnum">{vitals.map((v) => { const f = v.flag && v.flag !== 'normal' ? v.flag : null
        return <span key={v.label}>{v.label} <b className={cn('text-13 font-semibold', f ? TONE[flagTone(f)].text : 'text-fg')}>{v.value}{f && <><span aria-hidden> {flagMark(f)}</span><span className="sr-only"> {flagWord(f)}</span></>}</b></span> })}</div>}
      {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
    </div>
  </div>
}

const waitWords = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`
/** The one patient row every list uses (spec 05, 2026-09-24): number · name · age and sex · what is happening, in words ·
 *  who or where · waiting time. Staff moving between the desk, the clinic and the lab read it the same way. */
// next: the patient to call next (accent). selected: where the arrows are (a rail), shown only while they are used.
// enter: what ↵ opens while a filter is typed, a small ↵ beside the name and nothing more, so it never reads as hover.
// The mouse never moves the selection: hover only shades the row under it, and not while the keys are in use (typing
// shifts the list under a still mouse, and a shaded row would read as a second selection).
export function ListRow({ number, name, age, status, who, minutes, next, selected, enter, muted, onOpen, actions, className, hover = true }: {
  number: ReactNode; name: ReactNode; age: ReactNode; status?: ReactNode; who?: ReactNode; minutes?: number | null
  next?: boolean; selected?: boolean; enter?: boolean; muted?: boolean; onOpen?: () => void; actions?: ReactNode; className?: string; hover?: boolean
}) {
  return <li aria-selected={selected || undefined} className={cn('group border-t border-line first:border-t-0', next && 'bg-accent-soft/70', selected && 'rail', selected && !next && 'bg-hover', className)}>
    <div role={onOpen ? 'button' : undefined} tabIndex={onOpen ? -1 : undefined} onClick={onOpen}
      className={cn('grid grid-cols-[3rem_minmax(8rem,11rem)_3.5rem_minmax(0,1fr)_auto_3rem] items-center gap-2 px-4 py-2 text-13', onOpen && 'cursor-pointer', onOpen && hover && (next ? 'hover:bg-accent-soft' : 'hover:bg-hover'), muted && 'text-faint')}>
      <span className="font-mono text-12 text-faint tnum">{number}</span>
      <span className={cn('truncate', next ? 'font-semibold text-fg' : 'font-medium')}>{name}{enter && <Kbd className="ms-1.5 align-[1px] text-accent">↵</Kbd>}</span>
      <span className="text-12 text-muted tnum">{age}</span>
      <span className={cn('flex min-w-0 items-center gap-1.5 truncate text-13', muted ? 'text-faint' : 'text-fg')}>{status}</span>
      <span className="flex items-center justify-end gap-2 text-12 text-faint" onClick={(e) => actions && e.stopPropagation()}>{actions ?? who}</span>
      <span className={cn('text-end text-12 tnum', minutes == null ? '' : minutes >= 60 ? 'font-medium text-danger' : minutes >= 30 ? 'text-warn' : 'text-faint')}>{minutes == null ? '' : waitWords(minutes)}</span>
    </div>
  </li>
}

/** a list's section heading, or a folded section with its count */
export function ListSection({ title, count, children, folded, onToggle }: { title: string; count?: number; children?: ReactNode; folded?: boolean; onToggle?: () => void }) {
  return <>
    <li className={cn('border-t border-line px-4 pb-1 pt-2.5 text-11 font-medium text-faint first:border-t-0', onToggle && 'cursor-pointer hover:text-fg')} onClick={onToggle}>
      {onToggle && <span className="me-1 inline-block w-3">{folded ? '›' : '⌄'}</span>}{title}{count != null && <span className="ms-1.5 tnum text-faint">{count}</span>}</li>
    {!folded && children}
  </>
}

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
/** the patient in one line: record number, name, age and sex, phone, deceased */
export function PatientLine({ p, className = '' }: { p: Pick<PatientBanner, 'record_number' | 'given_name' | 'family_name' | 'sex' | 'age' | 'died_on'> & { phone_text?: string | null }; className?: string }) {
  return <span className={cn('flex items-baseline gap-2.5', className)}>
    <span className="font-mono text-11 text-faint">#{p.record_number}</span>
    <span className="font-medium text-fg">{p.given_name} {p.family_name}</span>
    <span className="text-12 text-muted">{p.age}{SEX[p.sex] ?? ''}</span>
    {p.phone_text && <span className="text-12 text-faint">{p.phone_text}</span>}
    {p.died_on && <span className="text-11 font-semibold text-muted">deceased</span>}
  </span>
}
