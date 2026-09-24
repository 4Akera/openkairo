import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rpc } from '../../db/rpc'
import { usePatientSearch } from '../../hooks/reads'
import type { OpenedAnyway, RecordRead } from '../../db/types'
import { Badge, Button, Spinner, ymd, dateTime } from '../../ui'
import { Empty, Filter, PageHead, Section } from './parts'

/** the one read log (spec 07): every open-anyway of the last days, and who opened a given record — printable for the patient */
export function ReadsPage({ orgId }: { orgId: string }) {
  const anyway = useQuery({ queryKey: ['opened_anyway', orgId], queryFn: () => rpc<OpenedAnyway[]>('read_opened_anyway', { organization_id: orgId }) })
  const [q, setQ] = useState(''); const [pid, setPid] = useState<string | null>(null)
  const hits = usePatientSearch(orgId, q)
  const reads = useQuery({ queryKey: ['record_reads', pid], queryFn: () => rpc<RecordRead[]>('read_record_reads', { patient_id: pid }), enabled: !!pid })
  const who = hits.data?.find((p) => p.id === pid)
  const BASIS: Record<string, string> = { visit: 'open visit', request: 'open request', none: 'no visit or request', pack: 'a pack', anyway: 'opened anyway' }
  return <div className="grid gap-4">
    <PageHead title="Record reads" hint="Every private visit opened anyway, and who opened a patient's record. Printable for the patient." />
    <Section id="reads.anyway" title="Opened anyway · last 7 days" count={anyway.data?.length} summary="private visits opened by someone outside their department">
      {anyway.isLoading ? <div className="p-4"><Spinner /></div> : (anyway.data ?? []).length === 0 ? <Empty>No private visit was opened anyway.</Empty>
      : <ul className="divide-y divide-neutral-100 text-sm">{anyway.data!.map((r, i) => <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="w-32 text-xs text-neutral-500 tnum">{dateTime(r.read_at)}</span><span className="w-36 font-medium">{r.user_name}</span>
          <span className="w-44">#{r.patient.record_number} {r.patient.given_name} {r.patient.family_name}</span>
          <span className="text-xs text-neutral-500">{r.visit_department} visit of {(r.visit_at ? ymd(r.visit_at) : '')}</span><Badge tone={r.reason_text === 'Emergency' ? 'red' : 'neutral'} className="ml-auto">{r.reason_text}</Badge></li>)}</ul>}
    </Section>
    <Section id="reads.who" title="Who opened this record" summary="find a patient to see every read of their record">
      <div className="p-4">
        {!pid && <><Filter value={q} onChange={setQ} placeholder="Patient name, phone or record number" />
          {q.trim().length >= 2 && <ul className="mt-2 max-w-sm divide-y divide-neutral-100 rounded-lg bg-white ring-1 ring-neutral-200">{(hits.data ?? []).map((p) => <li key={p.id}><button onClick={() => setPid(p.id)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50">#{p.record_number} {p.given_name} {p.family_name}</button></li>)}
            {hits.data?.length === 0 && <li className="px-3 py-1.5 text-sm text-neutral-400">No patient matches.</li>}</ul>}</>}
        {pid && <><div className="mb-2 flex items-center gap-2"><span className="text-sm font-medium">{who ? `#${who.record_number} ${who.given_name} ${who.family_name}` : ''}</span>
            <Button size="sm" variant="outline" className="ml-auto print:hidden" onClick={() => window.print()}>Print</Button><Button size="sm" variant="ghost" className="print:hidden" onClick={() => { setPid(null); setQ('') }}>Another patient</Button></div>
          {reads.isLoading ? <Spinner /> : <div className="overflow-x-auto rounded-lg ring-1 ring-neutral-200"><table className="w-full text-sm"><thead><tr className="border-b border-neutral-100 text-left text-[11px] text-neutral-500"><th className="px-3 py-1.5 font-medium">When</th><th className="font-medium">Who</th><th className="font-medium">From</th><th className="font-medium">Why</th></tr></thead>
            <tbody>{(reads.data ?? []).map((r, i) => <tr key={i} className="border-b border-neutral-100 last:border-0"><td className="px-3 py-1.5 text-xs tnum">{dateTime(r.read_at)}</td><td>{r.user_name}</td><td className="text-xs text-neutral-500">{r.department_name}</td>
              <td className="text-xs">{BASIS[r.basis ?? ''] ?? '—'}{r.reason_text ? ` · ${r.reason_text}` : ''}{r.opened_visit_department ? ` · ${r.opened_visit_department} visit` : ''}</td></tr>)}</tbody></table>
            {reads.data?.length === 0 && <Empty>No one has opened this record.</Empty>}</div>}</>}
      </div>
    </Section>
  </div>
}
