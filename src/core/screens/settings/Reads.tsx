import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { usePatientSearch } from '../../hooks/reads'
import { nameOf, userName } from '../../db/views'
import { Badge, Button, Empty, PageHead, SearchInput, Section, Spinner, dateTime } from '../../ui'

// a row of the read log (spec/openCare.md §3.10): one per reader, patient and purpose, coalesced over ten minutes
type LogRow = { id: string; user_id: string; department_id: string | null; patient_id: string | null; purpose: string; reason: string | null; what: Record<string, unknown>; withheld: number; reads: number; at: string; last_at: string }
const PURPOSE: Record<string, string> = { TREAT: 'care', BTG: 'opened anyway', PATADMIN: 'finding or registering', HOPERAT: 'running the clinic', HPAYMT: 'payment', PATRQT: 'the patient asked', PUBHLTH: 'public health', HRESCH: 'research', LEGAL: 'the law' }

/** the one read log: records opened anyway in the last week, and who read a given record — printable for the patient */
export function ReadsPage({ orgId }: { orgId: string }) {
  const { org } = useDepartment()
  const anyway = useQuery({ queryKey: ['read_log', 'BTG', orgId], queryFn: async () => { const since = Date.now() - 7 * 86400_000
    return (await read<{ reads: LogRow[] }>({ shape: 'log', purpose: 'BTG', limit: 200 })).reads.filter((r) => Date.parse(r.at) >= since) } })
  const [q, setQ] = useState(''); const [pid, setPid] = useState<string | null>(null)
  const hits = usePatientSearch(orgId, q)
  const reads = useQuery({ queryKey: ['read_log', pid], queryFn: async () => (await read<{ reads: LogRow[] }>({ shape: 'log', patient_id: pid, limit: 500 })).reads, enabled: !!pid })
  const who = hits.data?.find((p) => p.id === pid)
  return <div className="grid gap-4">
    <PageHead title="Record reads" hint="Records opened anyway, and who read a patient's record and why. Printable for the patient." />
    <Section flush id="reads.anyway" title="Opened anyway · last 7 days" count={anyway.data?.length} summary="records and private notes opened anyway, with the reason given">
      {anyway.isLoading ? <div className="p-4"><Spinner /></div> : anyway.error ? <p className="px-4 py-2 text-14 text-danger">{anyway.error.message}</p>
      : (anyway.data ?? []).length === 0 ? <Empty>Nothing was opened anyway.</Empty>
      : <ul className="divide-y divide-line text-14">{anyway.data!.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="w-32 text-12 text-faint tnum">{dateTime(r.at)}</span><span className="w-36 font-medium">{userName(org, r.user_id)}</span>
          <span className="text-12 text-faint">{nameOf(org, r.department_id) ?? ''}{r.reads > 1 ? ` · ${r.reads} reads` : ''}</span>
          {r.patient_id && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setPid(r.patient_id) }}>Every read of this record</Button>}
          <Badge tone={r.reason === 'Emergency' ? 'danger' : 'neutral'} className="ms-auto">{r.reason ?? '—'}</Badge></li>)}</ul>}
    </Section>
    <Section flush id="reads.who" title="Who read this record" summary="find a patient to see every read of their record">
      <div className="p-4">
        {!pid && <><SearchInput className="max-w-sm" value={q} onChange={setQ} placeholder="Patient name, phone or record number" />
          {q.trim().length >= 2 && <ul className="mt-2 max-w-sm divide-y divide-line rounded-lg bg-surface ring-1 ring-line">{(hits.data ?? []).map((p) => <li key={p.id}><button onClick={() => setPid(p.id)} className="w-full px-3 py-1.5 text-start text-14 hover:bg-hover">#{p.record_number} {p.given_name} {p.family_name}</button></li>)}
            {hits.data?.length === 0 && <li className="px-3 py-1.5 text-14 text-faint">No patient matches.</li>}</ul>}</>}
        {pid && <><div className="mb-2 flex items-center gap-2"><span className="text-14 font-medium">{who ? `#${who.record_number} ${who.given_name} ${who.family_name}` : ''}</span>
            <Button size="sm" variant="outline" className="ms-auto print:hidden" onClick={() => window.print()}>Print</Button><Button size="sm" variant="ghost" className="print:hidden" onClick={() => { setPid(null); setQ('') }}>Another patient</Button></div>
          {reads.isLoading ? <Spinner /> : <div className="overflow-x-auto rounded-lg ring-1 ring-line"><table className="w-full text-14"><thead><tr className="border-b border-line text-start text-11 text-faint"><th className="px-3 py-1.5 font-medium">When</th><th className="font-medium">Who</th><th className="font-medium">From</th><th className="font-medium">Why</th></tr></thead>
            <tbody>{(reads.data ?? []).map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="px-3 py-1.5 text-12 tnum">{dateTime(r.at)}{r.reads > 1 ? ` · ${r.reads}×` : ''}</td><td>{userName(org, r.user_id)}</td><td className="text-12 text-faint">{nameOf(org, r.department_id)}</td>
              <td className="text-12">{PURPOSE[r.purpose] ?? r.purpose}{r.reason ? ` · ${r.reason}` : ''}{r.withheld ? ` · ${r.withheld} private withheld` : ''}</td></tr>)}</tbody></table>
            {reads.data?.length === 0 && <Empty>No one has read this record.</Empty>}</div>}</>}
      </div>
    </Section>
  </div>
}
