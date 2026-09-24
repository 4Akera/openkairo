import { useEffect, useRef, useState } from 'react'
import { usePatientSearch, usePrivateVisits } from '../hooks/reads'
import { useChoice, useDepartment } from '../hooks/organization'
import { useVisitActions } from '../hooks/writes'
import type { PatientHit } from '../db/types'
import { Badge, Button, Card, Heading, Input, cn, minutesSince } from '../ui'
import { Lock } from 'lucide-react'
import { Search as SearchIcon } from 'lucide-react'
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
  const privateVisits = usePrivateVisits(departmentId)
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
    <div className="mx-auto grid max-w-4xl gap-4 p-4">
      {last && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200" role="status">✓ {last}</p>}
      {!creating && <Card className="p-3"><div className="relative"><SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input ref={box} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or record number…" className="h-12 pl-9 text-base" /></div></Card>}
      {!creating && d.trim().length >= 2 && <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-xs">
        {(hits.data ?? []).map((p) => <li key={p.id} className="grid gap-2 px-3 py-2">
          <PatientLine p={p} />
          {p.open_visits.map((v) => <div key={v.id} className="flex items-center justify-between rounded bg-teal-50/60 px-2 py-1 text-xs"><span>open visit · {v.department_name} · {v.status.replace('_', ' ')}{v.present ? ' · here' : ' · away'}</span>{!v.present && <Button size="sm" onClick={() => here(p, v.department_id)}>Here</Button>}</div>)}
          <div className="flex flex-wrap items-center gap-1.5">{clinics.filter((c) => !p.open_visits.some((v) => v.department_id === c.id)).map((c) => <span key={c.id} className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => here(p, c.id)}>Here → {c.name}</Button><button title="urgent" onClick={() => here(p, c.id, true)} className="text-[11px] text-red-700">urgent</button></span>)}</div>
        </li>)}
        <li className="px-3 py-2 text-sm"><button onClick={() => setCreating(true)} className="text-teal-800">+ New patient “{q.trim()}”</button></li>
      </ul>}
      {creating && <NewPatient seed={q} orgId={orgId!} submitLabel={clinics[0] ? `Register & Here → ${clinics[0].name}` : 'Register'} onDone={(p) => { setCreating(false); setQ(''); if (clinics[0]) here(p, clinics[0].id) }} onCancel={() => setCreating(false)} />}
      {visits.open.error && <p className="text-sm text-red-700">{visits.open.error.message}</p>}
      <section className="grid gap-2"><Heading>In the clinics now</Heading>{clinics.map((c) => <div key={c.id}><p className="mb-1.5 text-sm font-medium text-neutral-700">{c.name}</p><QueueList departmentId={c.id} compact /></div>)}
        {/* a private visit shows here, never under its department (spec 07) */}
        {(privateVisits.data?.length ?? 0) > 0 && <div><p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-700"><Lock className="h-3.5 w-3.5" />Private visits</p>
          <Card><ul className="divide-y divide-neutral-100">{privateVisits.data!.map((v) => <li key={v.id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
            <span className="w-12 text-xs text-neutral-400 tnum">#{v.patient.record_number}</span><span className="font-medium">{v.patient.given_name} {v.patient.family_name}</span>
            <span className="text-xs text-neutral-500">{v.status === 'in_consult' ? 'in consult' : v.present_at ? v.status : 'away'}</span>{v.priority !== 'routine' && <Badge tone="red">{v.priority}</Badge>}
            {v.status === 'pending' && v.present_at && <button onClick={() => visits.present.mutate({ visit_id: v.id, is_present: false })} title="The patient left: results go to the doctor's review list"
              className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-neutral-200 hover:text-red-700 hover:ring-red-300">Gone</button>}
            <span className={cn('text-xs text-neutral-400 tnum', !(v.status === 'pending' && v.present_at) && 'ml-auto')}>{minutesSince(v.arrived_at)} min</span></li>)}</ul></Card></div>}</section>
    </div>
  )
}
