// The Schedule tab's inline cards (spec/openCare.md §5.6), each folded out under the week's table, never over it. Add a patient: who
// (one search), Sat · Mon · Wed or Sun · Tue · Thu, the shift, the chair (one taken on that pattern and shift is off, and says so), from
// when, a note; a chair that does not fit the patient's HBV or HCV isolation is shown in amber, never a stop. A patient's cell: move this
// one session to another day, shift or chair (with a reason), or take it off that day, or end the slot from a day; a moved session's
// cell: its reason, and Undo; and the patient's standing prescription, which the dialysis doctor writes or changes there. Every change
// of the schedule goes through the pack's one door (haemodialysis.plan); a refusal's words show under it.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { usePatientSearch } from '@core/hooks/reads'
import type { Department, PatientBanner, PatientHit, Place } from '@core/db/types'
import { Button, Chip, Input, Kbd, PatientLine, SearchInput, errorText } from '@core/ui'
import { DAYS, addDays, dayDate, type Days } from './days'
import { useIsolation, usePlan } from './hooks'
import { RxCard } from './RxCard'
import { chairWarning, keptFor, shiftWords, type Unit } from './unit'
import { nameOf, patternTaken, taken, undoBlocked, type Cell, type Week } from './week'
import { REFUSALS } from './words'

const LABEL = 'text-12 font-medium text-muted'
const daysWords = (d: Days) => DAYS.find(([k]) => k === d)?.[1] ?? d

