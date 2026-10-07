// Results (lis.results, spec/openCare.md §5.3; the pictures "Lab · results by section" and "Lab · a critical value"): what was collected
// and waits for its results, one grid per section (its views, counted). A row is a patient; a column each field of the section's tests
// (its unit and range in the head); a cell to type where the patient has that test, else a dot. As it is typed: the flag (↑ ↓ ‼) by
// the range that fits the patient's sex and age, the values worked out (LDL, eGFR, dashed), the change check against the patient's
// last value within 30 days (check the sample before release). A critical value is only a notice — tell the doctor who asked (or, a
// walk-in, the patient or the doctor who asked), then Release, which writes each test whose fields are all there as a final result.
// ↵ moves down the column, Tab across. The large lab's switches (large.ts): turnaround targets (a row past its section's target turns
// amber, and Late gathers them all), a second person checks (Release writes a preliminary result, To check approves it), scan to
// receive (a sample is typed only once received).
import { useState, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { fitField } from '@core/hooks/ranges'
import { oneSet, resultEntry } from '@core/db/entries'
import { read, write } from '@core/db/rpc'
import type { RequestQueueRow, Service, ServiceField, TableRead } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageOf, groupByPatient, matches, type PatientGroup } from '@core/screens/bench/shared'
import { flagOf } from '@core/screens/bench/BenchPatient'
import { isWalkIn } from '@core/screens/bench/walkins'
import { Button, Callout, Card, Empty, Input, Kbd, ScreenFrame, Select, Spinner, Tag, cn, errorText, flagMark, hm, type ScreenView } from '@core/ui'
import { WORKED_OUT, changeOf, columnsOf, workedOut, type Prev } from './grid'
import { largeOf, lateBy, targetOf } from './large'
import { ToCheck, toCheck } from './Check'

const started = (r: RequestQueueRow) => !!r.order.step_key || (!!r.request?.step && r.request.step !== 'sent')
const LATE = '~late'; const CHECK = '~check'
const CELL = { high: 'border-line font-semibold text-warn', low: 'border-line font-semibold text-warn', critical: 'border-danger bg-danger-soft font-semibold text-danger', normal: 'border-line text-fg' }
const range = (f: Pick<ServiceField, 'reference_low' | 'reference_high'>) => f.reference_low != null && f.reference_high != null ? `${f.reference_low}–${f.reference_high}`
  : f.reference_high != null ? `≤ ${f.reference_high}` : f.reference_low != null ? `≥ ${f.reference_low}` : ''
type ValueRow = { patient_id: string; key: string; value: number; at: string }

