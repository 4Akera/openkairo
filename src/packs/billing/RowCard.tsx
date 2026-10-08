// Billing's card under a department's list row (spec §5.4, "Pay on a row"; core change (a)): Pay folds the cashier's own payment card
// out under the row, with the lines the row hands (its department's own priced work, beyond what billing already holds of each order)
// and what the patient owes this desk; taken, its receipt can be shown there. Send to cashier saves the row's lines as an open bill the
// main cashier takes with the rest of the visit. Billing names neither the department nor the pack the lines came from: the
// department's name is the clinic's, read from the row's department.
import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { packOp } from '@core/db/rpc'
import type { RowActionCardProps } from '@core/screens/rows'
import { Button, Callout, cn, errorText } from '@core/ui'
import { PayCard, type Paid } from './PayCard'
import { Receipt } from './Receipt'
import { useBillingDone, usePaid, usePatients } from './hooks'
import { egp } from './money'
import { asHanded, asSent, centsOf, dueOf, noData, type RowData } from './rows'
import { LABEL } from './words'

const lineWords = (l: { name: string; quantity: number }) => l.quantity === 1 ? l.name : `${l.name} × ${l.quantity}`

export function RowCard({ row, ctx, data, close }: RowActionCardProps) {
  const d = (data as RowData | undefined) ?? noData()
  return d.desk === 'own' || d.desk === 'everyone' ? <PayHere row={row} dept={ctx.dept} d={d} close={close} /> : <SendHere row={row} dept={ctx.dept} d={d} close={close} />
}

type Props = Pick<RowActionCardProps, 'row' | 'close'> & { dept: RowActionCardProps['ctx']['dept']; d: RowData }

/** Pay at this counter: the payment card with the row's lines handed and this desk's charges and open bills for the patient; taken, the
 *  receipt is there to show (as kept) */
function PayHere({ row, dept, d, close }: Props) {
  const due = useMemo(() => dueOf(row, d, 'pay'), [row, d])
  const handed = useMemo(() => asHanded(due.lines), [due])
  const [paid, setPaid] = useState<Paid | null>(null); const [see, setSee] = useState(false)
  const receipt = usePaid(dept.id, { payment_id: paid?.payment_id }, !!paid && see); const who = usePatients(dept.id, paid && see ? [row.patient_id] : [])
  if (paid) return <div className="grid gap-3">
    <Callout tone="ok" icon={false} role="status" title={`Paid · ${egp(Math.round(paid.total * 100))} · ${paid.method === 'cash' ? 'Cash' : 'Card'} · receipt ${paid.receipt}`}
      actions={<span className="flex gap-2"><Button size="sm" variant="outline" aria-expanded={see} onClick={() => setSee(!see)}>{see ? 'Hide the receipt' : 'View receipt'}</Button>
        <Button size="sm" variant="outline" onClick={() => close(true)}>Done</Button></span>}>
      {paid.method === 'cash' && paid.change ? `Change ${egp(Math.round(paid.change * 100))}. ` : ''}What was waiting for it no longer waits; nothing else changed in the chart.</Callout>
    {see && receipt.data?.payments[0] && <Receipt payment={receipt.data.payments[0]} departmentId={dept.id} patient={who.data?.[row.patient_id] ?? null} />}</div>
  return <div className="-m-3"><PayCard departmentId={dept.id} patientId={row.patient_id} who={dept.name} handed={handed} basis={due.basis} onPaid={setPaid} /></div>
}

/** Send to cashier: the lines the row hands beyond what is paid, as an open bill; sent again only what changed (a resend for an order
 *  replaces its lines not yet paid) */
function SendHere({ row, dept, d, close }: Props) {
  const due = useMemo(() => dueOf(row, d, 'send'), [row, d]); const done = useBillingDone()
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [sent, setSent] = useState<number | null>(null)
  const send = async () => {
    if (!due.lines.length || busy) return
    setBusy(true); setError(null)
    try {
      await packOp('billing.send', dept.id, { patient_id: row.patient_id, ...(row.visit_id ? { visit_id: row.visit_id } : {}), lines: asSent(due.lines), basis: due.basis })
      setSent(centsOf(due.lines)); void done()
    } catch (x) { setError(x) } finally { setBusy(false) }
  }
  if (sent !== null) return <Callout tone="ok" icon={false} role="status" title={`Sent to the cashier · ${egp(sent)}`}
    actions={<Button size="sm" variant="outline" onClick={() => close(true)}>Done</Button>}>The patient pays there with the rest of the visit.</Callout>
  if (!due.lines.length) return <div className="flex flex-wrap items-center gap-3 text-13">
    <span className="text-muted">Sent to the cashier: the patient pays there with the rest of the visit.</span>
    <Button size="sm" variant="ghost" className="ms-auto" onClick={() => close()}>Close</Button></div>
  return <div className="grid gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void send() } }}>
    <p className={cn(LABEL)}>{dept.name} · to the cashier</p>
    {due.lines.map((l, i) => <div key={`${l.order ?? ''}:${i}`} className="flex items-baseline gap-3 text-13">
      <span className="min-w-0 flex-1 truncate text-fg">{lineWords(l)}</span><span className="tnum text-fg">{egp(centsOf([l]))}</span></div>)}
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
      <span className="text-14 font-semibold text-fg tnum">Total {egp(centsOf(due.lines))}</span>
      {due.lines.some((l) => !!l.order && (d.own.get(l.order)?.sent ?? 0) > 0) && <span className="text-12 text-muted">Sent before for some of these: sending again replaces what is not paid yet.</span>}
      {due.lines.some((l) => !!l.order && (d.own.get(l.order)?.paid ?? 0) > 0) && <span className="text-12 text-muted">Part is paid already: only the rest goes.</span>}
      <span className="ms-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => close()}>Cancel</Button>
        <Button size="sm" loading={busy} onClick={() => void send()}><Send />Send to cashier</Button></span>
    </div>
    {!!error && <p role="alert" className="text-12 text-danger">Not sent: {errorText(error)}</p>}
  </div>
}
