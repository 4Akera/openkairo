// To check (spec/openCare.md §5.3; the large lab's "a second person checks"): what a technician released as preliminary, one card per
// patient with every test together, as a senior reads a report. Each value is there to change where it is wrong (flags as typed);
// Approve writes each result's next version, final — the result's first final, never a correction. Never one's own: whoever released
// it waits for another person; only a lab senior (approve:lis.results) approves.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { refresh } from '@core/hooks/writes'
import { fitField } from '@core/hooks/ranges'
import { oneSet, resultEntry } from '@core/db/entries'
import { write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow, Service, ServiceField } from '@core/db/types'
import { ageOf, groupByPatient, type PatientGroup } from '@core/screens/bench/shared'
import { flagOf } from '@core/screens/bench/BenchPatient'
import { Button, Callout, Card, Empty, Input, Tag, cn, errorText, flagMark, hm } from '@core/ui'
import { WORKED_OUT, workedOut } from './grid'

type Analyte = { key?: string; value?: { value?: string | number }; text?: string }
const CELL = { high: 'font-semibold text-warn', low: 'font-semibold text-warn', critical: 'border-danger bg-danger-soft font-semibold text-danger', normal: '' }
/** an order released and waiting for its check: its latest answer a preliminary result */
export const toCheck = (r: RequestQueueRow) => r.reply_type === 'result' && !!r.reply && !r.reply.is_final && r.reply.data.status === 'preliminary'
/** the released values of a patient's results, by field key */
const releasedOf = (rows: RequestQueueRow[]) => Object.fromEntries(rows.flatMap((r) => ((r.reply?.data.analytes ?? []) as Analyte[])
  .filter((a) => a.key).map((a) => [a.key!, String(a.value?.value ?? a.text ?? '')])))

export function ToCheck({ rows, serviceOf, deptId, onDone }: { rows: RequestQueueRow[]; serviceOf: (r: RequestQueueRow) => Service | undefined; deptId: string; onDone: (words: string) => void }) {
  const groups = groupByPatient(rows)
  if (!groups.length) return <Card><Empty>Nothing waits to be checked.</Empty></Card>
  return <div className="grid gap-3">{groups.map((g) => <Patient key={g.patient.id} g={g} serviceOf={serviceOf} deptId={deptId} onDone={onDone} />)}</div>
}

function Patient({ g, serviceOf, deptId, onDone }: { g: PatientGroup; serviceOf: (r: RequestQueueRow) => Service | undefined; deptId: string; onDone: (words: string) => void }) {
  const { org, can } = useDepartment(); const qc = useQueryClient()
  const [vals, setVals] = useState<Record<string, string>>(() => releasedOf(g.rows))
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const age = ageOf(g.patient.born_on); const fit = (f: ServiceField) => fitField(f, g.patient.sex, age)
  const valueOf = (key: string) => WORKED_OUT.has(key) ? workedOut(key, vals, { sex: g.patient.sex, age })?.toString() ?? '' : vals[key] ?? ''
  const released = releasedOf(g.rows)
  const mine = g.rows.some((r) => r.reply?.author_id === org?.me.id)
  const by = [...new Set(g.rows.map((r) => r.reply?.author_name).filter(Boolean))].join(', ')
  const at = g.rows.map((r) => r.reply?.recorded_at).filter(Boolean).sort().at(-1)
  const approve = async () => {
    setBusy(true); setError(null)
    try {
      const all = Object.fromEntries(g.rows.flatMap((r) => serviceOf(r)?.fields ?? []).map((f) => [f.key, valueOf(f.key)]))
      // each result's next version: what was released (or changed here), now final
      const items: EntryIn[] = g.rows.map((r) => { const e = resultEntry(r, deptId, (serviceOf(r)?.fields ?? []).map(fit), all, String(r.reply!.data.conclusion ?? ''), true, r.reply!.id)
        return e.type === 'result' ? { ...e, data: { ...e.data, status: 'final' as const } } : e })
      await write(oneSet(items)); refresh(qc)
      onDone(`${g.patient.given_name} ${g.patient.family_name}: ${g.rows.map((r) => r.service_name).join(', ')} approved`)
    } catch (x) { setError(errorText(x)) } finally { setBusy(false) }
  }
  const changed = Object.keys(released).filter((k) => !WORKED_OUT.has(k) && (vals[k] ?? '') !== released[k])
  return <Card className="grid gap-3 p-4">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-15 font-semibold text-fg">{g.patient.given_name} {g.patient.family_name}</span>
      <span className="font-mono text-12 text-faint">#{g.patient.record_number} · {age} {g.patient.sex?.[0]?.toUpperCase()}</span>
      {g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}
      <span className="ms-auto text-12 text-muted">Released by {by || 'someone'}{at ? ` · ${hm(at)}` : ''}</span>
    </div>
    <div className="grid gap-3 md:grid-cols-2">{g.rows.map((r) => { const s = serviceOf(r)
      return <div key={r.id} className="grid content-start gap-1 rounded-lg border border-line p-3">
        <p className="text-12 font-semibold uppercase tracking-[0.06em] text-faint">{r.service_name}</p>
        {(s?.fields ?? []).map((f0) => { const f = fit(f0); const raw = valueOf(f.key); const flag = raw ? flagOf(f, raw) : null
          return <div key={f.key} className="flex items-center gap-2 text-13">
            <span className="w-36 truncate text-muted">{f.name.replace(' (worked out)', '')}</span>
            {WORKED_OUT.has(f.key) || f.kind === 'choice'
              ? <span className={cn('inline-flex h-8 w-24 items-center justify-end rounded-md border border-line px-2 tnum', WORKED_OUT.has(f.key) && 'border-dashed', flag ? CELL[flag] : '')}>{raw || '—'}</span>
              : <Input dense value={raw} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} aria-label={`${g.patient.given_name}: ${f.name}`} disabled={mine || !can('approve:lis.results')}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined} className={cn('w-24 text-end tnum', f.kind === 'text' && 'text-start', flag ? CELL[flag] : '')} />}
            {flag && flag !== 'normal' && <span aria-hidden className={cn('text-11', flag === 'critical' ? 'text-danger' : 'text-warn')}>{flagMark(flag)}</span>}
            <span className="text-11 text-faint">{f.unit ?? ''}</span>
            {released[f.key] !== undefined && !WORKED_OUT.has(f.key) && (vals[f.key] ?? '') !== released[f.key] && <span className="text-11 text-warn">was {released[f.key]}</span>}
          </div> })}
      </div> })}</div>
    {error && <Callout tone="danger" title="Not approved">{error}</Callout>}
    <div className="flex flex-wrap items-center gap-2">
      {mine ? <span className="text-12 text-muted">You released these: another person checks them.</span>
        : !can('approve:lis.results') ? <span className="text-12 text-muted">A lab senior approves.</span>
        : <Button size="sm" loading={busy} onClick={() => void approve()}>{changed.length ? `Approve with ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}` : 'Approve'}</Button>}
      <span className="text-12 text-faint">The doctor sees them as preliminary until approved.</span>
    </div>
  </Card>
}
