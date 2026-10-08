// The billing pack's client (spec/openCare.md §5.4): its three screens — the Cashier (who owes, the payment card folded out under the
// row, receipts), Today (the day's totals, closing the drawer) and Prices (Billing → Prices) — and the words for its refusals; and, on
// the rows of every list of a department that uses billing (core changes (a)–(c)), its one button (Pay, or Send to cashier with the
// lines the row hands) and its soft check (Pay first: "Waiting for payment" on an order not paid, "…anyway" recorded with its reason).
// Money never reaches the chart: these read billing's own tables through its operations, and only where a department uses billing.
import { registerScreen } from '@core/screens/registry'
import { registerRowAction, registerSoftCheck, type PackRow, type RowCtx } from '@core/screens/rows'
import { registerWords } from '@core/db/words'
import { packOp } from '@core/db/rpc'
import { settingIn } from '@core/screens/settings/form/model'
import { Cashier } from './Cashier'
import { Today } from './Today'
import { Prices } from './Prices'
import { RowCard } from './RowCard'
import { REFUSALS } from './words'
import type { Desk, Owed } from './money'
import { anywayLines, asSent, noData, ordersOf, rowButton, rowData, rowWaits, type RowData, type Waiting } from './rows'

registerScreen('billing.cashier', Cashier)
registerScreen('billing.today', Today)
registerScreen('billing.prices', Prices)
registerWords(REFUSALS)

/** Takes payment here, as the department's settings stand */
const deskOf = (ctx: RowCtx): Desk => (settingIn(ctx.org, 'billing.desk', ctx.dept.id).takes as Desk | undefined) ?? 'none'
/** the waiting read for a list's orders, for whoever works the list (its gate); none to ask, nothing */
async function waitingOf(rows: PackRow[], ctx: RowCtx, args: Record<string, unknown>): Promise<Waiting | null> {
  if (!ctx.can('read:bench')) return null
  const parts = await Promise.all(ordersOf(rows).map((orders) => packOp<Waiting>('billing.waiting', ctx.dept.id, { orders, ...args })))
  return parts.reduce<Waiting>((a, w) => ({ ...w, waiting: [...a.waiting, ...w.waiting], paid: [...(a.paid ?? []), ...(w.paid ?? [])], ahead: [...(a.ahead ?? []), ...(w.ahead ?? [])],
    sent: { ...a.sent, ...w.sent } }), { waiting: [], paid: [], ahead: [], sent: {} })
}
/** who on the list owes this desk, for whoever takes payment here (200 patients a read) */
async function owedOf(rows: PackRow[], ctx: RowCtx, desk: Desk) {
  if (desk === 'none' || !ctx.can('write:billing.payment') || !ctx.can('read:billing.cashier')) return null
  const pts = [...new Set(rows.map((r) => r.patient_id))].sort(); const out: Owed['rows'] = []
  for (let i = 0; i < pts.length; i += 200) out.push(...(await packOp<Owed>('billing.owed', ctx.dept.id, { patients: pts.slice(i, i + 200), limit: 200 })).rows)
  return out
}

// (a) its one button on a row: Pay, or Send to cashier with the lines the row hands; its card folds out under the row
registerRowAction('billing', {
  load: async (rows, ctx): Promise<RowData> => {
    const desk = deskOf(ctx)
    const [w, owed] = await Promise.all([waitingOf(rows, ctx, { sent: true }), owedOf(rows, ctx, desk)])
    return rowData(desk, w, owed)
  },
  button: (row, ctx, data) => rowButton(row, ctx.can, (data as RowData | undefined) ?? noData(deskOf(ctx))),
  Card: RowCard,
})

// (c) Pay first, a soft check: an order not paid in a department with Pay first waits ("Waiting for payment"), per order; going ahead
// anyway is recorded by billing with its reason, who and when, and the lines the row hands for those orders go to the cashier first
registerSoftCheck('billing', {
  load: async (rows, ctx): Promise<RowData> => rowData(deskOf(ctx), await waitingOf(rows, ctx, ctx.list === 'chart' ? { anywhere: true } : {}), null),
  waiting: (row, ctx, data) => rowWaits(row, ctx.list, (data as RowData | undefined) ?? noData()),
  anyway: async ({ row, orders, reason, ctx }) => {
    const ls = anywayLines(row, orders)
    if (ls.length) {
      const w = await packOp<Waiting>('billing.waiting', ctx.dept.id, { orders: [...new Set(ls.map((l) => l.order!))], sent: true })
      const unsent = ls.filter((l) => !(l.order! in (w.sent ?? {})) && !(w.paid ?? []).includes(l.order!))
      if (unsent.length) await packOp('billing.send', ctx.dept.id, { patient_id: row.patient_id, ...(row.visit_id ? { visit_id: row.visit_id } : {}), lines: asSent(unsent) })
    }
    for (const o of orders) await packOp('billing.anyway', ctx.dept.id, { order_item: o, reason })
  },
})

export const key = 'billing'
