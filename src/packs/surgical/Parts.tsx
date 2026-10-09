// Surgery's parts of the chart (spec/openCare.md §5.7; the pictures #surg-clinic, #surg-opnote): the operation note's card under the
// line (the surgeon's template, every line editable; the times, the anaesthetic and blood loss from the anaesthetic record and the
// specimen and implants from Sign out, read by their shape from what refers to the operation) and the Surgery section (today, planned,
// before; what was sent and left in).
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import type { ServerEntry } from '@core/db/types'
import type { SectionBody } from '@core/screens/chart/sections'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { Chip, Empty, Input, Textarea, shortDate } from '@core/ui'
import { OPEN, isOperation, minutesBetween, noteLine, noteText, templateFor, templatesOf, type OpNote, type OrderLike } from './model'

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <p className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-0.5 text-13"><span className="text-12 text-faint">{k}</span><span className="text-fg">{children}</span></p>
const Field = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="grid gap-1"><span className="text-12 text-faint">{k}</span>{children}</div>
const COMPLICATIONS = ['None', 'Bile spilled', 'Stones spilled', 'Bleeding', 'Converted to open']

/** what refers to the operation (the anaesthetic record, the checklist's Sign out), read once */
function useAbout(deptId: string | undefined, op: string | undefined) {
  return useQuery({ queryKey: ['surgical.about', deptId, op], enabled: !!deptId && !!op, staleTime: 30_000,
    queryFn: async () => (await read<{ entries: ServerEntry[] | null }>({ shape: 'item', department_id: deptId, item: op })).entries ?? [] })
}
const latestWith = (es: ServerEntry[], f: (d: Record<string, unknown>) => boolean) => es.filter((e) => !e.hidden && e.data && f(e.data)).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]?.data

export function OpNoteCard({ q, set }: CardEditorProps) {
  const { dept, org } = useDepartment()
  const n = (q.surgical ?? {}) as OpNote
  const put = (patch: Partial<OpNote>) => { const next = { ...n, ...patch }; set({ surgical: next, text: noteText(next) }) }
  const about = useAbout(dept?.id, n.op)
  // once for each draft (a new line is a new draft, with no surgeon yet): the surgeon's own template, the record's times and anaesthetic,
  // Sign out's specimen and implants, where the note has none
  useEffect(() => {
    if (n.surgeon !== undefined || !about.data || !org) return
    const rec = latestWith(about.data, (d) => typeof d.times === 'object' && d.times !== null) as { times?: { knife?: string; end?: string }; technique?: string; anaesthetist?: string; blood_loss?: number } | undefined
    const out = latestWith(about.data, (d) => d.part === 'sign_out') as { specimen?: string; implants?: { what: string; lot?: string; left_in?: number }[] } | undefined
    const code = org.services.find((s) => s.name.replace(/\s*\(.*\)$/, '') === n.operation)?.code
    const t = templateFor(templatesOf(org), code, org.me.name)
    put({ surgeon: n.surgeon ?? org.me.name, ...(t && !n.steps ? { why: t.why, findings: t.findings, steps: t.steps, closure: t.closure } : {}),
      ...(rec?.times?.knife && !n.times ? { times: { from: rec.times.knife, to: rec.times.end } } : {}), ...(rec?.anaesthetist && !n.anaesthetist ? { anaesthetist: rec.anaesthetist } : {}),
      ...(rec?.technique && !n.technique ? { technique: rec.technique } : {}), ...(rec?.blood_loss != null && !n.blood_loss ? { blood_loss: rec.blood_loss } : {}),
      ...(out?.specimen && !n.specimen ? { specimen: `${out.specimen} → Histopathology` } : {}),
      ...(out?.implants?.length && !n.implants ? { implants: out.implants.map((i) => `${i.what}${i.left_in != null ? ` · ${i.left_in} left in` : ''}${i.lot ? ` · lot ${i.lot}` : ''}`).join('; ') } : {}) })
  }, [about.data, org, n.surgeon === undefined]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = n.times; const mins = minutesBetween(t?.from, t?.to)
  const small = 'h-7 text-13'
  return <div className="grid gap-2 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="text-14 font-semibold text-fg">Operation note · {n.operation}</b><span className="text-muted">{n.surgeon ? `${n.surgeon}'s template for this operation · ` : ''}every line editable</span></p>
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      <label className="flex items-center gap-2"><span className="w-24 text-12 text-faint">Surgeon</span><Input value={n.surgeon ?? ''} onChange={(e) => put({ surgeon: e.target.value })} className={small} /></label>
      <label className="flex items-center gap-2"><span className="w-24 text-12 text-faint">Assistant</span><Input value={n.assistant ?? ''} onChange={(e) => put({ assistant: e.target.value })} className={small} /></label>
      <label className="flex items-center gap-2"><span className="w-24 text-12 text-faint">Anaesthetist</span><Input value={[n.anaesthetist, n.technique].filter(Boolean).join(' · ')} onChange={(e) => put({ anaesthetist: e.target.value, technique: undefined })} className={small} /></label>
      <label className="flex items-center gap-2"><span className="w-24 text-12 text-faint">Times</span><Input value={t?.from ?? ''} onChange={(e) => put({ times: { ...t, from: e.target.value } })} placeholder="08:55" className={`${small} w-20`} />–
        <Input value={t?.to ?? ''} onChange={(e) => put({ times: { ...t, to: e.target.value } })} placeholder="09:40" className={`${small} w-20`} />{mins != null && mins > 0 && <span className="text-muted">{mins} min</span>}</label></div>
    <Field k="Why"><Input value={n.why ?? ''} onChange={(e) => put({ why: e.target.value })} className={small} /></Field>
    <Field k="Findings"><Textarea dense minRows={2} value={n.findings ?? ''} onChange={(e) => put({ findings: e.target.value })} /></Field>
    <Field k="Steps · from the template"><Textarea dense minRows={4} value={n.steps ?? ''} onChange={(e) => put({ steps: e.target.value })} /></Field>
    <Field k="Closure"><Input value={n.closure ?? ''} onChange={(e) => put({ closure: e.target.value })} className={small} /></Field>
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-28 text-12 text-faint">Blood loss</span><Input inputMode="numeric" value={n.blood_loss ?? 0} onChange={(e) => put({ blood_loss: Number(e.target.value) || 0 })} className={`${small} w-20`} />
      <span className="text-muted">mL{about.data && latestWith(about.data, (d) => typeof d.blood_loss === 'number') ? ' · from the record' : ''}</span></div>
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-28 text-12 text-faint">Drain</span>{['none', 'Subhepatic 14 Fr', 'Redivac 12 Fr'].map((d) => <Chip key={d} on={(n.drain ?? 'none') === d} onClick={() => put({ drain: d })}>{d === 'none' ? 'None' : d}</Chip>)}</div>
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-28 text-12 text-faint">Complications</span>{COMPLICATIONS.map((c) => { const on = c === 'None' ? !n.complications?.length : n.complications?.includes(c.toLowerCase())
      return <Chip key={c} on={on} onClick={() => put({ complications: c === 'None' ? [] : on ? n.complications!.filter((x) => x !== c.toLowerCase()) : [...(n.complications ?? []), c.toLowerCase()] })}>{c}</Chip> })}</div>
    <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">From Sign out</span>
      <span className="flex flex-wrap items-center gap-1.5"><span className="w-24 text-12 text-faint">Specimen</span><span className="text-fg">{n.specimen ?? 'none sent'}</span>{n.specimen && <span className="text-12 text-faint">the /lab order, already signed</span>}</span>
      <span className="flex flex-wrap items-center gap-1.5"><span className="w-24 text-12 text-faint">Implants</span><span className="text-fg">{n.implants ?? 'none'}</span></span></div>
    <p className="text-12 text-faint"><span className="font-mono">#postop</span> on the next line brings the post-op lines (the base's preset), each removable</p>
  </div>
}
export const opNoteCardLine = (p: Record<string, unknown>) => noteLine(p.surgical as OpNote)

