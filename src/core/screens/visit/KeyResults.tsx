import { useSearchParams } from 'react-router-dom'
import { useResultsTable } from '../../hooks/reads'
import type { ResultRow } from '../../db/types'
import { Card, Heading, cn, flagClass, shortDate } from '../../ui'
import { KEY_TESTS } from './kinds'

type Point = ResultRow['points'][number]
const SHORT: Record<string, string> = { 'loinc:4548-4': 'HbA1c', 'loinc:2160-0': 'Creatinine', 'loinc:718-7': 'Hb', 'loinc:2089-1': 'LDL', 'loinc:8480-6': 'BP', 'loinc:29463-7': 'Weight' }
const SYS = 'loinc:8480-6'; const DIA = 'loinc:8462-4'
const bad = (f: Point['flag'] | undefined) => !!f && f !== 'normal'
const arrow = (a: number | null, b: number | null | undefined) => a == null || b == null ? '' : a > b ? '↑' : a < b ? '↓' : '→'

/** The patient's numbers at a glance, beside the record (spec 05): the key tests first, then anything else now flagged,
 *  each with where it was before. A value opens its entry; "All" opens the full table. */
export function KeyResults({ patientId }: { patientId: string }) {
  const q = useResultsTable(patientId)
  const [params, setParams] = useSearchParams()
  const go = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }
  const rows = (q.data ?? []).map((t) => ({ ...t, points: [...t.points].filter((p) => p.value_number != null).sort((a, b) => b.at.localeCompare(a.at)) })).filter((t) => t.points.length)
  const of = (code: string) => rows.find((t) => t.code === code)
  const dia = of(DIA)
  const shown = [...KEY_TESTS.filter((c) => c !== DIA).map(of), ...rows.filter((t) => !KEY_TESTS.includes(t.code) && bad(t.points[0].flag)).slice(0, 3)]
    .filter((t): t is (typeof rows)[number] => !!t).slice(0, 8)
  if (q.isLoading || !(q.data ?? []).length) return null                        // no results at all: nothing to show or open
  return <Card className="px-3.5 py-3">
    <Heading className="mb-1" right={<button onClick={() => go('view', 'results')} className="text-[10.5px] text-teal-800 hover:underline">All results</button>}>Key results</Heading>
    {!shown.length && <p className="py-1 text-xs text-neutral-400">None of the key tests yet, and nothing flagged — the other results are in All results.</p>}
    <ul className="divide-y divide-neutral-100">{shown.map((t) => {
      const [now, before] = t.points
      // BP is one row: systolic/diastolic measured together
      const d = t.code === SYS ? dia?.points.find((p) => p.at === now.at) : undefined; const db = t.code === SYS && before ? dia?.points.find((p) => p.at === before.at) : undefined
      const value = d ? `${now.value_number}/${d.value_number}` : `${now.value_number}`; const was = before ? (db ? `${before.value_number}/${db.value_number}` : `${before.value_number}`) : null
      const flag = bad(now.flag) ? now.flag : d?.flag
      return <li key={t.code} className="flex items-baseline gap-2 py-1 text-[13px]">
        <span className="w-20 shrink-0 truncate text-neutral-600" title={t.name}>{SHORT[t.code] ?? t.name}</span>
        <button onClick={() => go('entry', now.entry_id)} className={cn('tnum font-semibold hover:underline', bad(flag) ? flagClass(flag) : 'text-neutral-900')} title={`${shortDate(now.at)}${t.unit ? ` · ${t.unit}` : ''}`}>
          {value}{now.flag === 'critical' ? ' ‼' : ''}</button>
        {before && <span className="text-xs text-neutral-400">{arrow(now.value_number, before.value_number)}</span>}
        <span className="ml-auto truncate text-right text-[11px] text-neutral-400 tnum">{was ? `was ${was} · ${shortDate(before!.at)}` : shortDate(now.at)}</span>
      </li> })}</ul>
  </Card>
}
