/**
 * CSV result import for high-volume labs — pure helpers.
 *
 * The flow: an analyzer (or LIS export) produces one CSV row per sample,
 * keyed by patient MRN, columns named after tests (id or display name).
 * Staff import the file, review the matches, and release — each released
 * row becomes a normal lab_result block completing its pending order, so
 * downstream (timeline, toasts, billing) needs nothing new.
 *
 * Kept free of Supabase/React so every step is unit-testable.
 */
import { PANELS } from '../components/timeline/blocks/labShared'
import type { LabFlag, LabResult, LabResultContent } from '../types'

// ── CSV ─────────────────────────────────────────────────────────────────

/** Minimal RFC-4180-ish parser: quotes, escaped quotes, CRLF; trims cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const pushCell = () => { row.push(cell.trim()); cell = '' }
  const pushRow = () => {
    pushCell()
    if (row.some(c => c !== '')) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') pushCell()
    else if (ch === '\n') pushRow()
    else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length > 0) pushRow()
  return rows
}

// ── Header mapping ──────────────────────────────────────────────────────

export interface TestColumn {
  col: number
  testId: string
  testName: string
}

export interface ColumnMap {
  mrnCol: number | null
  testCols: TestColumn[]
  /** Headers that matched nothing (excluding the MRN column). */
  unknown: string[]
}

const MRN_HEADERS = new Set(['mrn', 'patient', 'patientid', 'patient_id', 'sample', 'sampleid', 'sample_id'])

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '')

/** testId → display name, first occurrence across the panel catalogue. */
const TEST_INDEX: Map<string, { id: string; name: string }> = (() => {
  const map = new Map<string, { id: string; name: string }>()
  for (const p of PANELS) {
    for (const t of p.tests) {
      if (!map.has(norm(t.id))) map.set(norm(t.id), { id: t.id, name: t.name })
      if (!map.has(norm(t.name))) map.set(norm(t.name), { id: t.id, name: t.name })
    }
  }
  return map
})()

/** Map CSV headers to the MRN column + known test columns. */
export function buildColumnMap(headers: string[]): ColumnMap {
  let mrnCol: number | null = null
  const testCols: TestColumn[] = []
  const unknown: string[] = []
  headers.forEach((h, col) => {
    const n = norm(h)
    if (mrnCol === null && MRN_HEADERS.has(n)) { mrnCol = col; return }
    const hit = TEST_INDEX.get(n)
    if (hit) testCols.push({ col, testId: hit.id, testName: hit.name })
    else if (h.trim() !== '') unknown.push(h.trim())
  })
  return { mrnCol, testCols, unknown }
}

// ── Flags ───────────────────────────────────────────────────────────────

/** H/L flag from the catalogue's reference range; '' when not numeric. */
export function computeFlag(testId: string, value: string): LabFlag {
  const num = Number(value)
  if (value.trim() === '' || Number.isNaN(num)) return ''
  for (const p of PANELS) {
    const t = p.tests.find(t => t.id === testId)
    if (!t) continue
    if (t.ref_low !== null && num < t.ref_low) return 'L'
    if (t.ref_high !== null && num > t.ref_high) return 'H'
    return ''
  }
  return ''
}

// ── Order matching ──────────────────────────────────────────────────────

/** The slice of a pending order the matcher needs. */
export interface ImportOrder {
  actionId: string
  mrn: string
  panels: string[]
}

export interface MatchedRow {
  rowIndex: number
  mrn: string
  order: ImportOrder
  /** results keyed "panelId.testId", flag precomputed */
  results: Record<string, LabResult>
  /** Test values the order's panels don't cover (name → value). */
  extraValues: Record<string, string>
  valueCount: number
}

export interface UnmatchedRow {
  rowIndex: number
  mrn: string
  reason: 'no-mrn' | 'no-order'
}

/**
 * Pair CSV data rows with pending orders by MRN — oldest order first, one
 * order per row (a second row for the same MRN takes the next order).
 */
export function matchRows(
  dataRows: string[][],
  map: ColumnMap,
  orders: ImportOrder[],
): { matched: MatchedRow[]; unmatched: UnmatchedRow[] } {
  const queueByMrn = new Map<string, ImportOrder[]>()
  for (const o of orders) {
    const key = norm(o.mrn)
    if (!queueByMrn.has(key)) queueByMrn.set(key, [])
    queueByMrn.get(key)!.push(o)
  }

  const matched: MatchedRow[] = []
  const unmatched: UnmatchedRow[] = []

  dataRows.forEach((cells, rowIndex) => {
    const mrn = map.mrnCol === null ? '' : (cells[map.mrnCol] ?? '').trim()
    if (!mrn) { unmatched.push({ rowIndex, mrn: '', reason: 'no-mrn' }); return }
    const queue = queueByMrn.get(norm(mrn))
    const order = queue?.shift()
    if (!order) { unmatched.push({ rowIndex, mrn, reason: 'no-order' }); return }

    const results: Record<string, LabResult> = {}
    const extraValues: Record<string, string> = {}
    let valueCount = 0
    for (const tc of map.testCols) {
      const value = (cells[tc.col] ?? '').trim()
      if (value === '') continue
      const panel = PANELS.find(p => order.panels.includes(p.id) && p.tests.some(t => t.id === tc.testId))
      if (panel) {
        results[`${panel.id}.${tc.testId}`] = { value, flag: computeFlag(tc.testId, value), comment: '' }
        valueCount++
      } else {
        extraValues[tc.testName] = value
      }
    }
    matched.push({ rowIndex, mrn, order, results, extraValues, valueCount })
  })

  return { matched, unmatched }
}

// ── Content assembly ────────────────────────────────────────────────────

/** A released row becomes a normal lab_result block's content. */
export function buildResultContent(order: ImportOrder, row: MatchedRow): LabResultContent {
  return {
    panels: order.panels,
    custom_defs: [],
    results: row.results,
    custom_results: [],
    notes: '',
    status: 'resulted',
    reported_at: new Date().toISOString(),
  }
}
