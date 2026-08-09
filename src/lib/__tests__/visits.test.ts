import { describe, it, expect } from 'vitest'
import { referralSourceLabel, averageWaitMinutes, waitSeverity, isArrivableBooking, isNoShowBooking, isStaleCarriedOver } from '../visits'

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

describe('waitSeverity', () => {
  const now = Date.parse('2026-08-09T12:00:00Z')
  const arrivedMinsAgo = (m: number) => new Date(now - m * 60000).toISOString()

  it('quiet under 30 minutes', () => {
    expect(waitSeverity(arrivedMinsAgo(0), now)).toBe('ok')
    expect(waitSeverity(arrivedMinsAgo(29), now)).toBe('ok')
  })

  it('long from 30 minutes, critical from an hour', () => {
    expect(waitSeverity(arrivedMinsAgo(30), now)).toBe('long')
    expect(waitSeverity(arrivedMinsAgo(59), now)).toBe('long')
    expect(waitSeverity(arrivedMinsAgo(60), now)).toBe('critical')
    expect(waitSeverity(arrivedMinsAgo(300), now)).toBe('critical')
  })
})

describe('isArrivableBooking', () => {
  const viewDay = new Date(2026, 7, 9, 15, 0)          // local Aug 9, 3 PM
  const bookedAt = (d: Date) => d.toISOString()

  it('true only for bookings scheduled on the viewed day', () => {
    expect(isArrivableBooking({ arrived_at: null, scheduled_at: bookedAt(new Date(2026, 7, 9, 9, 0)) }, viewDay)).toBe(true)
    expect(isArrivableBooking({ arrived_at: null, scheduled_at: bookedAt(new Date(2026, 7, 9, 23, 30)) }, viewDay)).toBe(true)
  })

  it('false for past-day bookings (stale no-shows) and future ones', () => {
    expect(isArrivableBooking({ arrived_at: null, scheduled_at: bookedAt(new Date(2026, 7, 5, 9, 0)) }, viewDay)).toBe(false)
    expect(isArrivableBooking({ arrived_at: null, scheduled_at: bookedAt(new Date(2026, 7, 10, 9, 0)) }, viewDay)).toBe(false)
  })

  it('false once arrived or when not a booking at all', () => {
    expect(isArrivableBooking({ arrived_at: bookedAt(viewDay), scheduled_at: bookedAt(viewDay) }, viewDay)).toBe(false)
    expect(isArrivableBooking({ arrived_at: null, scheduled_at: null }, viewDay)).toBe(false)
  })
})

describe('journey hygiene predicates', () => {
  const todayStart = '2026-08-09T00:00:00.000Z'
  const now = Date.parse('2026-08-09T12:00:00Z')

  it('isNoShowBooking: past booking, never arrived, not cancelled', () => {
    expect(isNoShowBooking({ scheduled_at: '2026-08-08T09:00:00Z', arrived_at: null, cancelled_at: null }, todayStart)).toBe(true)
  })

  it('isNoShowBooking: false for today/future bookings, arrivals, cancellations, walk-ins', () => {
    expect(isNoShowBooking({ scheduled_at: '2026-08-09T09:00:00Z', arrived_at: null, cancelled_at: null }, todayStart)).toBe(false)
    expect(isNoShowBooking({ scheduled_at: '2026-08-08T09:00:00Z', arrived_at: '2026-08-08T09:10:00Z', cancelled_at: null }, todayStart)).toBe(false)
    expect(isNoShowBooking({ scheduled_at: '2026-08-08T09:00:00Z', arrived_at: null, cancelled_at: '2026-08-08T20:00:00Z' }, todayStart)).toBe(false)
    expect(isNoShowBooking({ scheduled_at: null, arrived_at: null, cancelled_at: null }, todayStart)).toBe(false)
  })

  it('isStaleCarriedOver: 3+ days since arrival', () => {
    expect(isStaleCarriedOver('2026-08-06T11:59:00Z', now)).toBe(true)
    expect(isStaleCarriedOver('2026-08-06T12:00:00Z', now)).toBe(true)
    expect(isStaleCarriedOver('2026-08-07T13:00:00Z', now)).toBe(false)
  })
})
