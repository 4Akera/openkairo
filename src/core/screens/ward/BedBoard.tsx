import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { useLive } from '../../hooks/live'
import { useDepartment } from '../../hooks/organization'
import { usePatientSearch, useStays } from '../../hooks/reads'
import { newId, useWrite } from '../../hooks/writes'
import { move, oneSet } from '../../db/entries'
import { banner, mayIn, userName } from '../../db/views'
import type { Department, Organization, Place, PresenceRow, TableRead } from '../../db/types'
import type { PackData } from '../rows'
import type { ScreenProps } from '../registry'
import { startOf, stayDay } from '../chart/model/encounter'
import { Button, Card, Empty, Input, ScreenFrame, Select, Spinner, errorText, type ScreenView } from '../../ui'
import { DISPOSITION } from './words'
import { BedTile, type Occupant } from './Tile'
import { noBedActions, staysKey, tileActions, tileButtonDefs, tileLineDefs, tileLineOf, tileLoadDefs, type TileAction, type TileCtx } from './tiles'

type Open = { bed: string; what: 'admit' | 'move' | 'discharge' } | null
type View = 'all' | 'in' | 'free' | 'closed'

/** A department's board of places (base.beds, spec/openCare.md §4.2, §5.1 rule 4): one board, the same in every ward, ICU, labour
 *  ward, dialysis unit and ER, whatever packs it uses. Its beds (all, in, free and closed as counted views), each a tile: who is in
 *  it, the packs' line, the base's buttons then the packs'. Admit, move, discharge — each one entry that changes the stay's latest
 *  version, so two people moving one patient at once are told to look again. */
export function BedBoard({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate()
  const stays = useStays(dept.id)
  const w = useWrite()
  const [open, setOpen] = useState<Open>(null); const [view, setView] = useState<View>('all')
  const tileData = useTileData(dept, org, stays.data?.rows)
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
  const views: ScreenView<View>[] = [{ id: 'all', label: 'All beds', count: beds.length }, { id: 'in', label: 'In', count: inBed.size + noBed.length }, { id: 'free', label: 'Free', count: free.length },
    ...(closed.length ? [{ id: 'closed' as const, label: 'Closed', count: closed.length }] : [])]
  const shown = beds.filter((b) => view === 'all' || (view === 'in' ? inBed.has(b.id) : view === 'free' ? free.includes(b) : b.closed))
  const read = stays.data
  const ctxOf = (r: PresenceRow, place: Place | null): TileCtx => ({ dept, place, identity: read?.patients[r.patient_id] ?? null, day: stayDay(startOf(r, read)), can, org })
  const who = (r: PresenceRow): Occupant => occupant(r, read, userName(org, r.assigned_id), () => navigate(`/visit/${r.item}`))
  // a base button opens its form inline; a pack's does its own thing, or opens its path
  const act = (b: Place | null, r: PresenceRow | undefined) => (a: TileAction) => {
    if (a.base) { if (b && !a.off) setOpen({ bed: b.id, what: a.key }); return }
    if (!r) return
    const ctx = ctxOf(r, b)
    const data = Object.hasOwn(tileData, a.def.pack) ? tileData[a.def.pack] : undefined   // its load's answer, once it has answered
    try { if (a.def.onClick) a.def.onClick(r, ctx, data); else if (a.def.path) navigate(a.def.path(r, ctx, data)) } catch (e) { console.error(`openCare: the tile button ${a.key} failed`, e) }
  }
  return <ScreenFrame views={views} view={view} onView={setView} notice={w.error && <p className="text-14 text-danger">{errorText(w.error)}</p>}>
    {stays.isLoading ? <Spinner /> : beds.length === 0 ? <Card><Empty>No beds yet — add them in Settings.</Empty></Card>
    : !shown.length ? (view === 'in' && noBed.length ? null : <Card><Empty>No beds here.</Empty></Card>)
    : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shown.map((b) => { const r = inBed.get(b.id); const here = open?.bed === b.id ? open.what : null
      const taken = r ? { row: r, ctx: ctxOf(r, b) } : null
      return <BedTile key={b.id} name={b.name} closed={b.closed} who={r ? who(r) : null} line={taken ? tileLineOf(tileLineDefs(), taken.row, taken.ctx, tileData) : []}
        actions={here ? null : tileActions(tileButtonDefs(), b, taken, may, tileData)} onAction={act(b, r)} disabled={(a) => a.key === 'move' && !free.length}>
        {here === 'admit' && <Admit bed={b} onCancel={() => setOpen(null)} busy={w.isPending}
          onAdmit={(patientId, reason) => { const id = newId(); w.mutate(oneSet([{ id, type: 'admitted', patient_id: patientId, department_id: dept.id, visit_id: id, data: { admit_source: 'outp', place_id: b.id, ...(reason ? { reason } : {}) } }]), done) }} />}
        {here === 'move' && r && <Choose label="To" options={free.map((x) => [x.id, x.name])} go="Move" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(place) => w.mutate(oneSet([move('moved', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { place_id: place })]), done)} />}
        {here === 'discharge' && r && <Choose label="To" options={DISPOSITION} go="Discharge" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(disposition) => w.mutate(oneSet([move('discharged', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { disposition })]), done)} />}
      </BedTile> })}</div>}
    {noBed.length > 0 && view !== 'free' && view !== 'closed' && <section className="grid gap-2"><p className="text-12 font-medium text-faint">Admitted, no bed here</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{noBed.map((r) => { const taken = { row: r, ctx: ctxOf(r, null) }
        return <BedTile key={r.item} name="No bed" closed={false} who={who(r)} line={tileLineOf(tileLineDefs(), r, taken.ctx, tileData)} actions={noBedActions(tileButtonDefs(), taken, may, tileData)} onAction={act(null, r)} /> })}</div></section>}
  </ScreenFrame>
}

