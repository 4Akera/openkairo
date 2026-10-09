// The pre-op assessment and the anaesthetic record in the record (the chart's Whole record): in the clinic's words, not the ids they
// are about (the entry's shell draws who wrote it and when). The record's 5-minute columns are the base's vitals, drawn as vitals.
import { KV, Tag } from '@core/ui'
import { HISTORY, PLANS } from './model'

type Row = [string, React.ReactNode]
const str = (v: unknown) => typeof v === 'string' && v ? v : null

export function PreopView({ data }: { data: Record<string, unknown> }) {
  const h = (data.history ?? {}) as Record<string, string>; const a = (data.airway ?? {}) as Record<string, unknown>
  const stop = (data.stop ?? []) as { medicine: string; what: string }[]; const consent = (data.consent ?? []) as string[]
  const plan = PLANS.find(([k]) => k === data.plan)?.[1]
  const airway = [a.mallampati && `Mallampati ${String(a.mallampati)}`, a.mouth_cm != null && `mouth ${String(a.mouth_cm)} cm`, a.tm_cm != null && `thyromental ${String(a.tm_cm)} cm`,
    a.neck_cm != null && `neck ${String(a.neck_cm)} cm`, a.neck_moves === false ? 'neck stiff' : a.neck_moves === true && 'neck moves'].filter(Boolean).join(' · ')
  const rows: Row[] = [
    ...(str(data.operation) ? [['Operation', data.operation as string] as Row] : []),
    ...HISTORY.filter(([k]) => h[k]).map(([k, l]): Row => [l, h[k]]),
    ...(airway ? [['Airway', airway] as Row] : []),
    ...(plan ? [['Plan', [plan, str(data.plan_note)].filter(Boolean).join(' · ')] as Row] : []),
    ...(stop.length ? [['Before the operation', <ul key="stop" className="grid gap-0.5">{stop.map((s, i) => <li key={i}>{s.medicine} — {s.what}</li>)}</ul>] as Row] : []),
    ...(consent.length ? [['Risks told', consent.join('; ')] as Row] : [])]
  return <div className="grid gap-1.5 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="font-semibold text-fg">ASA {String(data.asa ?? '')}{data.emergency ? 'E' : ''}</b>
      {data.verdict === 'fit' ? <Tag tone="ok">fit</Tag> : <Tag tone="warn">not yet</Tag>}{str(data.verdict_note) && <span className="text-muted">{String(data.verdict_note)}</span>}</p>
    {rows.length > 0 && <KV dense items={rows} />}
    {str(data.note) && <p className="text-muted">{String(data.note)}</p>}
  </div>
}

const TIMES: [string, string][] = [['in', 'in'], ['start', 'anaesthetic'], ['knife', 'knife'], ['end', 'closed'], ['out', 'out']]
export function RecordView({ data }: { data: Record<string, unknown> }) {
  const t = (data.times ?? {}) as Record<string, string>; const fluids = (data.fluids ?? []) as { what: string; ml: number }[]
  const events = (data.events ?? []) as { at: string; text: string }[]
  const times = TIMES.filter(([k]) => t[k]).map(([k, l]) => `${l} ${t[k]}`).join(' · ')
  const rows: Row[] = [
    ...(str(data.operation) ? [['Operation', data.operation as string] as Row] : []),
    ...(times ? [['Times', times] as Row] : []),
    ...([['Anaesthetic', [str(data.technique), data.asa ? `ASA ${String(data.asa)}` : null, str(data.anaesthetist)].filter(Boolean).join(' · ')]] as Row[]).filter((r) => r[1]),
    ...(['airway', 'breathing', 'agent', 'warming'] as const).filter((k) => str(data[k])).map((k): Row => [k.charAt(0).toUpperCase() + k.slice(1), data[k] as string]),
    ...(fluids.length ? [['Fluids', fluids.map((f) => `${f.what} ${f.ml} mL`).join(' · ')] as Row] : []),
    ...(typeof data.blood_loss === 'number' ? [['Blood loss', `${data.blood_loss} mL`] as Row] : []),
    ...(str(data.urine) ? [['Urine', data.urine as string] as Row] : []),
    ...(events.length ? [['Events', <ul key="ev" className="grid gap-0.5">{events.map((e, i) => <li key={i}><span className="tnum text-muted">{e.at}</span> {e.text}</li>)}</ul>] as Row] : [])]
  return <div className="grid gap-1.5 text-13">
    {rows.length > 0 && <KV dense items={rows} />}
    {str(data.note) && <p className="text-muted">{String(data.note)}</p>}
  </div>
}
