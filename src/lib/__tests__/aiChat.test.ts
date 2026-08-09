import { describe, it, expect } from 'vitest'
import { stripEmpty, buildClinicalContext, parseSseDelta, type ContextBlock } from '../aiChat'

describe('stripEmpty', () => {
  it('drops null, empty strings, empty arrays and empty objects recursively', () => {
    expect(stripEmpty({
      a: 1, b: null, c: '', d: [], e: {}, f: { g: null, h: 'x' }, i: [null, '', 'y'],
    })).toEqual({ a: 1, f: { h: 'x' }, i: ['y'] })
  })

  it('returns undefined for entirely empty structures', () => {
    expect(stripEmpty({ a: null, b: { c: '' } })).toBeUndefined()
    expect(stripEmpty([])).toBeUndefined()
  })

  it('keeps zeros and false — they are facts', () => {
    expect(stripEmpty({ score: 0, flag: false })).toEqual({ score: 0, flag: false })
  })
})

describe('buildClinicalContext', () => {
  const base = {
    patient: { name: 'Adam Michalski', age: '50y', gender: 'Male', mrn: 'MRN-1' },
    encounter: { title: 'Back pain flare', reason: 'back pain', status: 'open' },
  }

  it('includes patient, encounter, and serialized blocks', () => {
    const ctx = buildClinicalContext({
      ...base,
      blocks: [{ name: 'Vitals', createdAt: 'Aug 9 · 5:10 PM', content: { pulse_rate: 91, spo2: null } }],
    })
    expect(ctx).toContain('Adam Michalski (MRN MRN-1), 50y, Male')
    expect(ctx).toContain('Back pain flare — reason: back pain (open)')
    expect(ctx).toContain('— Vitals (Aug 9 · 5:10 PM): {"pulse_rate":91}')
    expect(ctx).toContain('cannot write to the record')
  })

  it('says so when there are no blocks', () => {
    expect(buildClinicalContext({ ...base, blocks: [] })).toContain('(no blocks yet)')
  })

  it('includes the patient record when provided, honest about empties', () => {
    const ctx = buildClinicalContext({
      ...base,
      record: {
        allergies: ['Penicillin (moderate — rash)'],
        problems: ['Heart failure with preserved EF (high)'],
        medications: [],
      },
      blocks: [],
    })
    expect(ctx).toContain('Allergies: Penicillin (moderate — rash)')
    expect(ctx).toContain('Active problems: Heart failure with preserved EF (high)')
    expect(ctx).toContain('Active medications: none recorded')
  })

  it('omits record lines entirely when the record was not loaded', () => {
    const ctx = buildClinicalContext({ ...base, blocks: [] })
    expect(ctx).not.toContain('Allergies:')
    expect(ctx).not.toContain('Active medications:')
  })

  it('caps oversized charts and reports omissions', () => {
    const big: ContextBlock[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Note ${i}`, createdAt: 'today', content: { text: 'x'.repeat(1000) },
    }))
    const ctx = buildClinicalContext({ ...base, blocks: big })
    expect(ctx.length).toBeLessThan(8000)
    expect(ctx).toMatch(/\d+ more blocks omitted/)
  })

  it('truncates a single huge block', () => {
    const ctx = buildClinicalContext({
      ...base,
      blocks: [{ name: 'Novel', createdAt: 'today', content: { text: 'y'.repeat(5000) } }],
    })
    expect(ctx).toContain('…')
    expect(ctx.length).toBeLessThan(3000)
  })
})

describe('parseSseDelta', () => {
  it('extracts delta text from a data line', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
    expect(parseSseDelta(line)).toBe('Hello')
  })

  it('returns null for [DONE], keep-alives, and non-data lines', () => {
    expect(parseSseDelta('data: [DONE]')).toBeNull()
    expect(parseSseDelta('')).toBeNull()
    expect(parseSseDelta(': keep-alive')).toBeNull()
    expect(parseSseDelta('event: message')).toBeNull()
  })

  it('returns null for role-only or malformed chunks', () => {
    expect(parseSseDelta('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull()
    expect(parseSseDelta('data: {broken')).toBeNull()
  })
})
