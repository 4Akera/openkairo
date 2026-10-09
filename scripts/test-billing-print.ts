// The receipt printed through the core's print run (spec/openCare.md §5.4 Printing, §3.13; fixes from review 2026-10-08), against a
// pretend browser: the read logged first, then billing's own copy (billing.print), then drawn — so a print refused or busy counts no
// copy, a later copy says Reprint at the server's time of it, and a receipt given back meanwhile prints as given back. Run by
// npm run test:billing after test-billing.ts.
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { receiptView, recordCopy, type Payment, type PrintCopy, type ReceiptView } from '../src/packs/billing/money'
import { ReceiptSlip } from '../src/packs/billing/ReceiptSlip'
import { printer, type PrintEnv, type PrintJob, type Recorded } from '../src/core/print/session'
import { registerPrintout } from '../src/core/print/registry'
import { setClinicTimeZone } from '../src/core/ui/time'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = async (name: string, fn: () => Promise<void>) => { try { await fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const nameOf = (id: string | null | undefined) => (id && ({ im: 'Internal Medicine', ph: 'Pharmacy' } as Record<string, string>)[id]) || null
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
const header = { name: 'Nile Clinic', logo: null, address: '12 Nile St, Cairo', phone: null, tax_number: null }
const paid: Payment = { payment_id: 'p1', receipt: 'R-00412', department_id: 'cash', patient_id: 'pt', method: 'cash', total: '150.00', discount: 0, discount_reason: null,
  received: '200.00', change: '50.00', at: '2026-10-08T07:05:00Z', author_id: 'u', by: 'Mona Saad', reason: null, refund_of: null, refunded_by: null,
  lines: [{ n: 1, kind: 'charge', department_id: 'im', name: null, quantity: null, amount: '150.00', typed: false }], prints: [] }
// a receipt printed through the core's print run (session.ts) against a pretend browser: the read logged, then billing's copy, then drawn
const copy = (over: Partial<PrintCopy> = {}): PrintCopy => ({ copy: 1, reprint: false, at: '2026-10-08T07:42:00Z', first_at: '2026-10-08T07:42:00Z', refunded_by: null, refund_of: null, ...over })
function till(log: () => Promise<string | null | void> = async () => null, dialog: () => Promise<void> = async () => {}) {
  const steps: string[] = []; const drawn: { data: ReceiptView; reprint: string | null }[] = []
  const env: PrintEnv = { log: async () => { steps.push('log'); return log() }, draw: async (_p, j, reprint) => { steps.push('draw'); drawn.push({ data: j.data as ReceiptView, reprint }); return 300 },
    style: () => {}, dialog, unstyle: () => {}, clear: () => {}, now: () => new Date('2026-10-08T07:38:00Z'), time: (at) => at.toISOString().slice(11, 16),
    memory: { seen: () => false, keep: () => {} } }
  return { print: printer(env), steps, drawn }
}
const viewOf = (x: Payment) => receiptView(x, nameOf, { name: 'Magdy Rizk', number: 3301 })
registerPrintout<ReceiptView>('billing.receipt', { paper: 'receipt', Component: ReceiptSlip })
const printJob = (record: () => Promise<Recorded<ReceiptView>>) => ({ key: 'billing.receipt', data: viewOf(paid), header, thing: paid.receipt, patientId: 'pt', purpose: 'PATADMIN', record } as PrintJob)
await test('a receipt\'s copy is counted only once the read is logged and the printer is free: a print refused or failed first counts none', async () => {
  let copies = 0; const billingPrint = async () => { copies++; return copy({ copy: copies, reprint: copies > 1 }) }
  const refused = till(async () => { throw new Error('not_allowed: read:patients') })
  await assert.rejects(refused.print(printJob(recordCopy(paid, billingPrint, viewOf))), /not_allowed/)
  assert.equal(copies, 0, 'the read refused: no copy counted, so the first paper that comes out is no Reprint'); assert.deepEqual(refused.steps, ['log'])
  let release: (() => void) | null = null; const busy = till(async () => null, () => new Promise<void>((r) => { release = r }))
  const first = busy.print(printJob(recordCopy(paid, billingPrint, viewOf))); await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(await busy.print(printJob(recordCopy(paid, billingPrint, viewOf))), { printed: false, why: 'busy' })
  assert.equal(copies, 1, 'P twice while the dialog is open: one copy'); release!()
  assert.deepEqual(await first, { printed: true, reprint: null }, 'the original'); assert.deepEqual(busy.steps, ['log', 'draw'])
})
await test('a later copy says Reprint at the server\'s time of it; a receipt given back at another desk meanwhile prints as given back', async () => {
  const t = till()
  assert.deepEqual(await t.print(printJob(recordCopy(paid, async () => copy({ copy: 2, reprint: true, at: '2026-10-08T07:50:00Z' }), viewOf))), { printed: true, reprint: '07:50' },
    'this computer\'s clock says 07:38: the paper says the server\'s 07:50, as the screen\'s "again 07:50" does')
  assert.equal(t.drawn[0].data.refunded, null)
  await t.print(printJob(recordCopy(paid, async () => copy({ refunded_by: 'R-00413' }), viewOf)))
  assert.equal(t.drawn[1].data.refunded, 'Refunded · given back on R-00413', 'the screen still showed it paid; the paper says it was given back')
  assert.match(text(renderToStaticMarkup(createElement(ReceiptSlip, { data: t.drawn[1].data, header, reprint: t.drawn[1].reprint }))), /Refunded · given back on R-00413/)
})
console.log(`billing (the receipt printed): ${n} groups passed`)
