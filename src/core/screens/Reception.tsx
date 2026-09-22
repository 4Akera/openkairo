import { useEffect, useState } from 'react'
import { usePatientSearch } from '../hooks/reads'
import { useChoice, useDepartment } from '../hooks/organization'
import { useRegister, useVisitActions } from '../hooks/writes'
import type { PatientHit } from '../db/types'
import { Button, Input, Field, Select } from '../ui'
import { PatientLine } from '../renderers/PatientLine'
import { QueueList } from './Queue'

/** Reception (spec 05): the search box is the screen; Here opens or marks present; New patient is four fields. */
export function ReceptionScreen({ departmentId }: { departmentId: string }) {
  const orgId = useChoice((s) => s.organizationId)
  const { org } = useDepartment()
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [creating, setCreating] = useState(false); const [last, setLast] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const hits = usePatientSearch(orgId, d)
  const visits = useVisitActions()
  const served = (org?.departments ?? []).filter((x) => x.is_visited && x.type !== 'reception' && (org?.departments.find((r) => r.id === departmentId)?.serves ?? []).some((s) => s === null || s === x.id))
  const clinics = served.length ? served : (org?.departments ?? []).filter((x) => x.is_visited && x.type !== 'reception')
  function here(p: PatientHit, deptId: string, urgent = false) {
    visits.open.mutate({ patient_id: p.id, department_id: deptId, priority: urgent ? 'urgent' : 'routine' }, { onSuccess: () => { setLast(`${p.given_name} ${p.family_name} → ${clinics.find((c) => c.id === deptId)?.name}`); setQ('') } })
  }
  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4">
      {last && <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">{last}</p>}
      {!creating && <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or record number…" className="h-11 text-base" />}
      {!creating && d.trim().length >= 2 && <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
        {(hits.data ?? []).map((p) => <li key={p.id} className="grid gap-2 px-3 py-2">
          <PatientLine p={p} />
          {p.open_visits.map((v) => <div key={v.id} className="flex items-center justify-between rounded bg-teal-50/60 px-2 py-1 text-xs"><span>open visit · {v.department_name} · {v.status.replace('_', ' ')}{v.present ? ' · here' : ' · away'}</span>{!v.present && <Button size="sm" onClick={() => here(p, v.department_id)}>Here</Button>}</div>)}
          <div className="flex flex-wrap items-center gap-1.5">{clinics.filter((c) => !p.open_visits.some((v) => v.department_id === c.id)).map((c) => <span key={c.id} className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => here(p, c.id)}>Here → {c.name}</Button><button title="urgent" onClick={() => here(p, c.id, true)} className="text-[11px] text-red-700">urgent</button></span>)}</div>
        </li>)}
        <li className="px-3 py-2 text-sm"><button onClick={() => setCreating(true)} className="text-teal-800">+ New patient “{q.trim()}”</button></li>
      </ul>}
      {creating && <NewPatient seed={q} orgId={orgId!} onDone={(p) => { setCreating(false); setQ(''); if (clinics[0]) here(p, clinics[0].id) }} onCancel={() => setCreating(false)} />}
      {visits.open.error && <p className="text-sm text-red-700">{visits.open.error.message}</p>}
      <section><h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Waiting in the clinics</h2>{clinics.map((c) => <div key={c.id} className="mb-3"><p className="mb-1 text-xs text-neutral-500">{c.name}</p><QueueList departmentId={c.id} compact /></div>)}</section>
    </div>
  )
}

function NewPatient({ seed, orgId, onDone, onCancel }: { seed: string; orgId: string; onDone: (p: PatientHit) => void; onCancel: () => void }) {
  const parts = seed.trim().split(/\s+/); const [given, setGiven] = useState(/^\d/.test(parts[0] ?? '') ? '' : parts[0] ?? ''); const [family, setFamily] = useState(parts.slice(1).join(' '))
  const [sex, setSex] = useState('female'); const [born, setBorn] = useState(''); const [age, setAge] = useState(''); const [phone, setPhone] = useState('')
  const reg = useRegister(orgId)
  const dup = usePatientSearch(orgId, family.length >= 2 ? family : '')
  const bornOn = born || (age ? String(new Date().getFullYear() - Number(age)) : '')
  return <form onSubmit={(e) => { e.preventDefault(); reg.mutate({ given_name: given, family_name: family, sex, born_on: bornOn, phone_text: phone || null }, { onSuccess: (p) => onDone(p as PatientHit) }) }} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
    <h2 className="text-sm font-semibold">New patient</h2>
    <div className="grid grid-cols-2 gap-3"><Field label="Given name"><Input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus required /></Field><Field label="Family name"><Input value={family} onChange={(e) => setFamily(e.target.value)} required /></Field></div>
    <div className="grid grid-cols-3 gap-3"><Field label="Sex"><Select value={sex} onChange={(e) => setSex(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></Field>
      <Field label="Born on"><Input type="date" value={born} onChange={(e) => setBorn(e.target.value)} /></Field><Field label="…or age"><Input type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} disabled={!!born} /></Field></div>
    <Field label="Phone (optional)"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    {(dup.data ?? []).length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm"><p className="mb-1 font-medium text-amber-900">Possible existing patient</p>{dup.data!.slice(0, 3).map((p) => <div key={p.id} className="flex items-center justify-between py-0.5"><PatientLine p={p} /><Button type="button" size="sm" variant="outline" onClick={() => onDone(p)}>Use this</Button></div>)}</div>}
    {reg.error && <p className="text-sm text-red-700">{reg.error.message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={reg.isPending || !bornOn}>Register & Here</Button></div>
  </form>
}
