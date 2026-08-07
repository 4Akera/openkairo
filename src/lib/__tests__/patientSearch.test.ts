import { describe, it, expect } from 'vitest'
import { parseSearchQuery } from '../patientSearch'

describe('parseSearchQuery', () => {
  it('returns null filters for an empty or whitespace query', () => {
    expect(parseSearchQuery('')).toEqual({ tokens: null, year: null })
    expect(parseSearchQuery('   ')).toEqual({ tokens: null, year: null })
  })

  it('splits plain name tokens', () => {
    expect(parseSearchQuery('hussien ali')).toEqual({ tokens: ['hussien', 'ali'], year: null })
  })

  it('extracts a 4-digit birth year alongside name tokens', () => {
    expect(parseSearchQuery('hussien ali 1995')).toEqual({ tokens: ['hussien', 'ali'], year: 1995 })
  })

  it('treats a year-only query as a year filter with no tokens', () => {
    expect(parseSearchQuery('1995')).toEqual({ tokens: null, year: 1995 })
  })

  it('does not treat out-of-range 4-digit numbers as years', () => {
    expect(parseSearchQuery('1850')).toEqual({ tokens: ['1850'], year: null })
    const future = String(new Date().getFullYear() + 5)
    expect(parseSearchQuery(future)).toEqual({ tokens: [future], year: null })
  })

  it('accepts next year as a valid birth year (edge of range)', () => {
    const nextYear = new Date().getFullYear() + 1
    expect(parseSearchQuery(String(nextYear))).toEqual({ tokens: null, year: nextYear })
  })

  it('keeps MRN-like and phone-like tokens as tokens', () => {
    expect(parseSearchQuery('MRN12345')).toEqual({ tokens: ['MRN12345'], year: null })
    expect(parseSearchQuery('07701234567')).toEqual({ tokens: ['07701234567'], year: null })
  })

  it('keeps only the last year when several are given', () => {
    expect(parseSearchQuery('1990 1995')).toEqual({ tokens: null, year: 1995 })
  })

  it('collapses repeated whitespace', () => {
    expect(parseSearchQuery('  ali   1995  ')).toEqual({ tokens: ['ali'], year: 1995 })
  })
})
