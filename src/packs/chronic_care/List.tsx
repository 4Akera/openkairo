// The Chronic care list (spec/openCare.md §5.7, Q29; picture #chronic-list): a tab in each department that ticks the pack. Who is off
// target or overdue, a chip per condition: the patients seen here within the clinic's window whose problem list has a condition of the
// clinic's list. Each row: the conditions, what is off target, the checks due, when last here; a row opens the chart. Read from the base's
// tables (the problem list, the values, the visits here) and the pack's own (coded observations, own targets).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { Identity, TableRead } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import type { ScreenProps } from '@core/screens/registry'
import { Card, Chip, Empty, Input, ScreenFrame, Spinner, cn, errorText, shortDate, ymd, type ScreenView } from '@core/ui'
import { MEASURES, careOf, conditionsOf, offWords, summaryOf, type CareSummary, type ConditionState, type Done, type OwnTarget, type ProblemIn, type Value } from './model'

type View = 'off' | 'due' | 'all'
interface Row { id: string; identity: Identity | null; state: ConditionState[]; sum: CareSummary; last: string | null }
const t = <R,>(table: string, dept: string, where: Record<string, unknown> = {}) => read<TableRead<R>>({ shape: 'table', table, department_id: dept, where, entries: false, limit: 2000 })

/** everything the list reads, once: the problems, the values its measures and checks name, the visits here, the pack's own rows */
function useCare(deptId: string, codes: string[]) {
  return useQuery({ queryKey: ['chronic_care.list', deptId, codes.join(',')], staleTime: 30_000, queryFn: async () => {
    const [lists, values, visits, checks, targets] = await Promise.all([
      t<{ patient_id: string; code: string | null; status: string; list: string }>('base.lists', deptId, { list: 'problems' }),
      t<{ patient_id: string; code: string | null; value: number; at: string }>('base.values', deptId, { code: codes }),
      t<{ patient_id: string; checked_in_at: string }>('base.presence', deptId, { department_id: deptId }),
      t<{ patient_id: string; codes: string[]; at: string; text: string | null }>('chronic_care.checks', deptId),
      t<{ patient_id: string; condition: string; measure: string; op: OwnTarget['op']; value: number; value2: number | null; reason: string | null; at: string }>('chronic_care.targets', deptId)])
    return { lists, values, visits, checks, targets }
  } })
}

