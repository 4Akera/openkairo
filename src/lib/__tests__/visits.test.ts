import { describe, it, expect } from 'vitest'
import { referralSourceLabel } from '../visits'

describe('referralSourceLabel', () => {
  it('null for non-referral visits', () => {
    expect(referralSourceLabel({ referred_from_visit_id: null, referred_from: null })).toBeNull()
  })

  it('origin department name when joined as object', () => {
    expect(referralSourceLabel({
      referred_from_visit_id: 'v1',
      referred_from: { department_id: 'd1', departments: { name: 'General OPD' } },
    })).toBe('General OPD')
  })

  it('origin department name when PostgREST returns arrays', () => {
    expect(referralSourceLabel({
      referred_from_visit_id: 'v1',
      referred_from: [{ department_id: 'd1', departments: [{ name: 'Cardiology' }] }],
    })).toBe('Cardiology')
  })

  it('General when the origin sat in the default queue', () => {
    expect(referralSourceLabel({
      referred_from_visit_id: 'v1',
      referred_from: { department_id: null, departments: null },
    })).toBe('General')
  })

  it('General when the origin row is not joined (deleted origin)', () => {
    expect(referralSourceLabel({ referred_from_visit_id: 'v1', referred_from: null })).toBe('General')
  })
})
