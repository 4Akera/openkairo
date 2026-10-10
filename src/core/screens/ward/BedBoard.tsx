import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../../hooks/organization'
import { usePatientSearch, useStays } from '../../hooks/reads'
import { newId, useWrite } from '../../hooks/writes'
import { move, oneSet } from '../../db/entries'
import { ageWords, banner, userName } from '../../db/views'
import type { Place, PresenceRow, TableRead } from '../../db/types'
import type { ScreenProps } from '../registry'
import { startOf, stayDay } from '../chart/model/encounter'
import { Button, Card, Empty, Input, ScreenFrame, Select, Spinner, errorText, type ScreenView } from '../../ui'
import { DISPOSITION } from './words'
import { BedTile, type Occupant } from './Tile'
import { noBedActions, tileActions, tileButtonDefs, tileLineDefs, tileLineOf, tileReadsFor, type TileAction, type TileCtx } from './tiles'
import { TileRead } from './TileRead'
import { boardRowsDefs, boardRowsFor, type BoardRow, type BoardRowsDef } from './rows'
import { PackRows } from './PackRows'

type Open = { bed: string; what: 'admit' | 'move' | 'discharge' } | null
type View = 'all' | 'in' | 'free' | 'closed' | `rows:${string}`

/** A department's board of places (base.beds, spec/openCare.md §4.2, §5.1 rule 4): one board, the same in every ward, ICU, labour
 *  ward, dialysis unit and ER, whatever packs it uses. Its beds (all, in, free and closed as counted views), each a tile: who is in
 *  it, the packs' line, the base's buttons then the packs'. Admit, move, discharge — each one entry that changes the stay's latest
 *  version, so two people moving one patient at once are told to look again. */
export function BedBoard({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate()
  const stays = useStays(dept.id)
  const w = useWrite()
  const [open, setOpen] = useState<Open>(null); const [view, setView] = useState<View>('all')
  // the packs' rows under the board (core change C5): each pack's own count, for its view in the toolbar
  const [counts, setCounts] = useState<Record<string, number>>({})
  const onCount = useCallback((pack: string, n: number) => setCounts((c) => c[pack] === n ? c : { ...c, [pack]: n }), [])
  // the packs' reads for their tile lines (core change C7): each pack's own, kept here so the tiles draw again when one changes
  const [reads, setReads] = useState<Record<string, unknown>>({})
  const onRead = useCallback((pack: string, v: unknown) => setReads((r) => r[pack] === v ? r : { ...r, [pack]: v }), [])
  if (!org) return null
  const beds = org.places.filter((p) => p.department_id === dept.id).sort((a, b) => a.position - b.position)
  // who is in each of this ward's beds; a stay with no bed, or a bed not here, is listed apart (and counted with In)
  const inBed = new Map((stays.data?.rows ?? []).filter((r) => beds.some((b) => b.id === r.place_id)).map((r) => [r.place_id!, r]))
  const noBed = (stays.data?.rows ?? []).filter((r) => !r.place_id || !beds.some((b) => b.id === r.place_id))
  const free = beds.filter((b) => !b.closed && !inBed.has(b.id))
  const may = can('write:admitted')
  const done = { onSuccess: () => setOpen(null) }
  // the board's views: every bed, the occupied, the free (and the closed, when any)
  const closed = beds.filter((b) => b.closed)
  const rowDefs = boardRowsFor(boardRowsDefs(), dept)
  const views: ScreenView<View>[] = [{ id: 'all', label: 'All beds', count: beds.length }, { id: 'in', label: 'In', count: inBed.size + noBed.length }, { id: 'free', label: 'Free', count: free.length },
    ...(closed.length ? [{ id: 'closed' as const, label: 'Closed', count: closed.length }] : []),
    ...rowDefs.map((d) => ({ id: `rows:${d.pack}` as const, label: d.view, count: counts[d.pack] ?? 0, needs: 'warn' as const }))]
  const rowsView = view.startsWith('rows:') ? view.slice(5) : null
  const shown = rowsView ? [] : beds.filter((b) => view === 'all' || (view === 'in' ? inBed.has(b.id) : view === 'free' ? free.includes(b) : b.closed))
  // the patients with a stay here are not listed again under the board
  const inHere = new Set((stays.data?.rows ?? []).map((r) => r.patient_id))
  /** a row's Start: the base's admission into the chosen free place, with the pack's own entries in the same set */
  const startRow = (d: BoardRowsDef) => (row: BoardRow, placeId: string, closeRow: () => void) => { const id = newId()
    w.mutate(oneSet([{ id, type: 'admitted', patient_id: row.patientId, department_id: dept.id, visit_id: id, data: { admit_source: 'outp', place_id: placeId, ...(row.reason ? { reason: row.reason } : {}) } },
      ...(d.start?.(row, { id, place_id: placeId, department_id: dept.id }) ?? [])]), { onSuccess: closeRow }) }
  const read = stays.data
  const ctxOf = (r: PresenceRow, place: Place | null): TileCtx => ({ dept, place, identity: read?.patients[r.patient_id] ?? null, day: stayDay(startOf(r, read)), can, org })
  const who = (r: PresenceRow): Occupant => occupant(r, read, userName(org, r.assigned_id), () => navigate(`/visit/${r.item}`))
  // a base button opens its form inline; a pack's does its own thing, or opens its path
  const act = (b: Place | null, r: PresenceRow | undefined) => (a: TileAction) => {
    if (a.base) { if (b && !a.off) setOpen({ bed: b.id, what: a.key }); return }
    if (!r) return
    const ctx = ctxOf(r, b)
    try { if (a.def.onClick) a.def.onClick(r, ctx); else if (a.def.path) navigate(a.def.path(r, ctx)) } catch (e) { console.error(`openCare: the tile button ${a.key} failed`, e) }
  }
  return <ScreenFrame views={views} view={view} onView={setView} notice={w.error && <p className="text-14 text-danger">{errorText(w.error)}</p>}>
    {tileReadsFor(tileLineDefs(), dept).map((d) => <TileRead key={d.pack} def={d} dept={dept} onRead={onRead} />)}
    {stays.isLoading ? <Spinner /> : beds.length === 0 ? <Card><Empty>No beds yet — add them in Settings.</Empty></Card>
    : rowsView ? null : !shown.length ? (view === 'in' && noBed.length ? null : <Card><Empty>No beds here.</Empty></Card>)
    : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shown.map((b) => { const r = inBed.get(b.id); const here = open?.bed === b.id ? open.what : null
      const taken = r ? { row: r, ctx: ctxOf(r, b) } : null
      return <BedTile key={b.id} name={b.name} closed={b.closed} who={r ? who(r) : null} line={taken ? tileLineOf(tileLineDefs(), taken.row, taken.ctx, reads) : []}
        actions={here ? null : tileActions(tileButtonDefs(), b, taken, may)} onAction={act(b, r)} disabled={(a) => a.key === 'move' && !free.length}>
        {here === 'admit' && <Admit bed={b} onCancel={() => setOpen(null)} busy={w.isPending}
          onAdmit={(patientId, reason) => { const id = newId(); w.mutate(oneSet([{ id, type: 'admitted', patient_id: patientId, department_id: dept.id, visit_id: id, data: { admit_source: 'outp', place_id: b.id, ...(reason ? { reason } : {}) } }]), done) }} />}
        {here === 'move' && r && <Choose label="To" options={free.map((x) => [x.id, x.name])} go="Move" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(place) => w.mutate(oneSet([move('moved', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { place_id: place })]), done)} />}
        {here === 'discharge' && r && <Choose label="To" options={DISPOSITION} go="Discharge" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(disposition) => w.mutate(oneSet([move('discharged', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { disposition })]), done)} />}
      </BedTile> })}</div>}
    {noBed.length > 0 && (view === 'all' || view === 'in') && <section className="grid gap-2"><p className="text-12 font-medium text-faint">Admitted, no bed here</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{noBed.map((r) => { const taken = { row: r, ctx: ctxOf(r, null) }
        return <BedTile key={r.item} name="No bed" closed={false} who={who(r)} line={tileLineOf(tileLineDefs(), r, taken.ctx, reads)} actions={noBedActions(tileButtonDefs(), taken, may)} onAction={act(null, r)} /> })}</div></section>}
    {!stays.isLoading && (view === 'all' || rowsView) && rowDefs.filter((d) => !rowsView || d.pack === rowsView).map((d) =>
      <PackRows key={d.pack} def={d} dept={dept} inHere={inHere} free={free} may={may} busy={w.isPending} can={can} onStart={startRow(d)} onCount={onCount} />)}
  </ScreenFrame>
}

