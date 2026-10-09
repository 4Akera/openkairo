// The bookings pack's client (spec/openCare.md §5.7): its two screens — Booked today at a desk (with Tomorrow's calls and Missed) and the
// Diary of a clinic or a bench — its settings' own editors (the sessions and leave; what to tell the patient), /book in the consult
// (saved at Done by its own door, core change (k)), and, on the lists of a department that uses it: Book on the desk's patient card and
// on a bench's order (core changes (i), (a)), a booked patient's place in the queue and the bench's To do (h), its words on a row and on
// the doctor's order line (l), the bench's To book (m), the walk-in's Then · when (j); the chart's Next visit. A booking is the pack's own
// row, never a record entry: everything here reads and writes through the pack's door.
import { useState } from 'react'
import { registerScreen } from '@core/screens/registry'
import { registerWords } from '@core/db/words'
import { registerRenderer } from '@core/renderers'
import { registerSettingEditor } from '@core/screens/settings/form/registry'
import { registerCard, registerCommand, registerDraftSave } from '@core/screens/visit/commands'
import { registerBenchView, registerOrderWords, registerRowAction, registerRowPlace, type PackRow, type RowActionCardProps, type RowCtx } from '@core/screens/rows'
import { registerWalkInPart } from '@core/screens/bench/WhatFor'
import { ANYONE, registerSection, type SectionBody } from '@core/screens/chart/sections'
import type { Department } from '@core/db/types'
import { Button, Callout, Empty, Spinner, Tag } from '@core/ui'
import { bookable, dayWords, placeWords, places, sessionsOf, todayOf, useBookings } from './api'
import { groupOf, placeOfRow, toBook, wordsOfRow, type Places } from './logic'
import { BookCard } from './BookCard'
import { BookEditor, bookLine, parseBook, saveBook } from './Consult'
import { Diary } from './Diary'
import { SessionsEditor, TellEditor } from './Settings'
import { Today } from './Today'
import { WalkInWhen, walkInAfter, walkInStart } from './WalkIn'
import { REFUSALS } from './words'

export const key = 'bookings'
registerScreen('bookings.today', Today)
registerScreen('bookings.diary', Diary, (dept, org) => sessionsOf(org, dept.id).length > 0 || dept.work !== 'bench')
registerWords(REFUSALS)
registerSettingEditor('bookings.sessions', SessionsEditor)
registerSettingEditor('bookings.tell', TellEditor)

// /book in the consult: a card under the line, saved at Done through the pack's door (never a record entry)
registerCommand({ name: 'book', label: 'Book the next visit', example: '/book 3m', action: 'write:bookings.booking', pack: key, title: 'Next visit',
  groupTitle: 'Bookings', parse: parseBook, empty: () => [{ function: 'bookings.book', params: { in: 7 }, line: 'Next visit in 1 week', kind: 'Next visit', action: 'write:bookings.booking' }] })
registerCard({ function: 'bookings.book', pack: key, Editor: BookEditor, line: bookLine })
registerDraftSave({ function: 'bookings.book', pack: key, save: saveBook })
// the line among the drafts before Done ("Next visit · Wed 6 Jan · No. 1 · re-visit"): never a record entry, so drawn only there
registerRenderer('bookings.book', { Block: ({ data }) => <p className="text-14 text-fg">{bookLine(data)}{typeof data.note === 'string' && data.note.trim() ? <span className="text-muted"> · {data.note.trim()}</span> : null}
  <span className="ms-2 text-12 text-faint">the booking, saved at Done; not a record entry</span></p> })

// the places of a list's rows (one read a few seconds for the place, the words and the view)
const load = (rows: PackRow[], ctx: RowCtx) => places(ctx.dept.id, [...new Set(rows.flatMap((r) => r.visit_id ? [r.visit_id] : []))],
  [...new Set(rows.flatMap((r) => r.orders.map((o) => o.item)))])