// ── the Surgery section ──
export const opsOf = (rows: OrderLike[], services: { id: string; steps?: string[] }[]) => rows.filter((o) => isOperation(o, services as never))
const STEP: Record<string, string> = { scheduled: 'scheduled', sent_for: 'sent for', arrived: 'in the operating room', anaesthetic: 'in the operating room', operating: 'in the operating room', recovery: 'in recovery', back: 'back on the ward' }
export function SurgerySection({ p, own }: SectionBody) {
  const orders = opsOf((p.rec.tables['base.orders']?.rows ?? []) as OrderLike[], p.ctx.org?.services ?? [])
  const procs = (p.facts ?? []).filter((e) => e.type === 'procedure' && !e.hidden).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  const notes = own.shown.filter((e) => e.data?.surgical).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  const today = new Date().toISOString().slice(0, 10)
  const todays = notes.filter((e) => e.occurred_at.slice(0, 10) === today)
  const planned = orders.filter((o) => OPEN.has(o.status))
  const before = procs.filter((e) => e.occurred_at.slice(0, 10) !== today)
  if (!orders.length && !procs.length && !notes.length) return <Empty size="sm">No operation on record</Empty>
  return <div className="grid gap-0.5">
    {todays.map((e) => { const n = e.data!.surgical as OpNote
      return <div key={e.id}><Row k="Today"><button type="button" onClick={() => p.open(e.id)} className="rounded-sm text-start hover:underline focus-ring">{n.operation}</button>{n.times?.from ? ` · knife ${n.times.from}, closed ${n.times.to}` : ''}</Row>
        {n.anaesthetist && <Row k="Anaesthetic">{[n.technique, n.anaesthetist].filter(Boolean).join(' · ')}</Row>}
        {n.specimen && <Row k="Sent">{n.specimen}</Row>}{n.implants && <Row k="Implants">{n.implants}</Row>}</div> })}
    {planned.map((o) => <Row key={o.item} k="Planned">{o.service_name}{o.step_key ? ` · ${STEP[o.step_key] ?? o.step_key}` : ' · to schedule'} · decided {shortDate(o.ordered_at)}</Row>)}
    {!planned.length && !todays.length && <Row k="Planned">none yet</Row>}
    {before.slice(0, 5).map((e) => <Row key={e.id} k={shortDate(e.occurred_at)}>{e.line}</Row>)}
  </div>
}
