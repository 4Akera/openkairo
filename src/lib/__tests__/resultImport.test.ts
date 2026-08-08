import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  buildColumnMap,
  computeFlag,
  matchRows,
  buildResultContent,
  type ImportOrder,
} from '../resultImport'

describe('parseCsv', () => {
  it('parses rows and trims cells', () => {
    expect(parseCsv('a, b ,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })
  it('handles quotes, escaped quotes, and CRLF', () => {
    expect(parseCsv('"a,b","say ""hi""",c\r\nx,y,z')).toEqual([['a,b', 'say "hi"', 'c'], ['x', 'y', 'z']])
  })
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('buildColumnMap', () => {
  it('finds the MRN column and known tests by id or name', () => {
    const map = buildColumnMap(['MRN', 'WBC', 'Haemoglobin', 'mystery'])
    expect(map.mrnCol).toBe(0)
    expect(map.testCols).toEqual([
      { col: 1, testId: 'wbc', testName: 'WBC' },
      { col: 2, testId: 'hb', testName: 'Haemoglobin' },
    ])
    expect(map.unknown).toEqual(['mystery'])
  })
  it('accepts patient_id-style headers for MRN', () => {
    expect(buildColumnMap(['patient_id', 'K']).mrnCol).toBe(0)
  })
  it('returns null MRN column when absent', () => {
    expect(buildColumnMap(['wbc']).mrnCol).toBeNull()
  })
})

describe('computeFlag', () => {
  it('flags high and low against the catalogue range', () => {
    expect(computeFlag('wbc', '12.5')).toBe('H')
    expect(computeFlag('wbc', '2.1')).toBe('L')
    expect(computeFlag('wbc', '7')).toBe('')
  })
  it('returns no flag for non-numeric values', () => {
    expect(computeFlag('wbc', 'clotted')).toBe('')
  })
})

const orders: ImportOrder[] = [
  { actionId: 'a1', mrn: 'MRN-1', panels: ['cbc'] },
  { actionId: 'a2', mrn: 'MRN-1', panels: ['metabolic'] },
  { actionId: 'a3', mrn: 'MRN-2', panels: ['cbc'] },
]

describe('matchRows', () => {
  const map = buildColumnMap(['mrn', 'wbc', 'na'])

  it('pairs rows with the oldest pending order per MRN', () => {
    const { matched, unmatched } = matchRows(
      [['MRN-1', '12.5', ''], ['MRN-1', '', '140'], ['MRN-9', '5', '']],
      map,
      orders.map(o => ({ ...o })),
    )
    expect(matched).toHaveLength(2)
    expect(matched[0].order.actionId).toBe('a1')
    expect(matched[0].results['cbc.wbc']).toEqual({ value: '12.5', flag: 'H', comment: '' })
    expect(matched[1].order.actionId).toBe('a2')
    expect(matched[1].results['metabolic.na']).toEqual({ value: '140', flag: '', comment: '' })
    expect(unmatched).toEqual([{ rowIndex: 2, mrn: 'MRN-9', reason: 'no-order' }])
  })

  it('keeps values outside the order panels as extras', () => {
    const { matched } = matchRows([['MRN-2', '5', '140']], map, orders.map(o => ({ ...o })))
    expect(matched[0].valueCount).toBe(1)
    expect(matched[0].extraValues).toEqual({ Sodium: '140' })
  })

  it('rejects rows with no MRN', () => {
    const { unmatched } = matchRows([['', '5', '']], map, orders.map(o => ({ ...o })))
    expect(unmatched[0].reason).toBe('no-mrn')
  })
})

describe('buildResultContent', () => {
  it('assembles a resulted lab_result content', () => {
    const { matched } = matchRows(
      [['MRN-1', '12.5', '']],
      buildColumnMap(['mrn', 'wbc', 'na']),
      orders.map(o => ({ ...o })),
    )
    const content = buildResultContent(matched[0].order, matched[0])
    expect(content.panels).toEqual(['cbc'])
    expect(content.status).toBe('resulted')
    expect(content.results['cbc.wbc'].value).toBe('12.5')
    expect(content.reported_at).toBeTruthy()
  })
})
