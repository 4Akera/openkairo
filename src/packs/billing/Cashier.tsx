// The Cashier (billing.cashier, spec §5.4, the bill-list picture): views To pay · Paid today · Nothing to pay; search by name or record
// number (or a receipt's number). One row a patient who owes: who, what for ("Visit · CBC, HbA1c · Pharmacy"), where someone already waits
// ("Laboratory is waiting", in warn), work done before payment, and the amount — the sum of the lines, so nobody adds anything up. The
// patient folds out into the payment card under the row; taken, the receipt is shown and kept. Paid today lists the desk's receipts, each
// folding out its receipt (and Give back…). Everyone who owes is reached: the server groups and pages them (Show more).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { nameOf } from '@core/db/views'
import type { PatientBanner } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Empty, Input, ListRow, ScreenFrame, Spinner, Tag, errorText, hm, type ScreenView } from '@core/ui'
import { KEY, findPatients, useBillingLive, useOwed, usePaid, usePatients } from './hooks'
import { egp, owedMarks, owedWords, receiptLines, signed } from './money'
import { PayCard, type Paid } from './PayCard'
import { Receipt } from './Receipt'

type View = 'due' | 'paid' | 'none'
const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
const ageSex = (p?: PatientBanner) => p ? `${p.age} ${SEX[p.sex] ?? ''}`.trim() : ''
const receiptNumber = (t: string) => /^r-?\d{1,9}$/i.test(t) ? `R-${t.replace(/\D/g, '').padStart(5, '0')}` : null

