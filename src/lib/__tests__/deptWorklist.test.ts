import { describe, it, expect } from 'vitest'
import {
  isStatOrder,
  laneOf,
  laneCounts,
  sortWorklist,
  nextInLane,
  waitedLabel,
  originOf,
  originCounts,
  OTHER_LANE,
  GENERAL_ORIGIN,
  type WorklistOrder,
} from '../deptWorklist'

function order(over: Partial<WorklistOrder> & { id: string }): WorklistOrder {
  return {
    status: 'pending',
    triggered_at: '2026-08-08T08:00:00Z',
    action_payload: {},
    order_block: null,
    ...over,
  }
}

function inLane(id: string, lane: string, over: Partial<WorklistOrder> = {}): WorklistOrder {
  return order({ id, order_block: { order_block_type: { name: lane } }, ...over })
}

describe('isStatOrder', () => {
  it('reads priority from the action payload', () => {
    expect(isStatOrder(order({ id: 'a', action_payload: { priority: 'stat' } }))).toBe(true)
    expect(isStatOrder(order({ id: 'b', action_payload: { priority: 'routine' } }))).toBe(false)
    expect(isStatOrder(order({ id: 'c', action_payload: null }))).toBe(false)
  })
})

describe('laneOf', () => {
  it('prefers the service (block type) name', () => {
    const o = order({
      id: 'a',
      order_block: { order_block_type: { name: 'CBC' }, order_def: { name: 'Lab Order' } },
    })
    expect(laneOf(o)).toBe('CBC')
  })

  it('falls back to the order definition name, then Other', () => {
    expect(laneOf(order({ id: 'a', order_block: { order_def: { name: 'Lab Order' } } }))).toBe('Lab Order')
    expect(laneOf(order({ id: 'b' }))).toBe(OTHER_LANE)
    expect(laneOf(order({ id: 'c', order_block: { order_block_type: { name: '  ' } } }))).toBe(OTHER_LANE)
  })

  it('resolves the payload block_type_id via the provided name map', () => {
    const names = new Map([['bt-1', 'X-Ray Chest']])
    const o = order({
      id: 'a',
      action_payload: { block_type_id: 'bt-1' },
      order_block: { order_def: { name: 'Radiology Request' } },
    })
    expect(laneOf(o, names)).toBe('X-Ray Chest')
    // joined service name still wins over the payload
    const joined = order({
      id: 'b',
      action_payload: { block_type_id: 'bt-1' },
      order_block: { order_block_type: { name: 'CT Head' } },
    })
    expect(laneOf(joined, names)).toBe('CT Head')
    // unknown id falls through to the definition name
    expect(laneOf(order({
      id: 'c',
      action_payload: { block_type_id: 'bt-9' },
      order_block: { order_def: { name: 'Radiology Request' } },
    }), names)).toBe('Radiology Request')
  })
})

describe('laneCounts', () => {
  it('groups by lane, busiest first, ties alphabetical', () => {
    const counts = laneCounts([
      inLane('1', 'CBC'),
      inLane('2', 'CBC', { action_payload: { priority: 'stat' } }),
      inLane('3', 'LFT'),
      inLane('4', 'Urinalysis'),
      inLane('5', 'LFT'),
    ])
    expect(counts.map(c => c.lane)).toEqual(['CBC', 'LFT', 'Urinalysis'])
    expect(counts[0]).toEqual({ lane: 'CBC', count: 2, statCount: 1 })
  })

  it('is empty for an empty queue', () => {
    expect(laneCounts([])).toEqual([])
  })
})