export function Results({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const { org, can } = useDepartment()
  const [section, setSection] = useState<string | null>(null); const [find, setFind] = useState('')
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({})   // by patient, by field key
  const [busy, setBusy] = useState<string | null>(null); const [said, setSaid] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const f = find.trim().toLowerCase()
  const serviceOf = (r: RequestQueueRow): Service | undefined => org?.services.find((s) => s.id === r.order.service_id)
  const large = largeOf(org, dept.id)
  const rows = (q.data?.requests ?? []).filter((r) => serviceOf(r)?.fields.length)
  // to type: collected (or received, where tubes are scanned in), not sent back for a new sample, nothing released yet
  const waiting = rows.filter((r) => started(r) && r.order.status !== 'on-hold' && !r.reply && (!large.scan_receive || r.order.step_key === 'received'))
  const notIn = large.scan_receive ? rows.filter((r) => r.order.step_key === 'collected' && r.order.status !== 'on-hold' && !r.reply).length : 0
  const checking = rows.filter(toCheck)
  const lateOf = (r: RequestQueueRow) => lateBy(r.order.last_at, targetOf(large, r.section_name))
  const late = waiting.filter((r) => lateOf(r) != null)
  const sections = [...new Set(waiting.map((r) => r.section_name ?? 'Other'))].sort()
  const views0 = [...(large.turnaround && late.length ? [LATE] : []), ...sections, ...(large.second_check ? [CHECK] : [])]
  // opens on Late when anything is late, else the first section, else To check when something waits there
  const current = section && views0.includes(section) ? section : views0.find((x) => x !== CHECK) ?? (large.second_check && checking.length ? CHECK : null)
  const inView = (r: RequestQueueRow) => current === LATE ? lateOf(r) != null : (r.section_name ?? 'Other') === current
  const groups = groupByPatient(waiting.filter(inView)).filter((g) => matches(g.patient, f))
  const tests = [...new Map(groups.flatMap((g) => g.rows).map((r) => [r.order.service_id, serviceOf(r)])).values()].filter((s): s is Service => !!s)
  const columns = columnsOf(tests)
  const ids = [...new Set(waiting.map((r) => r.patient.id))]
  // each patient's last value of each key (the change check), where the reader may read them
  const prev = useQuery({ queryKey: ['lis.values', dept.id, ids], enabled: ids.length > 0 && can('read:lis.values'),
    queryFn: async () => (await read<TableRead<ValueRow>>({ shape: 'table', table: 'lis.values', department_id: dept.id, where: { patient_id: ids }, entries: false })).rows })
  const lastOf = (pid: string, key: string): Prev | undefined => (prev.data ?? []).filter((v) => v.patient_id === pid && v.key === key).sort((a, b) => b.at.localeCompare(a.at))[0]
  const set = (pid: string, key: string, v: string) => setVals((x) => ({ ...x, [pid]: { ...x[pid], [key]: v } }))
  const fitted = (g: PatientGroup, fld: ServiceField) => fitField(fld, g.patient.sex, ageOf(g.patient.born_on))
  const valueOf = (g: PatientGroup, key: string) => WORKED_OUT.has(key) ? workedOut(key, vals[g.patient.id] ?? {}, { sex: g.patient.sex, age: ageOf(g.patient.born_on) })?.toString() ?? ''
    : vals[g.patient.id]?.[key] ?? ''
  /** a test is ready when each of its fields that is typed (not worked out, not free text) has a value */
  const ready = (g: PatientGroup, s: Service) => s.fields.filter((x) => !WORKED_OUT.has(x.key) && x.kind !== 'text').every((x) => valueOf(g, x.key).trim() !== '')
  const release = async (g: PatientGroup) => {
    const rows = g.rows.filter((r) => { const s = serviceOf(r); return s && ready(g, s) })
    if (!rows.length) return
    setBusy(g.patient.id); setError(null)
    try {
      const all = Object.fromEntries(columns.map((c) => [c.key, valueOf(g, c.key)]))
      // a second person checks: released as preliminary, made final on To check
      await write(oneSet(rows.map((r) => resultEntry(r, dept.id, serviceOf(r)!.fields.map((x) => fitted(g, x)), all, '', !large.second_check))))
      setVals((x) => { const { [g.patient.id]: _, ...rest } = x; void _; return rest })
      setSaid(`${g.patient.given_name} ${g.patient.family_name}: ${rows.map((r) => r.service_name).join(', ')} ${large.second_check ? 'released, to check' : 'released'}`); refresh(qc)
    } catch (x) { setError(errorText(x)) } finally { setBusy(null) }
  }
  // ↵ moves down the column (the next patient's cell of the same field)
  const down = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return
    const cell = e.currentTarget; const col = cell.dataset.col; const cells = [...document.querySelectorAll<HTMLElement>(`[data-col="${col}"]`)]
    const next = cells[cells.indexOf(cell) + 1]; if (next) { e.preventDefault(); next.focus() }
  }
  const views: ScreenView<string>[] = [
    ...(large.turnaround && late.length ? [{ id: LATE, label: 'Late', count: groupByPatient(late).length, needs: 'warn' as const }] : []),
    ...sections.map((s) => ({ id: s, label: s, count: groupByPatient(waiting.filter((r) => (r.section_name ?? 'Other') === s)).length })),
    ...(large.second_check ? [{ id: CHECK, label: 'To check', count: groupByPatient(checking).length, needs: 'warn' as const }] : [])]

  const row = (g: PatientGroup) => {
    const mine = (key: string) => g.rows.some((r) => serviceOf(r)?.fields.some((x) => x.key === key))
    const notes: { tone: 'warn' | 'danger'; text: string }[] = []
    let critical = false
    for (const c of columns) {
      if (!mine(c.key)) continue
      const raw = valueOf(g, c.key); const flag = flagOf(fitted(g, c), raw)
      if (flag === 'critical') { critical = true; notes.push({ tone: 'danger', text: `${c.name} ${raw}${c.unit ? ` ${c.unit}` : ''} is critical` }) }
      const n = raw.trim() === '' ? null : Number(raw)
      const ch = n != null && !Number.isNaN(n) && !WORKED_OUT.has(c.key) ? changeOf(c.key, n, lastOf(g.patient.id, c.key)) : null
      if (ch) notes.push({ tone: 'warn', text: `Change check: ${c.name.toLowerCase()} was ${ch.was}${c.unit ? ` ${c.unit}` : ''} ${ch.days === 0 ? 'today' : `${ch.days} ${ch.days === 1 ? 'day' : 'days'} ago`}. Check the sample (haemolysed? the right patient?) before release.` })
    }
    const walk = g.rows.some((r) => isWalkIn(r.order, org?.allDepartments ?? []))
    const who = walk ? (g.rows.find((r) => r.order.asked_by)?.order.asked_by ? `the patient or ${g.rows.find((r) => r.order.asked_by)!.order.asked_by}` : 'the patient')
      : g.rows[0]?.requester_name ?? g.rows[0]?.from_department_name ?? 'the doctor who asked'
    const any = g.rows.some((r) => { const s = serviceOf(r); return s && ready(g, s) })
    const waited = Math.max(...g.rows.map((r) => lateOf(r) ?? -1)); const sample = g.rows.find((r) => r.step_data?.specimen)?.step_data?.specimen
    return [<tr key={g.patient.id} className={cn('border-t border-line', waited >= 0 ? 'bg-warn-soft' : notes.length > 0 && 'bg-hover')}>
      <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="font-medium text-fg">{g.patient.given_name} {g.patient.family_name}</span>
        {g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}{walk && <Tag tone="info">walk-in</Tag>}{waited >= 0 && <Tag tone="warn">late · {waited} min</Tag>}</span>
        <span className="font-mono text-11 text-faint">#{g.patient.record_number}{sample ? ` · ${sample}` : ''}{g.rows[0]?.order.last_at ? ` · ${large.scan_receive ? 'received' : 'collected'} ${hm(g.rows[0].order.last_at)}` : ''}</span></td>
      {columns.map((c) => { if (!mine(c.key)) return <td key={c.key} className="px-1.5 py-2 text-end text-faint">·</td>
        const fit = fitted(g, c); const raw = valueOf(g, c.key); const flag = flagOf(fit, raw)
        if (WORKED_OUT.has(c.key)) return <td key={c.key} className="px-1.5 py-2 text-end"><span title="Worked out from the others" className={cn('inline-flex h-8 w-[4.5rem] items-center justify-end gap-1 rounded-md border border-dashed bg-surface px-2 tnum', flag ? CELL[flag] : 'border-line text-faint')}>
          {raw || '—'}{flag && flag !== 'normal' && <span aria-hidden className="text-11">{flagMark(flag)}</span>}</span></td>
        return <td key={c.key} className="px-1.5 py-2 text-end">{c.kind === 'choice'
          ? <Select data-col={c.key} value={raw} onKeyDown={down} onChange={(e) => set(g.patient.id, c.key, e.target.value)} aria-label={`${g.patient.given_name}: ${c.name}`} className="h-8 w-28 text-13">
              <option value="" />{(c.choices ?? []).map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          : <span className="relative inline-flex"><Input data-col={c.key} dense inputMode={c.kind === 'number' ? 'decimal' : undefined} value={raw} onKeyDown={down}
              onChange={(e) => set(g.patient.id, c.key, e.target.value)} aria-label={`${g.patient.given_name}: ${c.name}`}
              className={cn('w-[4.5rem] text-end tnum', c.kind === 'text' && 'w-24 text-start', flag ? CELL[flag] : '')} />
              {flag && flag !== 'normal' && <span aria-hidden className={cn('pointer-events-none absolute end-1 top-0.5 text-11', flag === 'critical' ? 'text-danger' : 'text-warn')}>{flagMark(flag)}</span>}</span>}</td> })}
      <td className="px-3 py-2 text-end"><Button size="sm" variant={critical ? 'danger' : 'primary'} disabled={!any} loading={busy === g.patient.id} onClick={() => void release(g)}>{large.second_check ? 'Release to check' : 'Release'}</Button></td>
    </tr>,
    notes.length > 0 && <tr key={`${g.patient.id} notes`} className="bg-hover"><td colSpan={columns.length + 2} className="px-3 pb-2"><div className="grid max-w-3xl gap-1">
      {critical && <Callout tone="danger" title={`Critical: tell ${who} now`}>{notes.filter((x) => x.tone === 'danger').map((x) => x.text).join('; ')}. Then release.</Callout>}
      {notes.filter((x) => x.tone === 'warn').map((x) => <p key={x.text} className="flex items-center gap-1.5 text-12 text-muted"><TriangleAlert className="size-3.5 shrink-0 text-warn" />{x.text}</p>)}
    </div></td></tr>]
  }

  return <ScreenFrame views={views} view={current ?? ''} onView={setSection}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Record number or name" className="w-full sm:w-72" />}
    notice={said ? <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout> : error ? <Callout tone="danger" title="Not released">{error}</Callout> : undefined}>
    {notIn > 0 && <p className="text-12 text-muted">{notIn} {notIn === 1 ? 'test is' : 'tests are'} collected and not received yet: each waits for its tube's scan on Receive.</p>}
    {q.isLoading ? <Spinner label="Loading" /> : !current ? <Card><Empty>{large.scan_receive ? 'Nothing received is waiting for results.' : 'Nothing collected is waiting for results.'}</Empty></Card>
      : current === CHECK ? <ToCheck rows={checking} serviceOf={serviceOf} deptId={dept.id} onDone={(x) => { setSaid(x); setError(null) }} />
      : <Card className="overflow-x-auto"><table className="w-full text-13 tnum">
        <thead><tr className="border-b border-line align-bottom">
          <th className="px-3 py-2 text-start text-11 font-medium uppercase tracking-[0.06em] text-faint">Patient</th>
          {columns.map((c) => <th key={c.key} className="px-1.5 py-2 text-end font-normal"><span className="block text-12 font-semibold text-fg">{c.name.replace(' (worked out)', '')}{WORKED_OUT.has(c.key) && <span className="ms-1 text-11 font-normal text-faint">calc</span>}</span>
            <span className="block text-11 text-faint">{c.unit ?? ''}</span><span className="block text-11 text-faint">{range(c)}</span></th>)}
          <th className="px-3 py-2" /></tr></thead>
        <tbody>{groups.length ? groups.flatMap(row) : <tr><td colSpan={columns.length + 2}><Empty>{f ? 'No match here.' : 'Nobody here.'}</Empty></td></tr>}</tbody>
      </table></Card>}
    {current !== CHECK && <p className="text-12 text-faint">Type down a column (<Kbd>↵</Kbd>) or across a row (Tab); ranges by age and sex; LDL and eGFR are worked out; a critical value shows its notice before Release.</p>}
  </ScreenFrame>
}
