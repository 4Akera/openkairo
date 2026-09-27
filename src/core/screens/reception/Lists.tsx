import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVisitQueue } from '../../hooks/reads'
import { useDepartment } from '../../hooks/organization'
import { useVisitActions } from '../../hooks/writes'
import type { Department } from '../../db/types'
import { Card, Heading, Tag, cn, errorText, minutesSince } from '../../ui'
import { duration, fullName, rowWords, waited, type ClinicRow } from './words'

/** a small word-button on a row: Undo, Left, Gone */
export function RowButton({ tone = 'neutral', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'neutral' | 'danger' | 'primary' }) {
  return <button type="button" className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 transition-colors disabled:pointer-events-none disabled:opacity-50', {
    neutral: 'text-neutral-600 ring-neutral-200 hover:bg-white hover:text-neutral-900 hover:ring-neutral-400',
    danger: 'text-neutral-500 ring-neutral-200 hover:bg-white hover:text-red-700 hover:ring-red-300',
    primary: 'bg-teal-800 text-white ring-teal-800 hover:bg-teal-900' }[tone], className)} {...rest} />
}
const Urgent = ({ priority }: { priority: string }) => priority !== 'routine' ? <Tag tone="red">{priority}</Tag> : null
const Failed = ({ error }: { error: unknown }) => error ? <p className="px-4 py-1.5 text-xs text-red-700">{errorText(error)}</p> : null

/** one line of the right column: who, what, how long, and at most one action */
function Line({ children, minutes, action, muted, onClick }: { children: ReactNode; minutes?: number | null; action?: ReactNode; muted?: boolean; onClick?: () => void }) {
  return <li className={cn('flex items-center gap-2 border-t border-neutral-100 px-4 py-1.5 text-[13px]', muted && 'text-neutral-500', onClick && 'cursor-pointer hover:bg-neutral-50')} onClick={onClick}>
    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{children}</span>
    {minutes != null && <span className="shrink-0 text-xs text-neutral-400 tnum">{duration(minutes)}</span>}
    {action && <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>{action}</span>}
  </li>
}
const Box = ({ title, tone, count, children }: { title: string; tone?: 'muted' | 'alert'; count?: number; children: ReactNode }) =>
  <Card className="overflow-hidden"><Heading tone={tone} count={count} className="px-4 pb-1.5 pt-3">{title}</Heading><ul>{children}</ul></Card>

/** Clinics: one line per served clinic (how many wait, with a doctor, the longest wait); a click unfolds its patients.
 *  Each line's useVisitQueue is what keeps every clinic's rows live for the whole desk. */
export function Clinics({ clinics }: { clinics: Department[] }) {
  const [open, setOpen] = useState<string[]>([])
  const toggle = (id: string) => setOpen((o) => o.includes(id) ? o.filter((x) => x !== id) : [...o, id])
  if (!clinics.length) return null
  return <Box title="Clinics">
    {clinics.map((c) => <ClinicLine key={c.id} clinic={c} folded={!open.includes(c.id)} onToggle={() => toggle(c.id)} />)}
  </Box>
}

function Fold({ folded, onToggle, name, words }: { folded: boolean; onToggle: () => void; name: string; words: ReactNode }) {
  return <li className="border-t border-neutral-100">
    <button type="button" onClick={onToggle} aria-expanded={!folded} className="flex w-full items-baseline gap-2 px-4 py-2 text-left hover:bg-neutral-50">
      <span className="inline-block w-3 text-neutral-400">{folded ? '›' : '⌄'}</span>
      <span className="text-[13px] font-medium text-neutral-900">{name}</span>
      <span className="ml-auto text-xs text-neutral-500 tnum">{words}</span>
    </button>
  </li>
}

function ClinicLine({ clinic, folded, onToggle }: { clinic: Department; folded: boolean; onToggle: () => void }) {
  const q = useVisitQueue(clinic.id); const navigate = useNavigate()
  const { can } = useDepartment(); const visits = useVisitActions()
  const rows = q.data?.rows ?? []
  const waiting = rows.filter((r) => r.band === 'waiting' || r.band === 'back'), consult = rows.filter((r) => r.band === 'consult'), pending = rows.filter((r) => r.band === 'pending')
  const longest = waiting.reduce((m, r) => Math.max(m, waited(r)), 0)
  const words = q.isLoading ? '…' : q.error ? <span className="text-red-700">{errorText(q.error)}</span> : !rows.length ? 'nobody here'
    : <>{waiting.length} waiting · {consult.length} with a doctor{pending.length > 0 && <> · {pending.length} for results</>}
      {waiting.length > 0 && <> · <span className={cn(longest >= 60 ? 'font-medium text-red-700' : longest >= 30 && 'text-amber-700')}>{duration(longest)}</span></>}</>
  return <>
    <Fold folded={folded} onToggle={onToggle} name={clinic.name} words={words} />
    {!folded && rows.map((r) => <Line key={r.id} minutes={waited(r)} muted={r.band === 'pending'} onClick={() => navigate(`/visit/${r.id}`)}
      action={r.band === 'pending' && can('write:not_here') ? <RowButton tone="danger" title="The patient left: results go to the doctor's review list" disabled={visits.present.isPending}
        onClick={() => visits.present.mutate({ visit: r.visit, is_present: false })}>Gone</RowButton> : undefined}>
      <span className="text-xs text-neutral-400 tnum">#{r.patient.record_number}</span><span className="truncate">{fullName(r.patient)}</span>
      <span className="truncate text-neutral-500">{rowWords(r)}</span><Urgent priority={r.priority} /></Line>)}
    {!folded && <Failed error={visits.present.error} />}
  </>
}

