import { describe, it, expect } from 'vitest'
import { deptSummary, isQueueDept, isWorkDept } from '../queues'
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

describe('isWorkDept', () => {
  it('order and direct-entry units have a work view', () => {
    expect(isWorkDept(dept({ can_receive_orders: true }))).toBe(true)
    expect(isWorkDept(dept({ can_create_direct: true }))).toBe(true)
  })
  it('hybrid clinic keeps its work view', () => {
    expect(isWorkDept(dept({ can_receive_patients: true, can_receive_orders: true }))).toBe(true)
  })
  it('pure queues and wards have no work view', () => {
    expect(isWorkDept(dept({ can_receive_patients: true }))).toBe(false)
    expect(isWorkDept(dept({ kind: 'ward' }))).toBe(false)
  })
})

describe('deptSummary', () => {
  it('pure clinic — queue on Today, no service talk', () => {
    expect(deptSummary(dept({ can_receive_patients: true }), 0)).toBe('Clinic · queue on Today')
  })
  it('order department counts its services', () => {
    expect(deptSummary(dept({ can_receive_orders: true, can_create_direct: true }), 14)).toBe('Fulfils orders · 14 services')
  })
  it('hybrid leads with Clinic', () => {
    expect(deptSummary(dept({ can_receive_patients: true, can_receive_orders: true, can_create_direct: true }), 3))
      .toBe('Clinic · fulfils orders · 3 services')
  })
  it('direct-only unit reads walk-in entries', () => {
    expect(deptSummary(dept({ can_create_direct: true }), 3)).toBe('Walk-in entries · 3 services')
  })
  it('singular service', () => {
    expect(deptSummary(dept({ can_receive_orders: true }), 1)).toBe('Fulfils orders · 1 service')
  })
  it('nothing enabled', () => {
    expect(deptSummary(dept({}), 0)).toBe('No capabilities')
  })

  it('clinic whose only service is the consult reads receives consults', () => {
    expect(deptSummary(dept({ can_receive_patients: true, can_receive_orders: true }), 1, 1))
      .toBe('Clinic · receives consults')
  })

  it('mixed services keep the plain orders phrase', () => {
    expect(deptSummary(dept({ can_receive_patients: true, can_receive_orders: true }), 3, 1))
      .toBe('Clinic · fulfils orders · 3 services')
  })
})