export function ChronicList({ dept }: ScreenProps) {
  const { org } = useDepartment(); const navigate = useNavigate()
  const cs = conditionsOf(org)
  const codes = useMemo(() => [...new Set([...Object.values(MEASURES).flatMap((m) => [...m.codes, ...(m.codes2 ?? [])]), ...cs.conditions.flatMap((c) => (c.checks ?? []).flatMap((ch) => ch.codes))])], [cs.conditions])
  const q = useCare(dept.id, codes)
  const [now] = useState(() => Date.now())
  const [view, setView] = useState<View>('off'); const [cond, setCond] = useState<string | null>(null); const [filter, setFilter] = useState('')
  const rows = useMemo((): Row[] => {
    if (!q.data) return []
    const { lists, values, visits, checks, targets } = q.data
    const since = new Date(); since.setMonth(since.getMonth() - cs.window_months)
    const last = new Map<string, string>()
    for (const v of visits.rows) if (!last.has(v.patient_id) || last.get(v.patient_id)! < v.checked_in_at) last.set(v.patient_id, v.checked_in_at)
    const by = <R extends { patient_id: string }>(xs: R[]) => { const m = new Map<string, R[]>(); for (const x of xs) m.set(x.patient_id, [...(m.get(x.patient_id) ?? []), x]); return m }
    const P = by(lists.rows); const V = by(values.rows); const C = by(checks.rows); const T = by(targets.rows)
    const patients = { ...lists.patients, ...values.patients, ...visits.patients }
    return [...P.keys()].filter((id) => (last.get(id) ?? '') >= since.toISOString()).flatMap((id) => {
      const problems: ProblemIn[] = (P.get(id) ?? []).map((p) => ({ code: p.code, status: p.status }))
      const vs: Value[] = (V.get(id) ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
      const done: Done[] = (C.get(id) ?? []).map((c) => ({ codes: c.codes, at: c.at, text: c.text }))
      const own: OwnTarget[] = (T.get(id) ?? []).map((x) => ({ condition: x.condition, measure: x.measure, op: x.op, value: x.value, value2: x.value2 ?? undefined, reason: x.reason, at: x.at }))
      const state = careOf(cs.conditions, problems, vs, done, own)
      return state.length ? [{ id, identity: patients[id] ?? null, state, sum: summaryOf(state), last: last.get(id) ?? null }] : []
    })
  }, [q.data, cs])
  const f = filter.trim().toLowerCase()
  const name = (i: Identity | null) => i ? `${i.given.join(' ')} ${i.family ?? ''}`.trim() : 'Patient'
  const inCond = rows.filter((r) => !cond || r.state.some((s) => s.condition.key === cond))
  const matching = inCond.filter((r) => !f || name(r.identity).toLowerCase().includes(f) || String(r.identity?.number ?? '').startsWith(f))
  const shown = matching.filter((r) => view === 'all' || (view === 'off' ? r.sum.offTarget.length > 0 : r.sum.due.length > 0))
    .sort((a, b) => (b.sum.offTarget.length + b.sum.due.length) - (a.sum.offTarget.length + a.sum.due.length) || (b.last ?? '').localeCompare(a.last ?? ''))
  const views: ScreenView<View>[] = [{ id: 'off', label: 'Off target', count: inCond.filter((r) => r.sum.offTarget.length).length, needs: 'warn' },
    { id: 'due', label: 'Checks overdue', count: inCond.filter((r) => r.sum.due.length).length, needs: 'warn' }, { id: 'all', label: 'All', count: inCond.length }]
  const age = (i: Identity | null) => { if (!i?.birth_date) return ''; const y = Math.floor((now - Date.parse(i.birth_date)) / (365.25 * 86_400_000)); return `${y} ${i.gender === 'male' ? 'M' : i.gender === 'female' ? 'F' : ''}` }
  return <ScreenFrame views={views} view={view} onView={setView}
    filters={<div className="flex flex-wrap gap-1.5"><Chip on={!cond} onClick={() => setCond(null)}>Any condition {rows.length}</Chip>
      {cs.conditions.map((c) => <Chip key={c.key} on={cond === c.key} onClick={() => setCond(cond === c.key ? null : c.key)}>{c.name} {rows.filter((r) => r.state.some((s) => s.condition.key === c.key)).length}</Chip>)}</div>}
    search={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Record number or name" aria-label="Find a patient" className="w-full sm:w-56" />}>
    {q.isLoading ? <Spinner label="Reading the registers" /> : q.error ? <p className="text-14 text-danger">{errorText(q.error)}</p>
      : <Card className="overflow-x-auto p-0"><table className="w-full min-w-[46rem] text-13">
        <thead><tr className="border-b border-line text-11 uppercase tracking-[0.08em] text-faint">{['Patient', 'Conditions', 'Off target', 'Checks due', 'Last here'].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{shown.map((r) => <tr key={r.id} onClick={() => navigate(`/patient/${r.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover">
          <td className="px-3 py-2"><span className="me-2 font-mono text-12 text-faint">{r.identity?.number}</span><span className="font-medium text-fg">{name(r.identity)}</span> <span className="text-12 text-faint">{age(r.identity)}</span></td>
          <td className="px-3 py-2 text-muted">{r.state.map((s) => s.condition.name.toLowerCase()).join(' · ')}</td>
          <td className={cn('px-3 py-2', r.sum.offTarget.length && 'font-medium text-warn')}>{r.sum.offTarget.map((m) => offWords(m) + (m.target && 'own' in m.target && m.target.own ? ` own target` : '')).join(' · ') || '—'}</td>
          <td className={cn('px-3 py-2', r.sum.due.length && 'text-warn')}>{r.sum.due.map((c) => c.check.name.toLowerCase() + (c.months != null && c.months > 12 ? ` (${Math.floor(c.months / 12)} years)` : '')).join(' · ') || '—'}</td>
          <td className="px-3 py-2 text-muted">{r.last ? (ymd(r.last) === ymd(new Date().toISOString()) ? 'today' : shortDate(r.last)) : '—'}</td></tr>)}
          {!shown.length && <tr><td colSpan={5}><Empty>{rows.length ? 'Nobody here in this view.' : 'No patient seen here has a condition of the clinic’s list yet.'}</Empty></td></tr>}</tbody></table>
        <p className="border-t border-line px-3 py-2 text-12 text-faint">Patients seen in this clinic in the last {cs.window_months} months whose problem list has a condition of the clinic&apos;s list; a row opens the chart.</p></Card>}
  </ScreenFrame>
}
