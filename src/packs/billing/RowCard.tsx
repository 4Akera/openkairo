// Billing's card under a department's list row (spec §5.4, "Pay on a row"; core change (a)): Pay folds the cashier's own payment card
// out under the row, with the lines the row hands (its department's own priced work) and what the patient owes this desk; Send to
// cashier saves the row's lines as an open bill the main cashier takes with the rest of the visit. Billing names neither the department
// nor the pack the lines came from: the department's name is the clinic's, read from the row's department.
import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { packOp } from '@core/db/rpc'
import type { RowActionCardProps } from '@core/screens/rows'
import { Button, Callout, cn, errorText } from '@core/ui'
import { PayCard, type Paid } from './PayCard'
import { useBillingDone } from './hooks'
import { egp } from './money'
import { asHanded, asSent, centsOf, handedDue, noData, type RowData } from './rows'
import { LABEL } from './words'

const lineWords = (l: { name: string; quantity: number }) => l.quantity === 1 ? l.name : `${l.name} × ${l.quantity}`

export function RowCard({ row, ctx, data, close }: RowActionCardProps) {
  const d = (data as RowData | undefined) ?? noData()
  return d.desk === 'own' || d.desk === 'everyone' ? <PayHere row={row} dept={ctx.dept} d={d} close={close} /> : <SendHere row={row} dept={ctx.dept} d={d} close={close} />
}

type Props = Pick<RowActionCardProps, 'row' | 'close'> & { dept: RowActionCardProps['ctx']['dept']; d: RowData }

/** Pay at this counter: the payment card with the row's lines handed and this desk's charges and open bills for the patient */
function PayHere({ row, dept, d, close }: Props) {
  const handed = useMemo(() => asHanded(handedDue(row, d, 'pay')), [row, d])
  const [paid, setPaid] = useState<Paid | null>(null)
  if (paid) return <Callout tone="ok" icon={false} role="status" title={`Paid · ${egp(Math.round(paid.total * 100))} · ${paid.method === 'cash' ? 'Cash' : 'Card'} · receipt ${paid.receipt}`}
    actions={<Button size="sm" variant="outline" onClick={() => close(true)}>Done</Button>}>
    {paid.method === 'cash' && paid.change ? `Change ${egp(Math.round(paid.change * 100))}. ` : ''}What was waiting for it no longer waits; nothing else changed in the chart.</Callout>
  return <div className="-m-3"><PayCard departmentId={dept.id} patientId={row.patient_id} who={dept.name} handed={handed} onPaid={setPaid} /></div>
}

/** Send to cashier: the lines the row hands, as an open bill; sent again only what changed (a resend for an order replaces its lines
 *  not yet paid) */
function SendHere({ row, dept, d, close }: Props) {
  const due = useMemo(() => handedDue(row, d, 'send'), [row, d]); const done = useBillingDone()
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [sent, setSent] = useState<number | null>(null)
  const send = async () => {
    if (!due.length || busy) return
    setBusy(true); setError(null)
    try {
      await packOp('billing.send', dept.id, { patient_id: row.patient_id, ...(row.visit_id ? { visit_id: row.visit_id } : {}), lines: asSent(due) })
      setSent(centsOf(due)); void done()
    } catch (x) { setError(x) } finally { setBusy(false) }
  }
  if (sent !== null) return <Callout tone="ok" icon={false} role="status" title={`Sent to the cashier · ${egp(sent)}`}
    actions={<Button size="sm" variant="outline" onClick={() => close(true)}>Done</Button>}>The patient pays there with the rest of the visit.</Callout>
  if (!due.length) return <div className="flex flex-wrap items-center gap-3 text-13">
    <span className="text-muted">Sent to the cashier: the patient pays there with the rest of the visit.</span>
    <Button size="sm" variant="ghost" className="ms-auto" onClick={() => close()}>Close</Button></div>
  return <div className="grid gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void send() } }}>
    <p className={cn(LABEL)}>{dept.name} · to the cashier</p>
    {due.map((l, i) => <div key={`${l.order ?? ''}:${i}`} className="flex items-baseline gap-3 text-13">
      <span className="min-w-0 flex-1 truncate text-fg">{lineWords(l)}</span><span className="tnum text-fg">{egp(centsOf([l]))}</span></div>)}
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
      <span className="text-14 font-semibold text-fg tnum">Total {egp(centsOf(due))}</span>
      {due.some((l) => !!l.order && d.sent.has(l.order)) && <span className="text-12 text-muted">Sent before for some of these: sending again replaces what is not paid yet.</span>}
      <span className="ms-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => close()}>Cancel</Button>
        <Button size="sm" loading={busy} onClick={() => void send()}><Send />Send to cashier</Button></span>
    </div>
    {!!error && <p role="alert" className="text-12 text-danger">Not sent: {errorText(error)}</p>}
  </div>
}