describe('sortWorklist', () => {
  it('pins STAT orders on top, oldest first within each group', () => {
    const sorted = sortWorklist([
      inLane('old', 'CBC', { triggered_at: '2026-08-08T07:00:00Z' }),
      inLane('stat-new', 'CBC', { triggered_at: '2026-08-08T09:00:00Z', action_payload: { priority: 'stat' } }),
      inLane('new', 'CBC', { triggered_at: '2026-08-08T08:00:00Z' }),
      inLane('stat-old', 'CBC', { triggered_at: '2026-08-08T08:30:00Z', action_payload: { priority: 'stat' } }),
    ])
    expect(sorted.map(o => o.id)).toEqual(['stat-old', 'stat-new', 'old', 'new'])
  })

  it('does not mutate the input', () => {
    const input = [
      inLane('b', 'CBC', { triggered_at: '2026-08-08T09:00:00Z' }),
      inLane('a', 'CBC', { triggered_at: '2026-08-08T08:00:00Z' }),
    ]
    sortWorklist(input)
    expect(input.map(o => o.id)).toEqual(['b', 'a'])
  })
})

describe('nextInLane', () => {
  const queue = [
    inLane('cbc-1', 'CBC', { triggered_at: '2026-08-08T08:00:00Z' }),
    inLane('cbc-2', 'CBC', { triggered_at: '2026-08-08T08:10:00Z' }),
    inLane('cbc-stat', 'CBC', { triggered_at: '2026-08-08T09:00:00Z', action_payload: { priority: 'stat' } }),
    inLane('lft-1', 'LFT', { triggered_at: '2026-08-08T07:00:00Z' }),
    inLane('cbc-done', 'CBC', { triggered_at: '2026-08-08T06:00:00Z', status: 'completed' }),
  ]

  it('returns the next open order in the same lane, STAT first', () => {
    expect(nextInLane(queue, queue[0])?.id).toBe('cbc-stat')
  })

  it('skips the current order, other lanes, and finished orders', () => {
    const next = nextInLane(queue, queue[2]) // current = cbc-stat
    expect(next?.id).toBe('cbc-1')
    expect(nextInLane(queue, queue[3])).toBeNull() // lft-1 is alone in its lane
  })

  it('returns null when the lane is exhausted', () => {
    expect(nextInLane([queue[0]], queue[0])).toBeNull()
  })
})

describe('waitedLabel', () => {
  const now = new Date('2026-08-08T12:00:00Z').getTime()

  it('shows minutes under an hour', () => {
    expect(waitedLabel('2026-08-08T11:48:00Z', now)).toBe('12m')
    expect(waitedLabel('2026-08-08T12:00:00Z', now)).toBe('0m')
  })

  it('shows hours and padded minutes under a day', () => {
    expect(waitedLabel('2026-08-08T08:55:00Z', now)).toBe('3h 05m')
    expect(waitedLabel('2026-08-08T09:00:00Z', now)).toBe('3h')
  })

  it('shows whole days beyond 24h', () => {
    expect(waitedLabel('2026-08-06T10:00:00Z', now)).toBe('2d')
  })

  it('never goes negative on clock skew', () => {
    expect(waitedLabel('2026-08-08T12:05:00Z', now)).toBe('0m')
  })
})

describe('originOf / originCounts', () => {
  const fromQueue = (id: string, name: string | null): WorklistOrder =>
    order({ id, encounter: name ? { department_id: 'q1', departments: { name } } : null })

  it('reads the encounter queue name; falls back to General', () => {
    expect(originOf(fromQueue('a', 'Cardiology'))).toBe('Cardiology')
    expect(originOf(fromQueue('b', null))).toBe(GENERAL_ORIGIN)
    expect(originOf(order({ id: 'c', encounter: { department_id: null, departments: null } }))).toBe(GENERAL_ORIGIN)
  })

  it('counts per origin, busiest first, ties alphabetical', () => {
    const counts = originCounts([
      fromQueue('a', 'Cardiology'),
      fromQueue('b', 'Cardiology'),
      fromQueue('c', null),
      fromQueue('d', 'Antenatal'),
    ])
    expect(counts).toEqual([
      { origin: 'Cardiology', count: 2 },
      { origin: 'Antenatal', count: 1 },
      { origin: GENERAL_ORIGIN, count: 1 },
    ])
  })
})
