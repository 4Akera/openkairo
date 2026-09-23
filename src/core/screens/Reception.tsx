import { useEffect, useRef, useState } from 'react'
import { usePatientSearch } from '../hooks/reads'
import { useChoice, useDepartment } from '../hooks/organization'
import { useVisitActions } from '../hooks/writes'
import type { PatientHit } from '../db/types'
import { Button, Input } from '../ui'
import { NewPatient } from '../shell/NewPatient'
import { rememberPatient } from '../hooks/recent'
import { PatientLine } from '../renderers/PatientLine'
import { QueueList } from './Queue'

/** Reception (spec 05): the search box is the screen; Here opens or marks present; New patient is four fields. */
export function ReceptionScreen({ departmentId }: { departmentId: string }) {
  const orgId = useChoice((s) => s.organizationId)
  const { org } = useDepartment()
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [creating, setCreating] = useState(false); const [last, setLast] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const hits = usePatientSearch(orgId, d)
  // ⌘K on reception focuses this box: it is the one search on this screen
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => { const f = () => box.current?.focus(); window.addEventListener('opencare:search', f); return () => window.removeEventListener('opencare:search', f) }, [])
  const visits = useVisitActions()
  const served = (org?.departments ?? []).filter((x) => x.is_visited && x.type !== 'reception' && (org?.departments.find((r) => r.id === departmentId)?.serves ?? []).some((s) => s === null || s === x.id))
  const clinics = served.length ? served : (org?.departments ?? []).filter((x) => x.is_visited && x.type !== 'reception')
  function here(p: PatientHit, deptId: string, urgent = false) {
    rememberPatient(p); visits.open.mutate({ patient_id: p.id, department_id: deptId, priority: urgent ? 'urgent' : 'routine' }, { onSuccess: () => { setLast(`${p.given_name} ${p.family_name} → ${clinics.find((c) => c.id === deptId)?.name}`); setQ('') } })
  }
  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4">
      {last && <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">{last}</p>}
      {!creating && <Input ref={box} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or record number…" className="h-11 text-base" />}
      {!creating && d.trim().length >= 2 && <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
        {(hits.data ?? []).map((p) => <li key={p.id} className="grid gap-2 px-3 py-2">
          <PatientLine p={p} />
          {p.open_visits.map((v) => <div key={v.id} className="flex items-center justify-between rounded bg-teal-50/60 px-2 py-1 text-xs"><span>open visit · {v.department_name} · {v.status.replace('_', ' ')}{v.present ? ' · here' : ' · away'}</span>{!v.present && <Button size="sm" onClick={() => here(p, v.department_id)}>Here</Button>}</div>)}
          <div className="flex flex-wrap items-center gap-1.5">{clinics.filter((c) => !p.open_visits.some((v) => v.department_id === c.id)).map((c) => <span key={c.id} className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => here(p, c.id)}>Here → {c.name}</Button><button title="urgent" onClick={() => here(p, c.id, true)} className="text-[11px] text-red-700">urgent</button></span>)}</div>
        </li>)}
        <li className="px-3 py-2 text-sm"><button onClick={() => setCreating(true)} className="text-teal-800">+ New patient “{q.trim()}”</button></li>
      </ul>}
      {creating && <NewPatient seed={q} orgId={orgId!} submitLabel={clinics[0] ? `Register & Here → ${clinics[0].name}` : 'Register'} onDone={(p) => { setCreating(false); setQ(''); if (clinics[0]) here(p, clinics[0].id) }} onCancel={() => setCreating(false)} />}
      {visits.open.error && <p className="text-sm text-red-700">{visits.open.error.message}</p>}
      <section><h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Waiting in the clinics</h2>{clinics.map((c) => <div key={c.id} className="mb-3"><p className="mb-1 text-xs text-neutral-500">{c.name}</p><QueueList departmentId={c.id} compact /></div>)}</section>
    </div>
  )
}
