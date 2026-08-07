import { describe, it, expect } from 'vitest'
import { medsToAdd, normalizeMedName } from '../medsSync'

const med = (name: string, status: 'active' | 'held' | 'discontinued' = 'active') =>
  ({ name, status })

describe('normalizeMedName', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeMedName('  Amlodipine   5mg ')).toBe('amlodipine 5mg')
  })
})

describe('medsToAdd', () => {
  it('adds active meds missing from the master list', () => {
    expect(medsToAdd([med('Amlodipine')], []).map(m => m.name)).toEqual(['Amlodipine'])
  })

  it('skips meds already on the master list, case-insensitively', () => {
    expect(medsToAdd([med('amlodipine')], ['Amlodipine'])).toEqual([])
  })

  it('skips held and discontinued meds', () => {
    expect(medsToAdd([med('A', 'held'), med('B', 'discontinued')], [])).toEqual([])
  })

  it('skips empty names and dedupes within the block', () => {
    expect(medsToAdd([med(''), med('X'), med('x ')], []).map(m => m.name)).toEqual(['X'])
  })
})
