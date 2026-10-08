// The WHO tables for the /v line, read once from the reference list the server reads too (spec/openCare.md §5.7): a small store the
// line asks; until they are read the line says nothing, and the next keystroke draws it.
import { read } from '@core/db/rpc'
import type { Lms } from './lms'

let tables: Map<string, Lms> | null = null; let asking = false
export function whoTables(): Map<string, Lms> | null {
  if (!tables && !asking) {
    asking = true
    read<{ codes: { code: string; props: { L: number; M: number; S: number } }[] }>({ shape: 'codes', system: 'paediatrics.who_growth', limit: 2000 })
      .then((r) => { tables = new Map(r.codes.map((c) => [c.code, [c.props.L, c.props.M, c.props.S] as Lms])) }).catch(() => undefined).finally(() => { asking = false })
  }
  return tables
}
