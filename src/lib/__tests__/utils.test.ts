import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  formatDateWithPrecision,
  buildIsoDate,
  formatDate,
  getPatientDob,
  getPatientGender,
  calcAgeYears,
  calcAge,
  fullName,
  getDefinitionColors,
  getBlockPreview,
} from '../utils'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
})
afterAll(() => vi.useRealTimers())

describe('formatDateWithPrecision', () => {
  it('respects stored precision', () => {
    expect(formatDateWithPrecision('2018-05-03', 'year')).toBe('2018')
    expect(formatDateWithPrecision('2018-05-03', 'month')).toBe('May 2018')
    expect(formatDateWithPrecision('2018-05-03', 'full')).toBe('May 3, 2018')
  })

  it('defaults to full precision', () => {
    expect(formatDateWithPrecision('2018-05-03')).toBe('May 3, 2018')
  })

  it('strips a time component before parsing', () => {
    expect(formatDateWithPrecision('2018-05-03T10:30:00Z')).toBe('May 3, 2018')
  })

  it('returns an em dash for missing or invalid dates', () => {
    expect(formatDateWithPrecision(null)).toBe('—')
    expect(formatDateWithPrecision('')).toBe('—')
    expect(formatDateWithPrecision('not-a-date')).toBe('—')
  })
})

describe('buildIsoDate', () => {
  it('pads and defaults missing parts to 01', () => {
    expect(buildIsoDate('1995')).toBe('1995-01-01')
    expect(buildIsoDate('1995', '7')).toBe('1995-07-01')
    expect(buildIsoDate('1995', '07', '9')).toBe('1995-07-09')
    expect(buildIsoDate('1995', '', '')).toBe('1995-01-01')
  })
})

describe('formatDate', () => {
  it('formats with the default pattern and handles invalid input', () => {
    expect(formatDate('2020-01-15')).toBe('Jan 15, 2020')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('garbage')).toBe('—')
  })
})

describe('getPatientDob / getPatientGender', () => {
  it('prefers the column over custom_fields', () => {
    expect(getPatientDob({ date_of_birth: '1990-02-01', custom_fields: { date_of_birth: '1980-01-01' } }))
      .toBe('1990-02-01')
    expect(getPatientGender({ gender: 'female', custom_fields: { gender: 'male' } })).toBe('female')
  })

  it('falls back to custom_fields', () => {
    expect(getPatientDob({ date_of_birth: null, custom_fields: { date_of_birth: '1980-01-01T00:00:00Z' } }))
      .toBe('1980-01-01')
    expect(getPatientGender({ gender: null, custom_fields: { gender: ' male ' } })).toBe('male')
  })

  it('returns null when nothing usable is present', () => {
    expect(getPatientDob({ date_of_birth: null })).toBeNull()
    expect(getPatientGender({ gender: '  ', custom_fields: {} })).toBeNull()
  })
})

describe('calcAgeYears / calcAge', () => {
  it('computes whole years from DOB', () => {
    expect(calcAgeYears('1990-08-07')).toBe(36)
    expect(calcAgeYears('1990-08-08')).toBe(35) // birthday tomorrow
  })

  it('rejects missing, invalid, and out-of-range DOBs', () => {
    expect(calcAgeYears(null)).toBeNull()
    expect(calcAgeYears('bogus')).toBeNull()
    expect(calcAgeYears('2030-01-01')).toBeNull() // negative age
    expect(calcAgeYears('1850-01-01')).toBeNull() // > 130
  })

  it('formats short ages by magnitude', () => {
    expect(calcAge('1990-08-07')).toBe('36y')
    expect(calcAge('2026-02-01')).toMatch(/mo$/)
    expect(calcAge('2026-07-30')).toMatch(/d$/)
    expect(calcAge(null)).toBe('')
  })
})

describe('fullName', () => {
  const p = { first_name: 'Amina', middle_name: 'K', last_name: 'Hassan' }

  it('two-part format skips the middle name', () => {
    expect(fullName(p)).toBe('Amina Hassan')
  })

  it('three-part format includes a non-empty middle name', () => {
    expect(fullName(p, 'three')).toBe('Amina K Hassan')
    expect(fullName({ ...p, middle_name: '  ' }, 'three')).toBe('Amina Hassan')
  })
})

describe('getDefinitionColors', () => {
  it('falls back to slate for unknown colors', () => {
    expect(getDefinitionColors('unknown')).toEqual(getDefinitionColors('slate'))
    expect(getDefinitionColors('blue').iconBg).toBe('bg-blue-500')
  })
})

describe('getBlockPreview', () => {
  it('prefers chief complaint for hx_physical', () => {
    expect(getBlockPreview({ type: 'hx_physical', content: { chief_complaint: 'Chest pain', hpi: 'Long story' } }))
      .toBe('CC: Chest pain')
    expect(getBlockPreview({ type: 'hx_physical', content: { hpi: 'Long story' } })).toBe('Long story')
  })

  it('lists up to 4 medication names with an overflow suffix', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F'].map(name => ({ name }))
    expect(getBlockPreview({ type: 'meds', content: { items } })).toBe('A, B, C, D +2 more')
  })

  it('summarizes measured vitals only', () => {
    const preview = getBlockPreview({
      type: 'vitals',
      content: {
        bp_systolic: 120, bp_diastolic: 80, bp_flags: [],
        pulse_rate: 70, pr_flags: ['unmeasured'],
        spo2: 98, spo2_flags: ['room_air'],
        temp_flags: ['unmeasured'],
      },
    })
    expect(preview).toContain('BP 120/80')
    expect(preview).toContain('SpO₂ 98%')
    expect(preview).not.toContain('PR')
  })

  it('uses renderType over block.type when provided', () => {
    expect(getBlockPreview({ type: 'custom-slug', content: { body: 'hello' } }, 'note')).toBe('hello')
  })

  it('returns empty string for unknown types', () => {
    expect(getBlockPreview({ type: 'mystery', content: {} })).toBe('')
  })
})
