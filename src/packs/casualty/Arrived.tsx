// Arrived (spec/openCare.md §5.6): the card under the Patients tab's toolbar, inline, never over the list. Who (one search, New
// patient, or Unknown patient: "Unknown man", "Unknown woman" or "Unknown patient", the age only as a year, estimated), how they came
// (the ambulance's call number with it) and what brings them in a few words. Arrived writes the base's admitted with no place: the
// patient sits in the chairs, and the triage card opens for them, carrying how they came. Esc cancels.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { savePatient, write } from '@core/db/rpc'
import { newId } from '@core/db/entries'
import type { Department, PatientHit } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { usePatientSearch, useStays } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { NewPatient } from '@core/shell/NewPatient'
import { Button, Card, Chip, Field, Input, NumberInput, PatientLine, SearchInput, errorText, ymd } from '@core/ui'
import { ARRIVALS, arrivedSet, type Arrival } from './triage'
import { Group } from './TriageCard'

type Who = { id: string; hit?: PatientHit; name?: string } | null
type Sex = 'male' | 'female' | 'unknown'
const SEXES: [Sex, string, string][] = [['male', 'Man', 'Unknown man'], ['female', 'Woman', 'Unknown woman'], ['unknown', 'Not known', 'Unknown patient']]

export function Arrived({ dept, onArrived, onCancel }: { dept: Department; onArrived: (stay: string, arrival: Arrival | null, ref?: string) => void; onCancel: () => void }) {
  const { org, can } = useDepartment(); const qc = useQueryClient()
  const [q, setQ] = useState(''); const [mode, setMode] = useState<'find' | 'new' | 'unknown'>('find'); const [who, setWho] = useState<Who>(null)
  const [sex, setSex] = useState<Sex>('unknown'); const [age, setAge] = useState<number | null>(null)
  const [arrival, setArrival] = useState<Arrival | null>(null); const [ref, setRef] = useState(''); const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const hits = usePatientSearch(org?.organization.id ?? null, mode === 'find' && !who ? q : '')
  const here = new Set((useStays(dept.id).data?.rows ?? []).map((r) => r.patient_id))
  const manage = can('manage:patients')
  if (!org) return null
  const already = !!who && here.has(who.id)
  const ready = (mode === 'unknown' || !!who) && !already && !busy

  async function arrive() {
    setBusy(true); setErr(null)
    try {
      let id = who?.id
      if (mode === 'unknown') {
        id = newId(); const words = SEXES.find(([k]) => k === sex)![2]
        const year = Number(ymd(new Date().toISOString()).slice(0, 4))   // the clinic's year, as the card's age reads it
        const born = age !== null ? { birth_date: `${year - age}-01-01`, birth_precision: 'year', birth_estimated: true } : {}
        await savePatient({ department_id: dept.id, patient: { id, anonymous: true, full_name: words, gender: sex, ...born } })
        setWho({ id, name: words }); setMode('find')   // registered: a retry arrives this one, never a second
      }
      const set = arrivedSet(id!, dept.id, arrival, reason)
      await write(set); refresh(qc)
      onArrived(set.entries[0].id, arrival, arrival === 'ambulance' ? ref.trim() || undefined : undefined)
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  return <Card className="grid gap-3 p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-14 font-semibold">Arrived</h2>
      {manage && !who && <span className="ms-auto flex gap-1.5">
        <Chip on={mode === 'new'} onClick={() => setMode(mode === 'new' ? 'find' : 'new')}>New patient</Chip>
        <Chip on={mode === 'unknown'} onClick={() => setMode(mode === 'unknown' ? 'find' : 'unknown')}>Unknown patient</Chip></span>}</div>
    {who ? <div className="flex flex-wrap items-center gap-2">
      {who.hit ? <PatientLine p={who.hit} /> : <span className="text-13 font-medium">{who.name}</span>}
      <Button size="xs" variant="ghost" onClick={() => { setWho(null); setErr(null) }}>Change</Button>
      {already && <span className="text-13 text-danger">Already admitted — on the list</span>}</div>
    : mode === 'find' ? <div className="grid gap-1.5">
      <SearchInput value={q} onChange={setQ} autoFocus placeholder="Who arrived? Name, phone or record number" />
      {q.trim().length >= 2 && <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md ring-1 ring-line">
        {(hits.data ?? []).map((p) => <li key={p.id} className="flex items-center gap-2 px-2 py-1"><PatientLine p={p} />
          <Button size="xs" variant="outline" className="ms-auto" onClick={() => setWho({ id: p.id, hit: p })}>Choose</Button></li>)}
        {hits.data?.length === 0 && <li className="px-2 py-1 text-13 text-faint">No one matches{manage ? ' — New patient or Unknown patient' : ''}.</li>}</ul>}
    </div>
    : mode === 'new' ? <NewPatient seed={q} orgId={org.organization.id} onDone={(p) => { setWho({ id: p.id, hit: p }); setMode('find') }} onCancel={() => setMode('find')} />
    : <div className="flex flex-wrap items-center gap-3">
      <span className="flex gap-1.5" role="group" aria-label="Sex">{SEXES.map(([k, l]) => <Chip key={k} on={sex === k} onClick={() => setSex(k)}>{l}</Chip>)}</span>
      <span className="flex items-center gap-1.5 text-13 text-muted">about <NumberInput value={age} onValue={setAge} integer dense label="Age in years" className="w-16" /> years</span>
      <span className="text-12 text-faint">{SEXES.find(([k]) => k === sex)![2]}{age !== null ? `, about ${age}` : ''}: the record number tells them apart</span></div>}
    <Group label="How they came"><span className="flex flex-wrap gap-1.5">{ARRIVALS.map(([k, l]) =>
      <Chip key={k} on={arrival === k} onClick={() => setArrival(arrival === k ? null : k)}>{l}</Chip>)}</span></Group>
    {arrival === 'ambulance' && <Field label="Ambulance call"><Input value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} placeholder="Call number" className="w-40" /></Field>}
    <Field label="What brings them (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="In a few words" /></Field>
    {err && <p className="text-13 text-danger">{err}</p>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button disabled={!ready} loading={busy} onClick={() => void arrive()}>Arrived</Button></div>
  </Card>
}