const tzOf = (ctx: RowCtx) => ctx.org?.organization.time_zone
/** this department as the card books from it */
const deptOf = (ctx: RowCtx): Department | undefined => ctx.org?.allDepartments.find((d) => d.id === ctx.dept.id)
// (i) Book on the desk's patient card; (a) Book (or Book again) on a bench's order to book
registerRowAction(key, {
  load: (rows, ctx) => ctx.list === 'bench' ? load(rows, ctx) : Promise.resolve(null),
  button: (row, ctx, data) => {
    if (!ctx.can('write:bookings.booking')) return null
    if (ctx.list === 'card') { const d = deptOf(ctx); return d && bookable(ctx.org, d).length ? 'Book' : null }
    if (ctx.list === 'bench' && data) { const o = toBook(row, data as Places)[0]; return o ? ((data as Places).orders[o.item]?.state === 'missed' ? 'Book again' : 'Book') : null }
    return null
  },
  Card: RowBook,
})
function RowBook({ row, ctx, data, close }: RowActionCardProps) {
  const d = deptOf(ctx); const p = data as Places | null
  const orders = p ? toBook(row, p) : []; const [i, setI] = useState(0); const o = orders[Math.min(i, Math.max(orders.length - 1, 0))]
  const [said, setSaid] = useState<string | null>(null)
  if (!d) return null
  // booked: the card says so until it is closed (the list reads its places again then)
  if (said) return <div className="flex flex-wrap items-center gap-2"><Callout tone="accent" icon={false} role="status" className="flex-1">✓ {said}</Callout>
    <Button size="sm" variant="ghost" autoFocus onClick={() => close(true)}>Close</Button></div>
  // a bench row whose orders are all booked now (it moved to its new group, so the card opened again there)
  if (ctx.list === 'bench' && !o) return <div className="flex flex-wrap items-center gap-2"><span className="flex-1 text-13 text-muted">Nothing left to book on this row: its booking is on the row.</span>
    <Button size="sm" variant="ghost" autoFocus onClick={() => close(true)}>Close</Button></div>
  const missed = o && p?.orders[o.item]?.state === 'missed' ? p.orders[o.item] : undefined
  return <div className="grid gap-2">
    {orders.length > 1 && <p className="flex flex-wrap gap-1.5 text-13">{orders.map((x, j) => <button key={x.item} type="button" onClick={() => setI(j)}
      className={j === i ? 'rounded-full bg-accent-soft px-2 font-medium text-accent' : 'rounded-full px-2 text-muted hover:text-fg'}>{x.service_name}</button>)}</p>}
    <BookCard from={d} patientId={row.patient_id} key={o?.item ?? 'card'}
      order={o ? { item: o.item, department_id: d.id, service_id: o.service_id, name: o.service_name ?? 'the order' } : undefined}
      moving={missed ? ({ ...missed, patient_id: row.patient_id, note: null, author_id: '', call: null, cancelled: null } as never) : undefined}
      onCancel={() => close(false)} onDone={setSaid} />
  </div>
}

// (h) a booked patient's place: the queue's visit at its booked time or number; a bench's patient at today's booked order
registerRowPlace(key, { load, place: (row, _ctx, data) => placeOfRow(row, data as Places) })

// (l) its words: "booked · No. 5" on a booked patient's queue row; on an order, "booked · Sun 11 Oct 10:00", "missed · Wed 7 Oct"
registerOrderWords(key, { load, words: (row, ctx, data) => wordsOfRow(row, data as Places, tzOf(ctx)) })

// (m) the bench's To book: its orders for a service a session books, not booked yet (or missed), and those booked for a later day
// (a walk-in, started at the bench itself or at a desk, is the patient standing there: Now keeps it in To do)
const walkInOf = (ctx: RowCtx) => (o: { from_department_id: string; to_department_id: string | null }) =>
  o.from_department_id === o.to_department_id || ctx.org?.allDepartments.find((d) => d.id === o.from_department_id)?.work === 'desk'
registerBenchView(key, { label: 'To book', groups: ['To book', 'Booked · coming'], counts: ['To book'], load,
  group: (order, row, ctx, data) => groupOf(order, row, data as Places, walkInOf(ctx)) })

// (j) the walk-in's Then · when, where the bench keeps a diary: Now (always offered), or a time
registerWalkInPart(key, { Part: WalkInWhen, start: walkInStart, after: walkInAfter })

// the chart's Next visit: the patient's bookings from today on, every department's (a word on the chip, a line in the Summary none:
// they are the pack's own rows, read in the section)
function NextVisit({ p }: SectionBody) {
  const q = useBookings(p.departmentId, { patient_id: p.patientId })
  const tz = p.ctx?.org?.organization.time_zone; const today = todayOf(tz)
  if (q.isLoading) return <Spinner label="Reading the bookings" />
  if (q.error) return <Empty size="sm">The bookings are not read here.</Empty>
  const rows = q.data?.bookings ?? []
  if (!rows.length) return <Empty size="sm">No booking ahead.</Empty>
  return <ul className="grid gap-1.5">{rows.map((b) => <li key={b.id} className="flex flex-wrap items-baseline gap-x-2 text-13">
    <span className="font-medium text-fg">{b.day === today ? 'Today' : dayWords(b.day)} · {placeWords(b, tz)}</span>
    <span className="text-muted">{p.ctx?.org?.allDepartments.find((d) => d.id === b.department_id)?.name}{b.service ? ` · ${b.service}` : ''}</span>
    {b.note && <span className="text-12 text-faint">· {b.note}</span>}{b.call?.outcome === 'confirmed' && <Tag tone="ok">confirmed</Tag>}</li>)}</ul>
}
registerSection({ key: 'bookings.next', title: 'Next visit', types: [], fit: ANYONE, word: () => null, Body: NextVisit })
