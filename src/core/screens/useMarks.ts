// The marks a list draws on its rows (marks.ts): the department whose list it is, the packs it uses, the registered marks.
import type { Department } from '../db/types'
import { useDepartment } from '../hooks/organization'
import { marksOf, rowMarkDefs, type MarkList, type MarkRow } from './marks'

/** a row's marks on this list; dept: the screen's department (default: the one I work in now) */
export function useRowMarks(list: MarkList, dept?: Pick<Department, 'id' | 'packs'> | null) {
  const { org, dept: here } = useDepartment(); const d = dept ?? here
  return (row: MarkRow) => d ? marksOf(rowMarkDefs(), row, { list, dept: d, org }) : []
}
