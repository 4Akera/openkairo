// The reperfusion strip above the ICU chart (spec/openCare.md §5.6, piece I3), where the department's cardiac rows are on: the STEMI's
// times in a bordered row, each target met ✓ or missed ✕ with its minutes (never colour alone). For whoever may write the reperfusion
// times, Edit (or "Add the reperfusion times") opens a card under the strip: chips for each choice (no dropdown), four "HH:MM" times each
// with a "yesterday" chip, a note, and Sign, its own set.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { newId, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import type { ServerEntry } from '@core/db/types'
import { refresh } from '@core/hooks/writes'
import { Button, Callout, Card, Chip, Input, Textarea, cn, errorText, hm } from '@core/ui'
import { Under } from './HourParts'
import { ANGIO, DIAGNOSES, KILLIP, LYTICS, REPERFUSION, TIME_KEYS, draftOf, headline, reperfusionData, reperfusionEntry, reperfusionProblems, strip,
  type Reperfusion as Data, type ReperfusionDraft, type Targets, type TimeKey } from './reperfusion'

export interface ReperfusionStripProps { record: ServerEntry | null; into: { at: string; name: string }; targets: Targets; now: string
  where: { patientId: string; departmentId: string; stay: string }; canWrite: boolean }

export function ReperfusionStrip({ record, into, targets, now, where, canWrite }: ReperfusionStripProps) {
  const [editing, setEditing] = useState(false)
  const data = (record?.data ?? null) as Data | null
  return <div className="grid gap-2">
    <div role="group" aria-label="Reperfusion times" className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2">
      {data ? <>
        <span className="text-13 font-semibold text-fg">{headline(data)}</span>
        {strip(data, into, targets, now).map((s) => <span key={s.label} className="grid gap-0.5">
          <span className="text-12 text-muted">{s.label}{s.at && <span className="ms-1 font-semibold text-fg tnum">{hm(s.at)}</span>}</span>
          {s.words && <span className={cn('text-12 tnum', s.met === true ? 'text-ok' : s.met === false ? 'text-warn' : 'text-muted')}>
            {s.met === true && <span aria-label="met">✓ </span>}{s.met === false && <span aria-label="missed">✕ </span>}{s.words}</span>}
        </span>)}
      </> : <span className="text-13 text-muted">No reperfusion times yet.</span>}
      {canWrite && !editing && <Button size="sm" variant="outline" className="ms-auto" onClick={() => setEditing(true)}>{data ? 'Edit' : 'Add the reperfusion times'}</Button>}
    </div>
    {editing && <ReperfusionCard record={record} now={now} where={where} onDone={() => setEditing(false)} />}
  </div>
}

const TIME_LABEL: Record<TimeKey, string> = { pain: 'Pain began', door: 'At the door', ecg: 'First ECG', needle: 'Needle' }

function ReperfusionCard({ record, now, where, onDone }: { record: ServerEntry | null; now: string; where: ReperfusionStripProps['where']; onDone: () => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState<ReperfusionDraft>(() => draftOf((record?.data ?? null) as Data | null, now))
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const set = (f: (x: ReperfusionDraft) => ReperfusionDraft) => { setD(f); setError(null) }
  const problems = reperfusionProblems(d, now); const say: Record<string, { problem?: string }> = {}
  for (const p of problems) say[p.field] ??= { problem: p.text }
  const one = <K extends 'diagnosis' | 'reperfusion' | 'angiography' | 'killip'>(k: K, list: [NonNullable<ReperfusionDraft[K]>, string][], title: string) =>
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-28 shrink-0 text-12 text-muted">{title}</span>
      {list.map(([v, w]) => <Chip key={v} on={d[k] === v} onClick={() => set((x) => ({ ...x, [k]: x[k] === v ? undefined : v }))}>{k === 'killip' ? `Killip ${w}` : w}</Chip>)}
      <Under s={say[k]} /></div>
  const time = (k: TimeKey) => { const t = d.times[k] ?? {}; const put = (patch: Partial<NonNullable<ReperfusionDraft['times'][TimeKey]>>) =>
    set((x) => ({ ...x, times: { ...x.times, [k]: { ...x.times[k], ...patch, iso: undefined } } }))
    const label = k === 'needle' ? d.reperfusion === 'primary_pci' ? 'Balloon' : 'Needle' : TIME_LABEL[k]
    return <label key={k} className="grid content-start gap-1"><span className="text-12 font-medium text-muted">{label}</span>
      <span className="flex items-center gap-1"><Input dense aria-label={label} placeholder="HH:MM" inputMode="numeric" value={t.hm ?? ''} onChange={(e) => put({ hm: e.target.value })}
        aria-invalid={say[k]?.problem ? true : undefined} className="w-16 text-end tnum" />
        <Chip on={!!t.yesterday} onClick={() => put({ yesterday: !t.yesterday })}>yesterday</Chip></span>
      <Under s={say[k]} /></label> }
  const sign = async () => {
    if (problems.length || busy) return
    setBusy(true); setError(null)
    try {
      const { entry, seen } = reperfusionEntry(reperfusionData(d, now), record, where, newId, now)
      await write(oneSet([entry], { seen })); refresh(qc); onDone()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <Card role="group" aria-label="The reperfusion times" className="grid gap-3 p-4">
    <span className="text-13 font-medium text-fg">{record ? 'Edit the reperfusion times' : 'The reperfusion times'}</span>
    {one('diagnosis', DIAGNOSES, 'Diagnosis')}
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">{TIME_KEYS.map(([k]) => time(k))}</div>
    {one('reperfusion', REPERFUSION, 'Reperfusion')}
    {d.reperfusion === 'lysis' && <div className="flex flex-wrap items-center gap-1.5"><span className="w-28 shrink-0 text-12 text-muted">Lytic</span>
      {LYTICS.map((l) => <Chip key={l} on={d.lytic === l} onClick={() => set((x) => ({ ...x, lytic: x.lytic === l ? undefined : l }))}>{l}</Chip>)}<Under s={say.lytic} /></div>}
    {one('angiography', ANGIO, 'Angiography')}
    {one('killip', KILLIP, 'Killip class')}
    <Textarea aria-label="Note" placeholder="Note" minRows={1} value={d.note ?? ''} onChange={(e) => set((x) => ({ ...x, note: e.target.value }))} />
    {error && <Callout tone="danger">{error}</Callout>}
    <div className="flex items-center gap-2"><Button onClick={() => void sign()} disabled={problems.length > 0 || busy} loading={busy}>Sign</Button>
      <Button variant="ghost" onClick={onDone}>Cancel</Button>
      {problems.length > 0 && <span className="text-12 text-danger">{problems.length === 1 ? 'One thing' : `${problems.length} things`} to put right first</span>}</div>
  </Card>
}