/** Needs you: shown only when something does. Called and not there (Left, while unseen). A private department's visits are
 *  ordinary rows in the clinics' lines: only its notes are private (spec 07). */
export function NeedsYou({ rows, onDone }: { rows: ClinicRow[]; onDone: (said: string) => void }) {
  const { can } = useDepartment(); const visits = useVisitActions()
  const missed = rows.filter((r) => r.band === 'waiting' && r.missed_calls > 0).sort((a, b) => b.missed_calls - a.missed_calls || Date.parse(a.arrived_at) - Date.parse(b.arrived_at))
  if (!missed.length) return null
  async function left(r: ClinicRow) {
    try { await visits.left.mutateAsync({ visit: r.visit }); onDone(`${fullName(r.patient)} left ${r.clinic.name}`) } catch { /* shown below */ }
  }
  return <Box title="Needs you" tone="alert" count={missed.length}>
    {missed.map((r) => <Line key={r.id} minutes={waited(r)}
      action={can('write:left') && !r.seen_at ? <RowButton tone="danger" title="He has gone: end the visit as left" disabled={visits.left.isPending} onClick={() => void left(r)}>Left</RowButton> : undefined}>
      <span className="text-xs text-neutral-400 tnum">#{r.patient.record_number}</span><span className="truncate">{fullName(r.patient)}</span>
      <Tag tone="amber">not here ×{r.missed_calls}</Tag><span className="truncate text-xs text-neutral-500">{r.clinic.name}</span></Line>)}
    <Failed error={visits.left.error} />
  </Box>
}

/** Today: the desk's idle view, five numbers for the day across the served clinics. Nothing here to act on; the
 *  lists beside it are where the work is. */
export function Today({ rows, doneToday }: { rows: ClinicRow[]; doneToday: number }) {
  const waiting = rows.filter((r) => r.band === 'waiting' || r.band === 'back')
  const longest = waiting.reduce((m, r) => Math.max(m, waited(r)), 0)
  const tiles: [string, ReactNode, string?][] = [
    ['Waiting', waiting.length], ['With a doctor', rows.filter((r) => r.band === 'consult').length],
    ['For results', rows.filter((r) => r.band === 'pending').length], ['Done today', doneToday],
    ['Longest wait', waiting.length ? duration(longest) : '—', longest >= 60 ? 'text-red-700' : longest >= 30 ? 'text-amber-700' : undefined]]
  return <Card className="p-4">
    <Heading>Today</Heading>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{tiles.map(([label, value, tone]) =>
      <div key={label} className="rounded-lg bg-neutral-50 px-3 py-2.5">
        <p className={cn('text-2xl font-semibold tracking-tight text-neutral-900 tnum', tone)}>{value}</p>
        <p className="text-xs text-neutral-500">{label}</p></div>)}</div>
  </Card>
}

/** Last sent: the five newest visits across the served clinics. Undo while he still waits unseen (a check-in by mistake). */
export function LastSent({ rows, onDone }: { rows: ClinicRow[]; onDone: (said: string) => void }) {
  const { can } = useDepartment(); const visits = useVisitActions()
  const last = [...rows].sort((a, b) => Date.parse(b.arrived_at) - Date.parse(a.arrived_at)).slice(0, 5)
  if (!last.length) return null
  async function undo(r: ClinicRow) {
    try { await visits.cancel.mutateAsync({ visit: r.visit }); onDone(`${fullName(r.patient)}: check-in undone`) } catch { /* shown below */ }
  }
  return <Box title="Last sent">
    {last.map((r) => <Line key={r.id} minutes={minutesSince(r.arrived_at)}
      action={r.band === 'waiting' && r.status === 'waiting' && !r.seen_at && can('write:crossed_out')
        ? <RowButton disabled={visits.cancel.isPending} title="Checked in by mistake: cancel this visit" onClick={() => void undo(r)}>Undo</RowButton> : undefined}>
      <span className="truncate">{fullName(r.patient)}</span><span className="shrink-0 text-neutral-500">→ {r.clinic.name}</span><Urgent priority={r.priority} /></Line>)}
    <Failed error={visits.cancel.error} />
  </Box>
}
