import { describe, it, expect } from 'vitest'
import { walkLedger, allocatePayment, chargeAmount, type LedgerCharge } from '../billing'

let seq = 0
function charge(over: Partial<LedgerCharge> & { unit_price: number }): LedgerCharge {
  seq += 1
  return {
    id: over.id ?? `c${seq}`,
    status: over.status ?? 'pending',
    quantity: over.quantity ?? 1,
    unit_price: over.unit_price,
    created_at: over.created_at ?? `2026-08-08T08:0${seq % 10}:00Z`,
  }
}

describe('walkLedger', () => {
  it('no payments → everything pending is outstanding and due', () => {
    const charges = [charge({ unit_price: 100 }), charge({ unit_price: 50 })]
    const v = walkLedger(charges, 0)
    expect(v.dueNow).toBe(150)
    expect(v.credit).toBe(0)
    expect(v.outstanding.map(c => chargeAmount(c))).toEqual([100, 50])
    expect(v.settledIds.size).toBe(0)
  })

  it('payments cover oldest first; partially covered charge stays outstanding', () => {
    const a = charge({ id: 'a', unit_price: 100, created_at: '2026-08-01T00:00:00Z' })
    const b = charge({ id: 'b', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    const c = charge({ id: 'c', unit_price: 30, created_at: '2026-08-03T00:00:00Z' })
    const v = walkLedger([c, a, b], 120)
    expect(v.dueNow).toBe(60)
    expect(v.settledIds).toEqual(new Set(['a']))
    // b is only partially covered (20 of 50) → still outstanding, c untouched
    expect(v.outstanding.map(x => x.id)).toEqual(['b', 'c'])
  })

  it('overpayment → zero due, credit, everything settled', () => {
    const charges = [charge({ unit_price: 100 }), charge({ unit_price: 50 })]
    const v = walkLedger(charges, 200)
    expect(v.dueNow).toBe(0)
    expect(v.credit).toBe(50)
    expect(v.settledIds.size).toBe(2)
    expect(v.outstanding).toEqual([])
  })

  it('stale flags: unallocated payments still settle pending charges (the Robert case)', () => {
    // 347 of pending charges, 700 paid but never allocated
    const charges = [
      charge({ unit_price: 285, created_at: '2026-04-11T00:00:00Z' }),
      charge({ unit_price: 62, created_at: '2026-04-11T00:01:00Z' }),
    ]
    const v = walkLedger(charges, 700)
    expect(v.dueNow).toBe(0)
    expect(v.credit).toBe(353)
    expect(v.settledIds.size).toBe(2)
  })

  it('db-paid charges consume payment money before covering pending ones', () => {
    const paid = charge({ id: 'p', status: 'paid', unit_price: 80, created_at: '2026-08-01T00:00:00Z' })
    const due = charge({ id: 'd', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    // 100 recorded: 80 consumed by the paid charge, 20 left — not enough for d
    const v = walkLedger([paid, due], 100)
    expect(v.settledIds).toEqual(new Set(['p']))
    expect(v.outstanding.map(x => x.id)).toEqual(['d'])
    expect(v.dueNow).toBe(30)
  })

  it('insurance, approval, void, and waived charges are not part of the ledger', () => {
    const charges = [
      charge({ unit_price: 10 }),
      charge({ status: 'pending_insurance', unit_price: 100 }),
      charge({ status: 'pending_approval', unit_price: 100 }),
      charge({ status: 'void', unit_price: 100 }),
      charge({ status: 'waived', unit_price: 100 }),
    ]
    const v = walkLedger(charges, 0)
    expect(v.dueNow).toBe(10)
    expect(v.countedTotal).toBe(10)
    expect(v.outstanding).toHaveLength(1)
  })

  it('works in cents — no float drift', () => {
    const charges = [charge({ unit_price: 0.1 }), charge({ unit_price: 0.2 })]
    const v = walkLedger(charges, 0.3)
    expect(v.dueNow).toBe(0)
    expect(v.credit).toBe(0)
    expect(v.settledIds.size).toBe(2)
  })

  it('quantity multiplies into the ledger', () => {
    const v = walkLedger([charge({ unit_price: 25, quantity: 3 })], 50)
    expect(v.dueNow).toBe(25)
  })
})

describe('allocatePayment', () => {
  it('full collect flips every covered charge, including stale ones', () => {
    const a = charge({ id: 'a', unit_price: 100, created_at: '2026-08-01T00:00:00Z' })
    const b = charge({ id: 'b', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    expect(allocatePayment([a, b], 0, 150)).toEqual(['a', 'b'])
  })

  it('prior unallocated payments count toward coverage (flags converge)', () => {
    const a = charge({ id: 'a', unit_price: 100, created_at: '2026-08-01T00:00:00Z' })
    const b = charge({ id: 'b', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    // 100 already recorded but never allocated; paying the remaining 50 settles both
    expect(allocatePayment([a, b], 100, 50)).toEqual(['a', 'b'])
  })

  it('partial amount flips only fully covered charges, oldest first', () => {
    const a = charge({ id: 'a', unit_price: 100, created_at: '2026-08-01T00:00:00Z' })
    const b = charge({ id: 'b', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    expect(allocatePayment([a, b], 0, 120)).toEqual(['a'])
  })

  it('already-paid charges are never re-flagged', () => {
    const p = charge({ id: 'p', status: 'paid', unit_price: 80 })
    const d = charge({ id: 'd', unit_price: 50 })
    expect(allocatePayment([p, d], 80, 50)).toEqual(['d'])
  })

  it('selection mode covers only the selected charges with the amount alone', () => {
    const a = charge({ id: 'a', unit_price: 100, created_at: '2026-08-01T00:00:00Z' })
    const b = charge({ id: 'b', unit_price: 50, created_at: '2026-08-02T00:00:00Z' })
    const c = charge({ id: 'c', unit_price: 30, created_at: '2026-08-03T00:00:00Z' })
    expect(allocatePayment([a, b, c], 0, 80, new Set(['b', 'c']))).toEqual(['b', 'c'])
    // amount too small for the older selected charge → nothing flips
    expect(allocatePayment([a, b, c], 0, 40, new Set(['a']))).toEqual([])
    // non-counted selections are ignored
    const ins = charge({ id: 'i', status: 'pending_insurance', unit_price: 10 })
    expect(allocatePayment([a, ins], 0, 10, new Set(['i']))).toEqual([])
  })
})