/** an HBV or HCV chair that does not fit: amber words with the glyph, never a stop */
export function Warn({ text }: { text: string | null }) {
  return text ? <p className="flex items-center gap-1.5 text-13 text-warn"><TriangleAlert aria-hidden className="size-3.5 shrink-0" />{text}</p> : null
}
function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5"><span className={`${LABEL} w-16 shrink-0`}>{label}</span>{children}</div>
}
function Refused({ e }: { e: unknown }) { return e ? <p role="alert" className="text-13 text-danger">{errorText(e)}</p> : null }
function Head({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return <div className="flex items-start gap-2"><div className="grid min-w-0 flex-1 gap-1">{children}</div>
    <button type="button" onClick={onCancel} aria-label="Close" className="inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
}
const keys = (onCancel: () => void, go?: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
  if (go && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go() }
}

/** the shifts as chips */
function Shifts({ unit, value, onChange }: { unit: Unit; value: number; onChange: (n: number) => void }) {
  return <>{unit.shifts.map((_, i) => <Chip key={i} on={value === i + 1} onClick={() => onChange(i + 1)}>{shiftWords(unit, i + 1)}</Chip>)}</>
}
/** the chairs as chips, each with what it is kept for; one taken is off and says "taken" (never the fading alone) */
function Chairs({ chairs, unit, value, onChange, off }: { chairs: Place[]; unit: Unit; value: string | null; onChange: (id: string) => void; off: (c: Place) => boolean }) {
  return <>{chairs.map((c) => { const kept = keptFor(c, unit); const no = off(c)
    return <Chip key={c.id} on={value === c.id} disabled={no} onClick={() => onChange(c.id)}>
      {c.name}{kept && <span className={value === c.id ? '' : 'text-faint'}>kept for {kept.toUpperCase()}</span>}{no && <span>· taken</span>}</Chip> })}</>
}

type Common = { dept: Pick<Department, 'id'>; unit: Unit; chairs: Place[]; week: Week; onDone: (said: string) => void; onCancel: () => void }

/** Add a patient: a standing slot from a day */
export function AddCard({ dept, unit, chairs, week, preset, onDone, onCancel }: Common & { preset?: { chair?: string; days?: Days; shift?: number } }) {
  const [q, setQ] = useState(''); const [who, setWho] = useState<PatientHit | null>(null)
  const [days, setDays] = useState<Days | null>(preset?.days ?? null); const [shift, setShift] = useState(preset?.shift ?? 1)
  const [chair, setChair] = useState<string | null>(preset?.chair ?? null)
  const [from, setFrom] = useState(week.today); const [note, setNote] = useState('')
  const hits = usePatientSearch(null, q); const list = q.trim().length >= 2 ? (hits.data ?? []).slice(0, 8) : []
  const iso = useIsolation(dept, who?.id ?? null)
  const plan = usePlan(dept)
  const off = (c: Place) => !!days && patternTaken(week, c.id, days, shift, from)
  const place = chairs.find((c) => c.id === chair)
  const warn = who && place && !iso.pending ? chairWarning(iso.iso, keptFor(place, unit), place.name) : null
  // the isolation is waited for (so its warning is seen before Add), never a stop: a failed read says so and Add stays on
  const ready = !!who && !!days && !!place && !off(place) && !!from && !iso.pending && !plan.isPending
  const add = () => {
    if (!ready) return
    plan.mutate({ do: 'add', patient_id: who.id, days, shift, place_id: place.id, starts_on: from, ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: () => onDone(`${nameOf(who)} · ${daysWords(days)} · ${shiftWords(unit, shift)} · ${place.name} from ${dayDate(from)}`) })
  }
  return <div className="grid gap-3" onKeyDown={keys(onCancel, add)}>
    <Head onCancel={onCancel}><p className="text-14 font-semibold text-fg">Add a patient</p>
      <p className="text-12 text-faint">A standing slot: the same chair and shift on each day of the pattern, from a day, until it is ended.</p></Head>
    <Line label="Who">{who ? <span className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-14"><PatientLine p={who} />
        <button type="button" onClick={() => setWho(null)} className="rounded-sm text-12 text-accent hover:underline focus-ring">Change</button></span>
      : <div className="grid min-w-0 flex-1 gap-1"><SearchInput autoFocus value={q} onChange={setQ} placeholder="Find the patient: name, phone or record number" />
        <ul aria-label="Patients found" className="grid">{list.map((p) => <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover">
          <PatientLine p={p} className="min-w-0 flex-1" /><Button size="xs" variant="outline" onClick={() => setWho(p)}>Choose</Button></li>)}
          {q.trim().length >= 2 && hits.isSuccess && !list.length && <li className="px-2 py-1 text-13 text-faint">Nobody found — register them at the desk first.</li>}</ul></div>}</Line>
    <Line label="Days">{DAYS.map(([d, w]) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{w}</Chip>)}</Line>
    <Line label="Shift"><Shifts unit={unit} value={shift} onChange={setShift} /></Line>
    <Line label="Chair"><Chairs chairs={chairs} unit={unit} value={chair} onChange={setChair} off={off} /></Line>
    <Line label="From"><Input type="date" dense value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="w-40" />
      <Input dense value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional)" aria-label="Note" className="min-w-0 flex-1" /></Line>
    <Warn text={warn} />
    {who && iso.pending && <p className="text-13 text-faint">Reading the patient's isolation…</p>}
    {who && iso.failed && <Warn text="Isolation alerts could not be read: check the chart" />}
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={add} disabled={!ready} loading={plan.isPending}>Add<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    <Refused e={plan.error} />
  </div>
}

type Filled = Extract<Cell, { kind: 'slot' | 'away' | 'in' }>
/** a patient's cell: move this one session, take it off the day, or end the slot; a moved one: its reason, and Undo */
export function SlotCard({ dept, unit, chairs, week, cell, on, names, onDone, onCancel }: Common & { cell: Filled; on: string; names: Record<string, PatientBanner> | undefined }) {
  const plan = usePlan(dept)
  const [to, setTo] = useState<string | null>(null); const slot = cell.kind === 'in' ? week.slots.find((s) => s.id === cell.move.slot_id) : cell.slot
  const [shift, setShift] = useState(cell.kind === 'in' ? cell.move.shift ?? 1 : cell.slot.shift)
  const [chair, setChair] = useState<string | null>(cell.kind === 'in' ? cell.move.place_id ?? null : cell.slot.place_id)
  const [reason, setReason] = useState(''); const [ends, setEnds] = useState(week.today)
  const [err, setErr] = useState<{ at: string; e: unknown } | null>(null)
  const pid = cell.kind === 'in' ? cell.move.patient_id : cell.slot.patient_id; const name = nameOf(names?.[pid])
  const chairName = (id: string | undefined) => chairs.find((c) => c.id === id)?.name ?? 'a chair'
  const run = async (at: string, args: Record<string, unknown>, said: string) => {
    setErr(null)
    try { await plan.mutateAsync(args); onDone(`${name} · ${said}`) } catch (e) { setErr({ at, e }) }
  }
  const why = reason.trim()
  const inWeek = (d: string) => d >= week.from && d <= addDays(week.from, 6)
  const ahead = Array.from({ length: 15 }, (_, i) => addDays(week.today, i))
  // a chair taken that day and shift is off (within the week read; the server checks the rest), the chosen one too
  const off = (c: Pick<Place, 'id'> | string) => !!to && inWeek(to) && taken(week, c, to, shift)
  const target = chairs.find((c) => c.id === chair)
  // the chair moved to against the patient's HBV or HCV isolation: shown before Move, never a stop
  const moveWarn = cell.kind === 'slot' && target && target.id !== cell.slot.place_id ? chairWarning(week.isolation[pid] ?? [], keptFor(target, unit), target.name) : null
  const move = () => { if (cell.kind === 'slot' && to && chair && why && !off(chair)) void run('move', { do: 'move', slot_id: cell.slot.id, patient_id: pid, from_on: on, to_on: to, shift, place_id: chair, reason: why },
    `${dayDate(on)} moved to ${dayDate(to)} · ${shiftWords(unit, shift)} · ${chairName(chair)}`) }
  const busy = plan.isPending
  const blocked = cell.kind === 'slot' ? null : undoBlocked(week, cell.move)
  const head = slot ? [name, daysWords(slot.days), shiftWords(unit, slot.shift), chairName(slot.place_id), `since ${dayDate(slot.starts_on)}`].join(' · ')
    : cell.kind === 'in' && cell.move.from_on ? `${name} · moved from ${dayDate(cell.move.from_on)}` : `${name} · an extra session`
  return <div className="grid gap-3" onKeyDown={keys(onCancel)}>
    <Head onCancel={onCancel}>
      <p className="text-14 font-semibold text-fg">{head}{slot?.ends_on && <span className="font-normal text-muted"> · until {dayDate(slot.ends_on)}</span>}</p>
      {slot?.note && <p className="text-12 text-muted">{slot.note}</p>}
      <Warn text={cell.kind === 'away' ? null : cell.warn} /></Head>
    <RxCard dept={dept} patientId={pid} />
    {cell.kind === 'slot' ? <>
      <div className="grid gap-3" onKeyDown={keys(onCancel, move)}>
        <p className={LABEL}>Move this session ({dayDate(on)})</p>
        <Line label="To">{ahead.map((d) => <Chip key={d} on={to === d} onClick={() => setTo(d)}>{dayDate(d)}</Chip>)}</Line>
        <Line label="Shift"><Shifts unit={unit} value={shift} onChange={setShift} /></Line>
        <Line label="Chair"><Chairs chairs={chairs} unit={unit} value={chair} onChange={setChair} off={off} /></Line>
        <Warn text={moveWarn} />
        <Line label="Reason"><Input dense value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why, for this session only" aria-label="Reason" className="min-w-0 flex-1" /></Line>
        <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={move} disabled={!to || !chair || off(chair) || !why || busy}>Move<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
          <Button size="sm" variant="outline" disabled={!why || busy} onClick={() => void run('off', { do: 'move', slot_id: cell.slot.id, patient_id: pid, from_on: on, reason: why }, `off ${dayDate(on)}`)}>Off this day</Button>
          <span className="text-12 text-faint">One session only: the pattern stays.</span></div>
        {err && (err.at === 'move' || err.at === 'off') && <Refused e={err.e} />}
      </div>
      <p className={LABEL}>End the slot</p>
      {cell.slot.ends_on ? <p className="text-13 text-faint">The slot ends {dayDate(cell.slot.ends_on)}.</p>
        : <Line label="Last day"><Input type="date" dense value={ends} onChange={(e) => setEnds(e.target.value)} aria-label="Its last day" className="w-40" />
          <Button size="sm" variant="outline" disabled={!ends || busy} onClick={() => void run('end', { do: 'end', slot_id: cell.slot.id, ends_on: ends }, `the slot ends ${dayDate(ends)}`)}>End the slot</Button>
          <span className="text-12 text-faint">A change of chair, days or shift: end this one, then add the new one.</span></Line>}
      {err?.at === 'end' && <Refused e={err.e} />}
    </> : <>
      <p className="text-13 text-fg">{cell.kind === 'away' ? (cell.move.to_on ? `Moved from ${dayDate(on)} to ${dayDate(cell.move.to_on)} · ${shiftWords(unit, cell.move.shift ?? 1)} · ${chairName(cell.move.place_id)}`
          : `Off ${dayDate(on)}, not made up`) : `${cell.move.from_on ? `Moved here from ${dayDate(cell.move.from_on)}` : 'An extra session'} · ${dayDate(on)} only`}
        <span className="text-muted"> · {cell.move.reason}</span></p>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={busy || !!blocked} onClick={() => void run('undo', { do: 'undo', move_id: cell.move.id }, 'the move undone')}>Undo the move</Button>
        {blocked && <span className="text-13 text-muted">{REFUSALS[blocked]}: move the other session first.</span>}</div>
      {err?.at === 'undo' && <Refused e={err.e} />}
    </>}
  </div>
}
