import { describe, it, expect } from 'vitest'
import { admissionDayN, occupancyLabel, groupCensus } from '../wards'
import { isWard, isQueueDept, deptSummary } from '../queues'
import type { Department } from '../../types'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const dept = (overrides: Partial<Department>): Department => ({
  id: 'd1',
  name: 'X',
  slug: 'x',
  description: null,
  icon: 'building-2',
  color: 'slate',
  can_receive_orders: false,
  can_create_direct: false,
  can_receive_patients: false,
  active: true,
  sort_order: 0,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('admissionDayN', () => {
  const now = Date.parse('2026-08-09T12:00:00Z')
  it('is day 1 on the admission day', () => {
    expect(admissionDayN(new Date(now - 2 * HOUR).toISOString(), now)).toBe(1)
  })
  it('rolls to day 2 after 24h', () => {
    expect(admissionDayN(new Date(now - 26 * HOUR).toISOString(), now)).toBe(2)
  })
  it('counts long stays', () => {
    expect(admissionDayN(new Date(now - 5 * DAY - HOUR).toISOString(), now)).toBe(6)
  })
  it('clamps future timestamps to day 1', () => {
    expect(admissionDayN(new Date(now + HOUR).toISOString(), now)).toBe(1)
  })
})

describe('occupancyLabel', () => {
  it('shows n / capacity when declared', () => {
    expect(occupancyLabel(4, 12)).toBe('4 / 12')
  })
  it('shows plain count without capacity', () => {
    expect(occupancyLabel(3, null)).toBe('3')
    expect(occupancyLabel(0, undefined)).toBe('0')
  })
})

describe('groupCensus', () => {
  const w1 = dept({ id: 'w1', kind: 'ward', name: 'Medical' })
  const w2 = dept({ id: 'w2', kind: 'ward', name: 'Surgical' })
  it('groups rows under their ward, longest stay first', () => {
    const rows = [
      { ward_id: 'w1', admitted_at: '2026-08-09T08:00:00Z' },
      { ward_id: 'w2', admitted_at: '2026-08-08T10:00:00Z' },
      { ward_id: 'w1', admitted_at: '2026-08-07T09:00:00Z' },
    ]
    const grouped = groupCensus([w1, w2], rows)
    expect(grouped[0].ward.id).toBe('w1')
    expect(grouped[0].rows.map(r => r.admitted_at)).toEqual([
      '2026-08-07T09:00:00Z',
      '2026-08-09T08:00:00Z',
    ])
    expect(grouped[1].rows).toHaveLength(1)
  })
  it('keeps empty wards so the census shows every ward', () => {
    expect(groupCensus([w1, w2], [])[1].rows).toEqual([])
  })
})

describe('ward flavor vs queues', () => {
  it('isWard only on explicit kind', () => {
    expect(isWard(dept({ kind: 'ward' }))).toBe(true)
    expect(isWard(dept({}))).toBe(false)
    expect(isWard(dept({ kind: 'unit' }))).toBe(false)
  })
  it('a ward never presents as a queue, even with stray flags', () => {
    expect(isQueueDept(dept({ kind: 'ward', can_receive_patients: true }))).toBe(false)
    expect(isQueueDept(dept({ can_receive_patients: true }))).toBe(true)
  })
  it('deptSummary says ward with beds', () => {
    expect(deptSummary(dept({ kind: 'ward', capacity: 12 }), 0)).toBe('Ward · 12 beds')
    expect(deptSummary(dept({ kind: 'ward' }), 0)).toBe('Ward')
  })
})
