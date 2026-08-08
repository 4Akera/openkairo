/**
 * ONE money ledger for the client — mirrors the `patient_balance` view:
 * what a patient owes is the sum of counted charges minus the sum of
 * payments, full stop. Every "due" number in the UI (Billing page,
 * Cashier lane, Collect button) comes from here so they can never
 * disagree.
 *
 * Charge status flags are treated as display hints, not money state:
 * a payment recorded without charge allocation (the old flow allowed
 * it) leaves flags stale, so `walkLedger` re-derives which charges are
 * effectively settled by covering the oldest first with the recorded
 * payment total. `allocatePayment` returns the flags to persist when a
 * new payment is written, converging the flags with the ledger lazily.
 */
import type { Charge } from '../types'

export type LedgerCharge = Pick<Charge, 'id' | 'status' | 'quantity' | 'unit_price' | 'created_at'>

/** Statuses the patient_balance view counts toward what the patient owes. */
const COUNTED_STATUSES = new Set(['pending', 'invoiced', 'paid'])

export function chargeAmount(c: Pick<Charge, 'quantity' | 'unit_price'>): number {
  return c.quantity * c.unit_price
}

const toCents = (n: number) => Math.round(n * 100)

function byOldestFirst(a: LedgerCharge, b: LedgerCharge): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}

export interface LedgerView {
  /** What to collect right now: max(0, counted charges − payments). */
  dueNow: number
  /** Overpayment held on account: max(0, payments − counted charges). */
  credit: number
  countedTotal: number
  /** Counted charges regarded as settled — flagged paid, or covered oldest-first by payments. */
  settledIds: Set<string>
  /** Counted charges still owed, oldest first (the first may be partially covered). */
  outstanding: LedgerCharge[]
}

export function walkLedger(charges: LedgerCharge[], totalPayments: number): LedgerView {
  const counted = charges.filter(c => COUNTED_STATUSES.has(c.status)).sort(byOldestFirst)
  const countedTotalC = counted.reduce((s, c) => s + toCents(chargeAmount(c)), 0)
  const paymentsC = toCents(totalPayments)

  const settledIds = new Set<string>()
  let availableC = paymentsC
  for (const c of counted) {
    if (c.status !== 'paid') continue
    settledIds.add(c.id)
    availableC -= toCents(chargeAmount(c))
  }
  if (availableC < 0) availableC = 0

  const outstanding: LedgerCharge[] = []
  for (const c of counted) {
    if (c.status === 'paid') continue
    const amountC = toCents(chargeAmount(c))
    if (amountC <= availableC) {
      settledIds.add(c.id)
      availableC -= amountC
    } else {
      outstanding.push(c)
    }
  }

  return {
    dueNow: Math.max(0, countedTotalC - paymentsC) / 100,
    credit: Math.max(0, paymentsC - countedTotalC) / 100,
    countedTotal: countedTotalC / 100,
    settledIds,
    outstanding,
  }
}

/**
 * Charge ids to flag `paid` when a payment of `amount` is recorded now.
 *
 * Default mode covers the whole ledger: every counted charge covered by
 * (prior payments + amount) that isn't already flagged paid — including
 * charges left stale by old unallocated payments, so flags converge.
 * With `onlyIds` (an explicit partial settle) the money covers just that
 * selection, oldest first; a charge it can't fully cover stays due.
 */
export function allocatePayment(
  charges: LedgerCharge[],
  totalPaymentsBefore: number,
  amount: number,
  onlyIds?: Set<string>,
): string[] {
  if (onlyIds) {
    const selection = charges
      .filter(c => onlyIds.has(c.id) && c.status !== 'paid' && COUNTED_STATUSES.has(c.status))
      .sort(byOldestFirst)
    let availableC = toCents(amount)
    const ids: string[] = []
    for (const c of selection) {
      const amountC = toCents(chargeAmount(c))
      if (amountC > availableC) break
      ids.push(c.id)
      availableC -= amountC
    }
    return ids
  }
  const after = walkLedger(charges, totalPaymentsBefore + amount)
  return charges.filter(c => c.status !== 'paid' && after.settledIds.has(c.id)).map(c => c.id)
}