/** who is in the bed, from the stay's row: the day counts from its clinical start (the admission as it happened, as the chart dates it) */
function occupant(row: PresenceRow, read: TableRead<PresenceRow> | undefined, clinician: string | null, onOpen: () => void): Occupant {
  const i = read?.patients[row.patient_id]; const p = i ? banner(i) : null
  return { name: p ? `${p.given_name} ${p.family_name}` : 'Patient', sexAge: p ? `${p.sex[0]?.toUpperCase() ?? ''} ${ageWords(p.born_on) || p.age}`.trim() : '', day: stayDay(startOf(row, read)),
    clinician, reason: row.reason, urgent: row.urgent, onOpen }
}

/** admit to this bed: find the patient, a reason if one is known */
function Admit({ bed, busy, onAdmit, onCancel }: { bed: Place; busy: boolean; onAdmit: (patientId: string, reason: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState(''); const [reason, setReason] = useState(''); const hits = usePatientSearch(null, q)
  return <div className="grid gap-1.5">
    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Who goes to ${bed.name}? Name, phone or number`} autoFocus className="h-8" />
    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="h-8" />
    {q.trim().length >= 2 && <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-md ring-1 ring-line">
      {(hits.data ?? []).map((p) => <li key={p.id}><button type="button" disabled={busy} onClick={() => onAdmit(p.id, reason.trim())} className="w-full px-2 py-1 text-left text-14 hover:bg-hover">#{p.record_number} {p.given_name} {p.family_name} <span className="text-12 text-faint">{p.sex[0]?.toUpperCase()} {ageWords(p.born_on) || p.age}</span></button></li>)}
      {hits.data?.length === 0 && <li className="px-2 py-1 text-14 text-faint">No one matches.</li>}</ul>}
    <div><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
  </div>
}

/** one choice inline and its button: a bed to move to, where a discharge goes (the bed board and a stay's own screen) */
export function Choose<V extends string>({ label, options, go, busy, onGo, onCancel }: { label: string; options: [V, string][]; go: string; busy: boolean; onGo: (v: V) => void; onCancel: () => void }) {
  const [v, setV] = useState<V | ''>(options[0]?.[0] ?? '')   // the select offers only the options: its value is one of them
  return <div className="flex flex-wrap items-center gap-1.5 text-14"><span className="text-12 text-faint">{label}</span>
    <Select value={v} onChange={(e) => setV(e.target.value as V)} className="h-8 w-40">{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
    <Button size="sm" disabled={!v || busy} onClick={() => v && onGo(v)}>{go}</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
}
