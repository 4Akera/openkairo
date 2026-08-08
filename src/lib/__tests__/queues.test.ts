import { describe, it, expect } from 'vitest'
import { isQueueDept } from '../queues'
import type { Department } from '../../types'

const dept = (caps: Partial<Department>): Department => ({
  id: 'd1', name: 'X', slug: 'x', description: null, icon: 'building-2',
  color: 'slate', can_receive_orders: false, can_create_direct: false,
  can_receive_patients: false, active: true, sort_order: 0,
  created_by: null, created_at: '', ...caps,
} as Department)

describe('isQueueDept', () => {
  it('pure patient lane is a queue', () => {
    expect(isQueueDept(dept({ can_receive_patients: true }))).toBe(true)
  })
  it('order-capable units are departments even if they see patients (hybrid)', () => {
    expect(isQueueDept(dept({ can_receive_patients: true, can_receive_orders: true }))).toBe(false)
    expect(isQueueDept(dept({ can_receive_patients: true, can_create_direct: true }))).toBe(false)
  })
  it('a unit with no capabilities at all is not a queue', () => {
    expect(isQueueDept(dept({}))).toBe(false)
  })
})
