// The Schedule tab (haemodialysis.schedule, spec/openCare.md §5.6): the unit's standing schedule, one shift at a time, this week or next —
// a row a chair, a column a day Saturday … Thursday; each cell the patient, "free", or "kept for HBV". A moved session reads struck
// through ("moved to Thu") in its old cell and "this week only" in its new one; a patient in a chair that does not fit their HBV or HCV
// isolation shows the amber glyph, never a stop. Add a patient, or a patient's cell, folds its card out under the table (PlanCards).
import { useMemo, useState, type ReactNode } from 'react'
import { TriangleAlert, UserPlus } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, ScreenFrame, Spinner, Tag, cn, errorText, hm } from '@core/ui'
import { addDays, dayDate, daysOf, dowOf, todayIn, weekDays, weekOf, type Days } from './days'
import { usePatients, useWeek } from './hooks'
import { AddCard, SlotCard } from './PlanCards'
import { chairsOf, shiftNow, shiftWords, unitOf } from './unit'
import { awayWords, grid, inWords, nameOf, slotCount, type Cell } from './week'

type Open = { kind: 'add'; preset?: { chair?: string; days?: Days; shift?: number } } | { kind: 'cell'; chair: string; on: string } | null

export function Schedule({ dept }: ScreenProps) {
  const { org, can } = useDepartment()
  const unit = useMemo(() => unitOf(org, dept.id), [org, dept.id])
  const chairs = useMemo(() => chairsOf(org, dept.id), [org, dept.id])
  const today = todayIn()
  // the week to plan: this one, from its Saturday (on a Friday, the week to come: the Friday is in no pattern)
  const home = dowOf(today) === 5 ? addDays(weekOf(today), 7) : weekOf(today)
  const [from, setFrom] = useState(home)
  const [picked, setShift] = useState(() => Math.max(1, shiftNow(unit, hm(new Date().toISOString()))))
  const shift = Math.min(picked, unit.shifts.length)
  const [open, setOpen] = useState<Open>(null); const [said, setSaid] = useState<string | null>(null)
  const q = useWeek(dept, from); const week = q.week
  const names = usePatients(dept.id, week?.patient_ids ?? [])
  const may = can('write:haemodialysis.schedule')
  const rows = useMemo(() => week ? grid(week, shift, chairs, unit) : [], [week, shift, chairs, unit])
  const name = (pid: string) => names.data?.[pid] ? nameOf(names.data[pid]) : names.isFetching ? '…' : nameOf(undefined)
  const toggle = (next: Open) => { setSaid(null); setOpen(JSON.stringify(open) === JSON.stringify(next) ? null : next) }
  const done = (words: string) => { setOpen(null); setSaid(words) }
  const opened = open?.kind === 'cell' ? rows.find((r) => r.chair.id === open.chair)?.cells.find((c) => c.on === open.on)?.cell : undefined
  const filled = opened && (opened.kind === 'slot' || opened.kind === 'away' || opened.kind === 'in') ? opened : null

  const cell = (chair: string, on: string, c: Cell): ReactNode => {
    if (c.kind === 'kept') return <span className="text-12 text-muted">kept for {c.kept.toUpperCase()}</span>
    if (c.kind === 'free') return may
      ? <button type="button" onClick={() => toggle({ kind: 'add', preset: { chair, days: daysOf(on) ?? undefined, shift } })} className="rounded-sm text-13 text-accent hover:underline focus-ring">free</button>
      : <span className="text-13 text-faint">free</span>
    const pid = c.kind === 'in' ? c.move.patient_id : c.slot.patient_id
    const warn = c.kind === 'away' ? null : c.warn
    const body = <span className="grid gap-0.5 text-start" title={warn ?? undefined}>
      <span className="flex items-center gap-1"><span className={cn('truncate text-13', c.kind === 'away' ? 'text-muted line-through' : 'text-fg')}>{name(pid)}</span>
        {warn && <><TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" /><span className="sr-only">{warn}</span></>}</span>
      {c.kind === 'away' && <span className="text-12 text-faint">{awayWords(c.move)}</span>}
      {c.kind === 'in' && <Tag tone="info">{inWords}</Tag>}</span>
    const on_ = open?.kind === 'cell' && open.chair === chair && open.on === on
    return may ? <button type="button" aria-expanded={on_} onClick={() => toggle({ kind: 'cell', chair, on })}
      className={cn('w-full rounded-md px-1 py-0.5 hover:bg-hover focus-ring', on_ && 'rail bg-hover')}>{body}</button> : body
  }

  // the columns are the week the cells were drawn from (never the chip's next week over the last one's patients)
  const days = week ? weekDays(week.from) : weekDays(from)
  const toWeek = (sat: string) => { setOpen(null); setFrom(sat) }
  return <ScreenFrame views={[{ id: 'week', label: 'The week', count: week ? slotCount(week) : undefined }]} view="week" onView={() => {}}
    filters={<span className="flex flex-wrap items-center gap-1.5">
      {unit.shifts.map((_, i) => <Chip key={i} shape="pill" on={shift === i + 1} onClick={() => setShift(i + 1)}>{shiftWords(unit, i + 1)}</Chip>)}
      <span className="mx-1 h-6 w-px bg-line" />
      <Chip shape="pill" on={from === home} onClick={() => toWeek(home)}>This week</Chip>
      <Chip shape="pill" on={from === addDays(home, 7)} onClick={() => toWeek(addDays(home, 7))}>Next week</Chip></span>}
    action={may && <Button size="sm" variant="outline" aria-expanded={open?.kind === 'add'} onClick={() => toggle({ kind: 'add' })}><UserPlus />Add a patient</Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {!org ? <Spinner label="Reading the unit" />
      : !chairs.length ? <Card><Empty>No chairs yet — add them in Settings.</Empty></Card>
      : q.isLoading ? <Spinner label="Reading the week" />
      : q.error || !week ? <Callout tone="danger" title="Not loaded">{q.error ? errorText(q.error) : 'The week could not be read'}</Callout>
      : <>
        <Card className="overflow-x-auto"><table className="w-full min-w-[42rem] table-fixed text-13">
          <thead><tr className="border-b border-line text-12">
            <th scope="col" className="w-32 px-3 py-2 text-start font-semibold text-fg">{shiftWords(unit, shift)}</th>
            {days.map((d) => <th key={d} scope="col" className={cn('px-2 py-2 text-start font-medium', d === week.today ? 'text-accent' : 'text-faint')}>{dayDate(d)}{d === week.today && ' · today'}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.chair.id} className="border-t border-line">
            <th scope="row" className="px-3 py-1.5 text-start font-medium text-fg">{r.chair.name}{r.chair.closed && <span className="ms-1 text-12 font-normal text-faint">closed</span>}</th>
            {r.cells.map((x) => <td key={x.on} className="px-1.5 py-1 align-top">{cell(r.chair.id, x.on, x.cell)}</td>)}</tr>)}</tbody></table></Card>
        {open?.kind === 'add' && <Card className="p-4 ring-1 ring-accent-line"><AddCard key={JSON.stringify(open.preset ?? {})} dept={dept} unit={unit} chairs={chairs} week={week}
          preset={open.preset ?? { shift }} onDone={done} onCancel={() => setOpen(null)} /></Card>}
        {open?.kind === 'cell' && filled && <Card className="p-4 ring-1 ring-accent-line"><SlotCard key={`${open.chair}|${open.on}|${shift}`} dept={dept} unit={unit} chairs={chairs}
          week={week} cell={filled} on={open.on} names={names.data} onDone={done} onCancel={() => setOpen(null)} /></Card>}
        <p className="text-12 text-faint">A row a chair: one patient on Sat · Mon · Wed, another on Sun · Tue · Thu, at this shift. A move changes one session, never the pattern.</p>
      </>}
  </ScreenFrame>
}
