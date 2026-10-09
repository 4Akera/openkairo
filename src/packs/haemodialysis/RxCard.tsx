// The standing prescription's card (spec/openCare.md §5.6, D2b): on the Session tab the session's copy once Before is signed (else the
// patient's current one), and on the Schedule's slot card the patient's current one. The dialysis doctor writes it, or changes it, inline
// under its lines: the time, the flows, the bath, the dialyser, heparin (or none), the dry weight, the access; a number outside its
// usual range is a notice, never a stop. One a patient: the first is new, each change continues it.
import { useState } from 'react'
import { useDepartment } from '@core/hooks/organization'
import { userName } from '@core/db/views'
import type { Department } from '@core/db/types'
import { Button, Card, Chip, Input, Kbd, KV, NumberInput, Spinner, shortDate } from '@core/ui'
import { CardHead, Notices, SignState } from './parts'
import { ACCESS, RX_FIELDS, rxEntry, rxForm, rxMissing, rxNotices, rxWords, type RxForm } from './rx'
import { onSign, type RxData } from './session'
import { usePrescription, useSign } from './useSession'

const LABEL = 'text-12 text-muted'

export function RxCard({ dept, patientId, copy }: { dept: Pick<Department, 'id'>; patientId: string; copy?: Partial<RxData> | null }) {
  const { org, can } = useDepartment()
  const q = usePrescription(dept, patientId); const current = q.data ?? null
  const [editing, setEditing] = useState(false)
  const may = can('write:haemodialysis.prescription')
  const shown = copy ?? current?.data ?? null
  // the standing one changed since Before's copy: its author and date are not the copy's, so the heading names neither
  const changed = !!copy && !!current && JSON.stringify(current.data) !== JSON.stringify(copy)
  const who = current && !changed ? [userName(org, current.author_id), shortDate(current.recorded_at)].filter(Boolean).join(', ') : null
  return <Card className="grid content-start gap-2 p-3">
    <CardHead right={may && !editing && <Button size="xs" variant="outline" onClick={() => setEditing(true)}>{current ? 'Change' : 'Write the prescription'}</Button>}>
      The prescription{who && <span className="font-normal normal-case tracking-normal"> · {who}</span>}</CardHead>
    {q.isLoading ? <Spinner label="Reading the prescription" />
      : q.error ? <p className="text-13 text-danger">The prescription could not be read</p>
      : shown ? <>
        <KV dense items={rxWords(shown).map(([k, v]) => [k, v])} labelWidth="6rem" />
        {copy && <p className="text-12 text-faint">As copied at Before{changed ? ': the standing one has changed since' : ''}.</p>}
      </> : <p className="text-13 text-warn">No standing prescription: the doctor writes one.</p>}
    {editing && <RxEditor dept={dept} patientId={patientId} current={current} onDone={() => setEditing(false)} />}
  </Card>
}

function RxEditor({ dept, patientId, current, onDone }: { dept: Pick<Department, 'id'>; patientId: string; current: { entry_id: string; data: RxData } | null; onDone: () => void }) {
  const [f, setF] = useState<RxForm>(() => rxForm(current?.data))
  const s = useSign()
  const set = <K extends keyof RxForm>(k: K, v: RxForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const missing = rxMissing(f)
  const save = () => { const e = !missing.length && rxEntry(f, patientId, dept.id, current); if (e) void s.sign([e], onDone) }
  const fields = RX_FIELDS.filter((x) => !(f.none && (x.key === 'bolus' || x.key === 'rate')))
  return <div className="grid gap-2 border-t border-line pt-2" onKeyDown={onSign(save)}>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {fields.map((x) => <label key={x.key} className="grid gap-0.5"><span className={LABEL}>{x.label} <span className="text-faint">{x.unit}</span></span>
        <NumberInput dense label={x.label} value={f[x.key]} onValue={(v) => set(x.key, v)} /></label>)}
      <label className="grid gap-0.5"><span className={LABEL}>Dialyser</span><Input dense value={f.dialyser} maxLength={40} onChange={(e) => set('dialyser', e.target.value)} aria-label="Dialyser" /></label>
    </div>
    <div className="flex flex-wrap items-center gap-1.5"><span className={LABEL}>Heparin</span>
      <Chip on={!f.none} onClick={() => set('none', false)}>A dose</Chip><Chip on={f.none} onClick={() => set('none', true)}>None</Chip></div>
    <div className="flex flex-wrap items-center gap-1.5"><span className={LABEL}>Access</span>
      {ACCESS.map(([k, w]) => <Chip key={k} on={f.access === k} onClick={() => set('access', k)}>{w}</Chip>)}
      <Input dense value={f.site} maxLength={60} onChange={(e) => set('site', e.target.value)} placeholder="Site: left forearm" aria-label="Access site" className="min-w-0 flex-1" /></div>
    <Input dense value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="Note (optional)" aria-label="Note" />
    <Notices items={rxNotices(f).map((text) => ({ text, tone: 'warn' as const }))} />
    {missing.length > 0 && <p className="text-12 text-faint">Needs {missing.join(' and ')}.</p>}
    <SignState err={s.err} warn={s.warn} />
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={save} disabled={missing.length > 0} loading={s.busy}>Save<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
  </div>
}
