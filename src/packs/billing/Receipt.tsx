// The receipt (spec §5.4, the bill-receipt picture), shown and kept: the clinic, its receipt number, the date and time, the patient and
// record number, the lines (a department's sent or handed lines as one), the total, the discount and its reason, the cash received and
// the change (or Card), who took it. No print button (printing comes later). A refund is a payment of its own naming the receipt it
// undoes, with its reason: Give back… folds out under it for whoever may.
import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { packOp } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { nameOf } from '@core/db/views'
import type { PatientBanner } from '@core/db/types'
import { Button, Card, Input, cn, dateTime, errorText } from '@core/ui'
import { useBillingDone } from './hooks'
import { egp, receiptLines, signed, type Payment } from './money'

export function Receipt({ payment: p, departmentId, patient, onGiven }: { payment: Payment; departmentId: string; patient: PatientBanner | null; onGiven?: (receipt: string) => void }) {
  const { org, can } = useDepartment()
  const refund = !!p.refund_of; const discount = signed(p.discount)
  return <div className="grid justify-items-center gap-2">
    <Card className="w-full max-w-md p-5 text-13">
      <p className="text-center text-16 font-semibold text-fg">{org?.organization.name}</p>
      <p className="text-center text-12 text-muted">{refund ? 'Refund' : 'Receipt'} {p.receipt} · {dateTime(p.at)}</p>
      <div className="my-3 border-y border-dashed border-line py-2">
        <p className="text-fg">{patient ? `${patient.given_name} ${patient.family_name} · ${patient.record_number}` : p.patient_id ? '…' : 'No patient on record'}</p>
        {refund && <p className="text-12 text-muted">Gives back {p.refund_of}{p.reason ? ` · ${p.reason}` : ''}</p>}
      </div>
      {receiptLines(p, (id) => nameOf(org, id)).map((l, i) => <div key={i} className="flex justify-between gap-3 py-0.5"><span className="text-fg">{l.words}</span>
        <span className="shrink-0 tnum text-fg">{egp(l.amount)}</span></div>)}
      {discount !== 0 && <div className="flex justify-between text-muted"><span>Discount{p.discount_reason ? ` · ${p.discount_reason}` : ''}</span><span className="tnum">{egp(-discount)}</span></div>}
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold text-fg"><span>Total</span><span className="tnum">{egp(signed(p.total))}</span></div>
      {p.method === 'cash' && p.received != null ? <>
        <div className="flex justify-between text-muted"><span>Cash received</span><span className="tnum">{egp(signed(p.received))}</span></div>
        <div className="flex justify-between text-muted"><span>Change</span><span className="tnum">{egp(signed(p.change))}</span></div></>
        : <div className="flex justify-between text-muted"><span>{p.method === 'card' ? 'Card' : 'Cash'}</span><span className="tnum">{egp(signed(p.total))}</span></div>}
      <p className="mt-3 text-center text-12 text-faint">{refund ? 'Given back' : 'Taken'} by {p.by ?? '…'}{p.refunded_by ? ` · given back on ${p.refunded_by}` : ''}</p>
    </Card>
    {!refund && !p.refunded_by && can('write:billing.refund') && <GiveBack payment={p} departmentId={departmentId} onGiven={onGiven} />}
  </div>
}

/** Give back…: a one-line reason, then the refund, a payment of its own with its own number */
function GiveBack({ payment, departmentId, onGiven }: { payment: Payment; departmentId: string; onGiven?: (receipt: string) => void }) {
  const done = useBillingDone()
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const give = async () => {
    setBusy(true); setError(null)
    try { const r = await packOp<{ receipt: string }>('billing.refund', departmentId, { payment_id: payment.payment_id, reason: reason.trim() }); await done(); setOpen(false); onGiven?.(r.receipt) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Undo2 />Give back…</Button>
  return <div className="flex w-full max-w-md flex-wrap items-center gap-2">
    <Input dense autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) void give(); if (e.key === 'Escape') setOpen(false) }}
      placeholder="Why it is given back" aria-label="Why it is given back" className="min-w-0 flex-1" />
    <Button size="sm" variant="outline" loading={busy} disabled={!reason.trim()} onClick={() => void give()}>Give back {egp(signed(payment.total))}</Button>
    <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    {!!error && <p className={cn('w-full text-12 text-danger')}>{errorText(error)}</p>}
  </div>
}
