// The family file at the desk's New patient (spec/openCare.md §5.8, Q49; core change C4; picture #family-checks): join a family file —
// found by its number, the phone or the address, the family's phone typed above tried first — as a wife, a son…; or start a new file at
// this address; or not now. Registered, the pack joins or starts the file through its door, from the desk (which ticks the pack).
import { useEffect, useState } from 'react'
import type { Organization, PatientHit } from '@core/db/types'
import type { NewPatientStepProps } from '@core/shell/newPatientSteps'
import { useDepartment } from '@core/hooks/organization'
import { Chip, Input, cn } from '@core/ui'
import { RELATIONS, joinFile, startFile, useFiles } from './data'
import { PACK, askAtNewPatient, type StepValue } from './checks'

export const showStep = (org: Organization) => askAtNewPatient(org)
export async function afterStep(v: unknown, p: PatientHit): Promise<string | null> {
  const s = v as StepValue
  if (s?.mode === 'join') { await joinFile(s.dept, { household_id: s.household, patient_id: p.id, relation: s.relation }); return `joined file ${s.number}` }
  if (s?.mode === 'start') { const r = await startFile(s.dept, { patient_id: p.id, address: s.address, phone: p.phone_text ?? undefined }); return `file ${r.file.number} started` }
  return null
}

export function FamilyStep({ seed, value, onChange }: NewPatientStepProps) {
  const { dept } = useDepartment(); const v = value as StepValue
  const digits = seed.phone.replace(/\D/g, '')
  const [q, setQ] = useState(''); const term = q.trim() || (digits.length >= 4 ? digits : '')
  const here = !!dept?.packs.includes(PACK)
  const files = useFiles(term, here ? dept!.id : null)
  // a department that does not use the pack keeps no files: the step steps aside, never holding Register
  useEffect(() => { if (dept && !here && (value as StepValue)?.mode !== 'none') onChange({ mode: 'none' }) }, [dept, here, value, onChange])
  if (!dept || !here) return null
  const found = term ? files.data ?? [] : []
  return <fieldset className="grid gap-1.5 rounded-md bg-sunken p-2.5">
    <legend className="text-12 font-medium text-muted">Family file</legend>
    <div className="flex flex-wrap items-center gap-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={digits.length >= 4 ? `files with ${seed.phone}` : 'File number, phone or address'} aria-label="Find a family file" className="h-8 w-56" />
      <Chip on={v?.mode === 'start'} onClick={() => onChange(v?.mode === 'start' ? null : { mode: 'start', address: '', dept: dept.id })}>Start a new file</Chip>
      <Chip on={v?.mode === 'none'} onClick={() => onChange(v?.mode === 'none' ? null : { mode: 'none' })}>Not now</Chip></div>
    {found.map((f) => <div key={f.id} className="grid gap-1">
      <button type="button" onClick={() => onChange({ mode: 'join', household: f.id, number: f.number, relation: v?.mode === 'join' ? v.relation : '', dept: dept.id })}
        className={cn('flex flex-wrap items-baseline gap-2 rounded-md px-2 py-1 text-start text-13 focus-ring', v?.mode === 'join' && v.household === f.id ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-hover')}>
        <span className="font-mono text-12 text-faint">file {f.number}</span><span className="text-fg">{f.address ?? ''}</span><span className="text-12 text-muted">{f.phone ?? ''} · {f.members.length} members</span></button>
      {v?.mode === 'join' && v.household === f.id && <div className="flex flex-wrap items-center gap-1.5 ps-2"><span className="text-12 text-faint">as</span>
        {RELATIONS.filter((r) => r !== 'head').map((r) => <Chip key={r} on={v.relation === r} onClick={() => onChange({ ...v, relation: r })}>{r}</Chip>)}</div>}
    </div>)}
    {term && files.isSuccess && !found.length && <p className="text-12 text-faint">No file for “{term}”.</p>}
    {v?.mode === 'start' && <Input value={v.address} onChange={(e) => onChange({ ...v, address: e.target.value })} placeholder="Address (the street, the village)" aria-label="The new file's address" className="h-8" />}
  </fieldset>
}
