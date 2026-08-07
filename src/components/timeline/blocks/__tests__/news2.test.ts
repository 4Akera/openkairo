import { describe, it, expect } from 'vitest'
import { computeNews2, emptyVitals, type VitalsContent } from '../VitalsBlock'

/**
 * Reference values from the RCP NEWS2 chart:
 * https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/
 */

function vitals(overrides: Partial<VitalsContent>): VitalsContent {
  return { ...emptyVitals(), ...overrides }
}

describe('computeNews2', () => {
  it('scores 0 and anyMeasured=false for fully unmeasured vitals', () => {
    const r = computeNews2(emptyVitals())
    expect(r.total).toBe(0)
    expect(r.anyMeasured).toBe(false)
  })

  describe('respiratory rate bands', () => {
    const cases: Array<[number, number]> = [
      [8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3],
    ]
    for (const [rr, score] of cases) {
      it(`RR ${rr} scores ${score}`, () => {
        const r = computeNews2(vitals({ resp_rate: rr, rr_flags: [] }))
        expect(r.breakdown.rr).toBe(score)
      })
    }
  })

  describe('SpO2 scale 1 bands', () => {
    const cases: Array<[number, number]> = [
      [91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0], [100, 0],
    ]
    for (const [spo2, score] of cases) {
      it(`SpO2 ${spo2}% on room air scores ${score}`, () => {
        const r = computeNews2(vitals({ spo2, spo2_flags: ['room_air'] }))
        expect(r.breakdown.spo2).toBe(score)
        expect(r.breakdown.o2).toBe(0)
      })
    }
  })

  it('supplemental oxygen scores 2 per the RCP NEWS2 chart', () => {
    const r = computeNews2(vitals({ spo2: 96, spo2_flags: ['nasal_cannula'] }))
    expect(r.breakdown.o2).toBe(2)
  })

  describe('systolic BP bands', () => {
    const cases: Array<[number, number]> = [
      [90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3],
    ]
    for (const [sys, score] of cases) {
      it(`systolic ${sys} scores ${score}`, () => {
        const r = computeNews2(vitals({ bp_systolic: sys, bp_diastolic: 80, bp_flags: [] }))
        expect(r.breakdown.bp).toBe(score)
      })
    }

    it('on pressor scores 3 regardless of reading', () => {
      const r = computeNews2(vitals({ bp_flags: ['on_pressor'] }))
      expect(r.breakdown.bp).toBe(3)
    })
  })

  describe('pulse rate bands', () => {
    const cases: Array<[number, number]> = [
      [40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3],
    ]
    for (const [pr, score] of cases) {
      it(`PR ${pr} scores ${score}`, () => {
        const r = computeNews2(vitals({ pulse_rate: pr, pr_flags: [] }))
        expect(r.breakdown.pr).toBe(score)
      })
    }
  })

  describe('temperature bands (°C)', () => {
    const cases: Array<[number, number]> = [
      [35.0, 3], [35.1, 1], [36.0, 1], [36.1, 0], [38.0, 0], [38.1, 1], [39.0, 1], [39.1, 2],
    ]
    for (const [t, score] of cases) {
      it(`${t}°C scores ${score}`, () => {
        const r = computeNews2(vitals({ temperature: t, temp_unit: 'C', temp_flags: [] }))
        expect(r.breakdown.temp).toBe(score)
      })
    }

    it('converts Fahrenheit before scoring (103.1°F ≈ 39.5°C → 2)', () => {
      const r = computeNews2(vitals({ temperature: 103.1, temp_unit: 'F', temp_flags: [] }))
      expect(r.breakdown.temp).toBe(2)
    })
  })

  describe('consciousness (ACVPU)', () => {
    it('Alert scores 0', () => {
      expect(computeNews2(vitals({ avpu: 'A' })).breakdown.avpu).toBe(0)
    })
    for (const level of ['V', 'P', 'U'] as const) {
      it(`${level} scores 3`, () => {
        expect(computeNews2(vitals({ avpu: level })).breakdown.avpu).toBe(3)
      })
    }
  })

  it('sums a mixed set of vitals correctly', () => {
    // RR 22 (2) + SpO2 93 on O2 (2 + 2) + sys 95 (2) + PR 115 (2) + 38.5°C (1) + V (3) = 14
    const r = computeNews2(vitals({
      resp_rate: 22,   rr_flags: [],
      spo2: 93,        spo2_flags: ['simple_mask'],
      bp_systolic: 95, bp_diastolic: 60, bp_flags: [],
      pulse_rate: 115, pr_flags: [],
      temperature: 38.5, temp_unit: 'C', temp_flags: [],
      avpu: 'V',
    }))
    expect(r.total).toBe(14)
    expect(r.anyMeasured).toBe(true)
  })

  it('ignores parameters flagged unmeasured even if a value is present', () => {
    const r = computeNews2(vitals({ pulse_rate: 140, pr_flags: ['unmeasured'] }))
    expect(r.breakdown.pr).toBe(0)
    expect(r.anyMeasured).toBe(false)
  })
})