/** what the packs this department uses read for the board, once per board (C1): each its own load, again on the clinic's hints and
 *  when the stays change, never on a timer; a load that fails leaves its pack's words to the row alone */
function useTileData(dept: Department, org: Organization | undefined, rows: PresenceRow[] = []): PackData {
  const defs = tileLoadDefs().filter((d) => dept.packs.includes(d.pack))
  useLive(org && defs.length ? `organization:${org.organization.id}` : null, [['pack-tiles']])
  const key = staysKey(rows)
  const results = useQueries({ queries: defs.map((d) => ({ queryKey: ['pack-tiles', d.pack, dept.id, key],
    queryFn: () => d.load(rows, { dept, org: org!, can: (a: string) => mayIn(org, a, dept.id) }), enabled: !!org && rows.length > 0,
    placeholderData: keepPreviousData, retry: false })) })
  return Object.fromEntries(defs.flatMap((d, i) => !results[i].isError && results[i].data !== undefined ? [[d.pack, results[i].data]] : []))
}

/** who is in the bed, from the stay's row: the day counts from its clinical start (the admission as it happened, as the chart dates it) */
function occupant(row: PresenceRow, read: TableRead<PresenceRow> | undefined, clinician: string | null, onOpen: () => void): Occupant {
  const i = read?.patients[row.patient_id]; const p = i ? banner(i) : null
  return { name: p ? `${p.given_name} ${p.family_name}` : 'Patient', sexAge: p ? `${p.sex[0]?.toUpperCase() ?? ''} ${p.age}`.trim() : '', day: stayDay(startOf(row, read)),
    clinician, reason: row.reason, urgent: row.urgent, onOpen }
}

/** admit to this bed: find the patient, a reason if one is known */
function Admit({ bed, busy, onAdmit, onCancel }: { bed: Place; busy: boolean; onAdmit: (patientId: string, reason: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState(''); const [reason, setReason] = useState(''); const hits = usePatientSearch(null, q)
  return <div className="grid gap-1.5">
    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Who goes to ${bed.name}? Name, phone or number`} autoFocus className="h-8" />
    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="h-8" />
    {q.trim().length >= 2 && <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-md ring-1 ring-line">
      {(hits.data ?? []).map((p) => <li key={p.id}><button type="button" disabled={busy} onClick={() => onAdmit(p.id, reason.trim())} className="w-full px-2 py-1 text-left text-14 hover:bg-hover">#{p.record_number} {p.given_name} {p.family_name} <span className="text-12 text-faint">{p.sex[0]?.toUpperCase()} {p.age}</span></button></li>)}
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