export function Cashier({ dept }: ScreenProps) {
  const { org } = useDepartment(); useBillingLive(org?.organization.id)
  const [chosen, setView] = useState<View>('due'); const [find, setFind] = useState(''); const [pages, setPages] = useState(1)
  const [open, setOpen] = useState<string | null>(null); const [last, setLast] = useState<(Paid & { patient_id: string }) | null>(null); const [seeLast, setSeeLast] = useState(false)
  const term = find.trim(); const receipt = receiptNumber(term); const searchable = !receipt && (term.length >= 2 || /^\d+$/.test(term))
  // a search by name, phone or record number goes through the reader (logged there); a receipt's number opens Paid
  const search = useQuery({ queryKey: [KEY, 'find', dept.id, term], enabled: searchable, staleTime: 10_000, queryFn: () => findPatients(dept.id, term) })
  const found = searchable ? search.data ?? null : null
  const view: View = receipt ? 'paid' : chosen
  const searching = searchable && search.isLoading
  const owed = useOwed(dept.id, found?.ids ?? null, pages)
  const paid = usePaid(dept.id, receipt ? { receipt } : found ? { patients: found.ids } : {}, view === 'paid')
  const lastPaid = usePaid(dept.id, { payment_id: last?.payment_id }, !!last && seeLast)
  const o = owed.data
  const ids = [...(o?.rows ?? []).map((r) => r.patient_id), ...(o?.none ?? []).map((r) => r.patient_id),
    ...(paid.data?.payments ?? []).map((p) => p.patient_id).filter((x): x is string => !!x), ...(last ? [last.patient_id] : [])]
  const names = usePatients(dept.id, ids).data ?? {}
  const who = (id: string | null) => (id && (found?.names[id] ?? names[id])) || undefined
  const nameOfDept = (id: string | null | undefined) => nameOf(org, id)
  const views: ScreenView<View>[] = [{ id: 'due', label: 'To pay', count: o?.count, needs: 'warn' }, { id: 'paid', label: 'Paid today', count: o?.paid },
    { id: 'none', label: 'Nothing to pay', count: o?.none.length }]
  const fullName = (p?: PatientBanner) => p ? `${p.given_name} ${p.family_name}` : '…'
  const onPaid = (patientId: string) => (p: Paid) => { setLast({ ...p, patient_id: patientId }); setSeeLast(false); setOpen(null) }
  if (o?.desk === 'none') return <ScreenFrame><Callout tone="info" title="This department does not take payment">
    Settings → Departments → {dept.name} → Takes payment here: its own charges, or everyone's.</Callout></ScreenFrame>
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setOpen(null) }}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Record number, name or receipt" aria-label="Find a patient or a receipt" className="w-full sm:w-72" />}
    notice={last && <div className="grid gap-3">
      <Callout tone="ok" icon={false} role="status" title={`Paid · ${egp(Math.round(last.total * 100))} · ${last.method === 'cash' ? 'Cash' : 'Card'} · receipt ${last.receipt}`}
        actions={<Button size="sm" variant="outline" aria-expanded={seeLast} onClick={() => setSeeLast(!seeLast)}>{seeLast ? 'Hide the receipt' : 'View receipt'}</Button>}>
        {last.method === 'cash' && last.change ? `Change ${egp(Math.round(last.change * 100))}. ` : ''}What was waiting for it no longer waits; nothing else changed in the chart.</Callout>
      {seeLast && lastPaid.data?.payments[0] && <Receipt payment={lastPaid.data.payments[0]} departmentId={dept.id} patient={who(last.patient_id) ?? null} />}</div>}>
    {owed.isLoading || searching ? <Spinner label="Finding who owes" /> : owed.error ? <Callout tone="danger" title="Not loaded">{errorText(owed.error)}</Callout>
    : view === 'due' ? <Card><ul>{o!.rows.length ? o!.rows.map((r) => { const p = who(r.patient_id); const w = owedWords(r, nameOfDept)
        return [<ListRow key={r.patient_id} number={p?.record_number ?? ''} name={fullName(p)} age={ageSex(p)} selected={open === r.patient_id} onOpen={() => setOpen(open === r.patient_id ? null : r.patient_id)}
          status={<span className="truncate">{w.what}{w.unpriced && <span className="ms-2 text-12 text-muted">{w.unpriced}</span>}</span>} marks={owedMarks(r, nameOfDept)}
          actions={<span className="text-14 font-semibold tnum text-fg">{egp(Math.round(Number(r.total) * 100))}</span>} minutes={null} />,
          open === r.patient_id && <li key={`${r.patient_id} card`} className="border-t border-line bg-sunken">
            <PayCard departmentId={dept.id} patientId={r.patient_id} who={fullName(p)} onPaid={onPaid(r.patient_id)} /></li>] })
        : <li><Empty>{found ? 'No one by that search owes anything here.' : 'Nobody owes anything here now.'}</Empty></li>}
      {o!.more && <li className="border-t border-line p-2 text-center"><Button size="sm" variant="ghost" onClick={() => setPages(pages + 1)}>Show more</Button></li>}</ul></Card>
    : view === 'paid' ? <Card><ul>{paid.isLoading ? <li className="p-4"><Spinner label="Loading the receipts" /></li>
      : (paid.data?.payments ?? []).length ? paid.data!.payments.map((x) => { const p = who(x.patient_id)
        return [<ListRow key={x.payment_id} number={x.receipt} name={x.patient_id ? fullName(p) : 'No patient on record'} age={ageSex(p)} selected={open === x.payment_id}
          onOpen={() => setOpen(open === x.payment_id ? null : x.payment_id)} minutes={null}
          status={<span className="truncate">{receiptLines(x, nameOfDept).map((l) => l.words).join(' · ')}</span>}
          marks={[...(x.refund_of ? [{ key: 'r', word: `gives back ${x.refund_of}`, tone: 'info' as const }] : []), ...(x.refunded_by ? [{ key: 'b', word: `given back on ${x.refunded_by}`, tone: 'warn' as const }] : [])]}
          actions={<span className="flex items-center gap-2"><Tag>{x.method === 'cash' ? 'Cash' : 'Card'} · {hm(x.at)}</Tag><span className="text-14 font-semibold tnum text-fg">{egp(signed(x.total))}</span></span>} />,
          open === x.payment_id && <li key={`${x.payment_id} receipt`} className="border-t border-line bg-sunken p-4"><Receipt payment={x} departmentId={dept.id} patient={p ?? null} /></li>] })
        : <li><Empty>{receipt ? `No receipt ${receipt} here.` : 'Nothing taken here today yet.'}</Empty></li>}</ul></Card>
    : <Card><ul>{o!.none.length ? o!.none.map((r) => { const p = who(r.patient_id)
        return <ListRow key={`${r.patient_id}:${r.department_id}`} number={p?.record_number ?? ''} name={fullName(p)} age={ageSex(p)} minutes={null}
          status={<span className="truncate text-muted">Nothing owed · {nameOfDept(r.department_id)}</span>} /> })
        : <li><Empty>No one seen today is free of charges yet.</Empty></li>}</ul></Card>}
    <p className="text-12 text-faint">A patient appears once something priced was ordered or seen, or a department sent its lines here. The amount is the sum of the lines.</p>
  </ScreenFrame>
}
