import { describe, it, expect } from 'vitest'
import { appendDictation } from '../../hooks/useDictation'

describe('appendDictation', () => {
  it('returns the fragment when the note is empty', () => {
    expect(appendDictation('', 'patient stable')).toBe('patient stable')
  })

  it('inserts a space between existing text and the fragment', () => {
    expect(appendDictation('BP 120/80.', 'patient stable')).toBe('BP 120/80. patient stable')
  })

  it('does not double spaces or append empty fragments', () => {
    expect(appendDictation('line one\n', 'line two')).toBe('line one\nline two')
    expect(appendDictation('text', '   ')).toBe('text')
  })
})
