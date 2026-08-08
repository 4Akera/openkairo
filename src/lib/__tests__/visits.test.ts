import { describe, it, expect } from 'vitest'
import { referralSourceLabel, averageWaitMinutes } from '../visits'

describe('referralSourceLabel', () => {
  it('null for non-referral visits', () => {
    expect(referralSourceLabel({ referred_from_encounter_id: null, referred_from: null })).toBeNull()
  })

  it('origin department name when joined as object', () => {
    expect(referralSourceLabel({
      referred_from_encounter_id: 'v1',
      referred_from: { department_id: 'd1', departments: { name: 'General OPD' } },
    })).toBe('General OPD')
  })

  it('origin department name when PostgREST returns arrays', () => {
    expect(referralSourceLabel({
      referred_from_encounter_id: 'v1',
      referred_from: [{ department_id: 'd1', departments: [{ name: 'Cardiology' }] }],
    })).toBe('Cardiology')
  })

  it('General when the origin sat in the default queue', () => {
    expect(referralSourceLabel({
      referred_from_encounter_id: 'v1',
      referred_from: { department_id: null, departments: null },
    })).toBe('General')
  })

  it('General when the origin row is not joined (deleted origin)', () => {
    expect(referralSourceLabel({ referred_from_encounter_id: 'v1', referred_from: null })).toBe('General')
  })
})

describe('averageWaitMinutes', () => {
  const at = (min: number) => new Date(min * 60000).toISOString()

  it('null with no finished visits', () => {
    expect(averageWaitMinutes([])).toBeNull()
    expect(averageWaitMinutes([{ arrived_at: at(0), finished_at: null }])).toBeNull()
  })

  it('averages arrival→checkout over finished visits only', () => {
    expect(averageWaitMinutes([
      { arrived_at: at(0), finished_at: at(10) },
      { arrived_at: at(0), finished_at: at(30) },
      { arrived_at: at(0), finished_at: null },   // still waiting — excluded
    ])).toBe(20)
  })

  it('rounds to whole minutes', () => {
    expect(averageWaitMinutes([
      { arrived_at: at(0), finished_at: at(10) },
      { arrived_at: at(0), finished_at: at(11) },
    ])).toBe(11)
  })
})
