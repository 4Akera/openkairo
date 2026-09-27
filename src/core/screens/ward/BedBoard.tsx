import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../../hooks/organization'
import { usePatientSearch, useStays } from '../../hooks/reads'
import { newId, useWrite } from '../../hooks/writes'
import { move, oneSet } from '../../db/entries'
import { banner } from '../../db/views'
import type { Department, Identity, Place, PresenceRow, TableRead } from '../../db/types'
import { startOf } from '../chart/model/encounter'
import { Badge, Button, Card, Input, Select, Spinner, cn, errorText, shortDate } from '../../ui'
import { DISPOSITION } from './words'

type Open = { bed: string; what: 'admit' | 'move' | 'discharge' } | null

/** A ward's home (spec/openCare.md §4.2): its beds, who is in each since when; admit to a free bed, move, discharge — each one entry
 *  that changes the stay's latest version, so two people moving one patient at once are told to look again. */
export function BedBoard({ dept }: { dept: Department }) {
  const { org, can } = useDepartment()
  const stays = useStays(dept.id)
  const w = useWrite()
  const [open, setOpen] = useState<Open>(null)
  if (!org) return null
  const beds = org.places.filter((p) => p.department_id === dept.id).sort((a, b) => a.position - b.position)
  const inBed = new Map((stays.data?.rows ?? []).map((r) => [r.place_id ?? '', r]))
  const noBed = (stays.data?.rows ?? []).filter((r) => !r.place_id || !beds.some((b) => b.id === r.place_id))
  const free = beds.filter((b) => !b.closed && !inBed.has(b.id))
  const may = can('write:admitted')
  const done = { onSuccess: () => setOpen(null) }
  return <div className="mx-auto grid max-w-5xl gap-3 p-4">
    <div className="flex flex-wrap items-baseline gap-x-3">
      <h1 className="text-18 font-semibold tracking-tight">{dept.name}</h1>
      <p className="text-14 text-faint tnum">{inBed.size} in · {free.length} free{beds.some((b) => b.closed) ? ` · ${beds.filter((b) => b.closed).length} closed` : ''}</p>
      {w.error && <p className="ml-auto text-14 text-danger">{errorText(w.error)}</p>}
    </div>
    {stays.isLoading ? <Spinner /> : beds.length === 0 ? <Card className="p-4 text-14 text-faint">No beds yet — add them in Settings.</Card>
    : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{beds.map((b) => { const r = inBed.get(b.id); const here = open?.bed === b.id ? open.what : null
      return <Card key={b.id} className={cn('grid gap-2 p-3', b.closed && 'opacity-60')}>
        <div className="flex items-center gap-2"><span className="text-14 font-semibold">{b.name}</span>{b.closed && <Badge>closed</Badge>}
          {!r && !b.closed && may && !here && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen({ bed: b.id, what: 'admit' })}>Admit</Button>}</div>
        {r && <Occupant row={r} read={stays.data!} />}
        {r && !here && may && <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen({ bed: b.id, what: 'move' })} disabled={!free.length}>Move</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen({ bed: b.id, what: 'discharge' })}>Discharge</Button></div>}
        {here === 'admit' && <Admit bed={b} onCancel={() => setOpen(null)} busy={w.isPending}
          onAdmit={(patientId, reason) => { const id = newId(); w.mutate(oneSet([{ id, type: 'admitted', patient_id: patientId, department_id: dept.id, visit_id: id, data: { admit_source: 'outp', place_id: b.id, ...(reason ? { reason } : {}) } }]), done) }} />}
        {here === 'move' && r && <Choose label="To" options={free.map((x) => [x.id, x.name])} go="Move" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(place) => w.mutate(oneSet([move('moved', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { place_id: place })]), done)} />}
        {here === 'discharge' && r && <Choose label="To" options={DISPOSITION} go="Discharge" busy={w.isPending} onCancel={() => setOpen(null)}
          onGo={(disposition) => w.mutate(oneSet([move('discharged', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { disposition })]), done)} />}
      </Card> })}</div>}
    {noBed.length > 0 && <Card className="grid gap-2 p-3"><p className="text-12 font-medium text-faint">Admitted, no bed here</p>{noBed.map((r) => <Occupant key={r.item} row={r} read={stays.data!} />)}</Card>}
  </div>
}

/** who is in the bed, since the stay's clinical start (the admission as it happened, as the chart dates it) */
function Occupant({ row, read }: { row: PresenceRow; read: TableRead<PresenceRow> }) {
  const navigate = useNavigate(); const i: Identity | undefined = read.patients[row.patient_id]; const p = i ? banner(i) : null
  return <button type="button" onClick={() => navigate(`/visit/${row.item}`)} className="grid text-left hover:underline">
    <span className="text-13 font-medium">{p ? `${p.given_name} ${p.family_name}` : 'Patient'}{p && <span className="ml-1.5 text-12 font-normal text-faint">{p.sex[0]?.toUpperCase()} {p.age}</span>}</span>
    <span className="text-12 text-faint">since {shortDate(startOf(row, read))}{row.reason ? ` · ${row.reason}` : ''}{row.urgent ? ' · urgent' : ''}</span></button>
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
