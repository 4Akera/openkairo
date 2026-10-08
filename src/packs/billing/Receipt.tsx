// The receipt (spec §5.4, the bill-receipt picture), shown and kept: the clinic's header, its receipt number, the date and time, the
// patient and record number, the lines (a department's sent or handed lines as one), the total, the discount and its reason, the cash
// received and the change (or Card), who took it — drawn once (ReceiptPaper) for the screen and the receipt roll alike. Print receipt
// (P) and Print again (§3.13 Printing, owner 2026-10-08): billing records each copy before it prints, so a later one is marked
// "Reprint" with its time even after a reload; the core logs the print of the patient's receipt like a read. A refund is a payment of
// its own naming the receipt it undoes, with its reason, and prints its own slip: Give back… folds out under the receipt for whoever
// may, and the slip it makes is shown there to print.
import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { packOp } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { nameOf } from '@core/db/views'
import type { PatientBanner } from '@core/db/types'
import { PrintButton, useClinicHeader, usePrint } from '@core/print'
import { Button, Card, Input, cn, errorText, hm } from '@core/ui'
import { useBillingDone, usePaid } from './hooks'
import { egp, printedWords, receiptView, signed, type Payment } from './money'
import { ReceiptPaper } from './ReceiptPaper'

export function Receipt({ payment: p, departmentId, patient, onGiven }: { payment: Payment; departmentId: string; patient: PatientBanner | null; onGiven?: (receipt: string) => void }) {
  const { org, can } = useDepartment(); const header = useClinicHeader(); const print = usePrint(); const done = useBillingDone()
  const view = receiptView(p, (id) => nameOf(org, id), patient ? { name: `${patient.given_name} ${patient.family_name}`, number: patient.record_number } : null)
  // each copy recorded first (the first is the original), then printed: the copy knows whether it is a reprint
  const printIt = async () => {
    const c = await packOp<{ reprint: boolean }>('billing.print', departmentId, { payment_id: p.payment_id })
    try { return await print({ key: 'billing.receipt', data: view, thing: p.receipt, patientId: p.patient_id, purpose: 'PATADMIN', again: c.reprint }) } finally { void done() }
  }
  const copies = printedWords(p.prints, hm)
  return <div className="grid justify-items-center gap-2">
    <Card className="w-full max-w-md p-5 text-13"><ReceiptPaper view={view} header={header} /></Card>
    {can('read:billing.cashier') && <div className="flex w-full max-w-md flex-wrap items-center gap-2">
      <PrintButton label={view.refund ? 'Print refund slip' : 'Print receipt'} keyed printed={(p.prints ?? []).length > 0} print={printIt} />
      {copies && <span className="text-12 text-faint tnum">{copies}</span>}</div>}
    {!view.refund && can('write:billing.refund') && <GiveBack payment={p} departmentId={departmentId} patient={patient} onGiven={onGiven} />}
  </div>
}

/** Give back…: a one-line reason, then the refund, a payment of its own with its own number; its slip is shown here, to print */
function GiveBack({ payment, departmentId, patient, onGiven }: { payment: Payment; departmentId: string; patient: PatientBanner | null; onGiven?: (receipt: string) => void }) {
  const done = useBillingDone()
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const [given, setGiven] = useState<string | null>(null); const slip = usePaid(departmentId, { payment_id: given ?? undefined }, !!given)
  const give = async () => {
    setBusy(true); setError(null)
    try { const r = await packOp<{ receipt: string; payment_id: string }>('billing.refund', departmentId, { payment_id: payment.payment_id, reason: reason.trim() }); await done(); setOpen(false); setGiven(r.payment_id); onGiven?.(r.receipt) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  if (given) return slip.data?.payments[0] ? <Receipt payment={slip.data.payments[0]} departmentId={departmentId} patient={patient} /> : null
  if (payment.refunded_by) return null
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Undo2 />Give back…</Button>
  return <div className="flex w-full max-w-md flex-wrap items-center gap-2">
    <Input dense autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) void give(); if (e.key === 'Escape') setOpen(false) }}
      placeholder="Why it is given back" aria-label="Why it is given back" className="min-w-0 flex-1" />
    <Button size="sm" variant="outline" loading={busy} disabled={!reason.trim()} onClick={() => void give()}>Give back {egp(signed(payment.total))}</Button>
    <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    {!!error && <p className={cn('w-full text-12 text-danger')}>{errorText(error)}</p>}
  </div>
}
