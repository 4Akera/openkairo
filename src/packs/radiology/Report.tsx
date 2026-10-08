// Report (radiology.report, spec/openCare.md §5.5; the pictures "the report" and "a critical finding"): the radiologist's tab. To report
// (scanned, waiting for its report) beside the report of the one open: who and what (the exam, the side, the question; who asked,
// when it was scanned and what the radiographer noted), the last study of the same kind with its impression (Compared says so in the
// report), the department's templates (its presets), Findings and Impression — what the doctor reads first. Sign writes the report:
// the base's result, final, answering the order, the findings and the impression as text (LOINC 18782-3, 19005-8), the impression its
// conclusion. Critical… is only a notice, as the laboratory's: "Critical: tell Dr. X now", then Sign · critical (the impression marked
// AA, so the base's loop puts it on the doctor's To review as critical at once). Drafts are kept in this browser until signed.
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { purposeFor, useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { newId, oneSet } from '@core/db/entries'
import { read, write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow, ServerEntry, ServerRecord } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex, matches } from '@core/screens/bench/shared'
import { isWalkIn } from '@core/screens/bench/walkins'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListSection, ScreenFrame, Spinner, Tag, Textarea, cn, errorText, hm, minutesSince, shortDate, ymd, type ScreenView } from '@core/ui'
import { KINDS } from './exams'
import { useWords } from './requests'
import { templateOf, templatesFor } from './templates'
import { reportOf } from './reports'

type View = 'todo' | 'drafts' | 'done'
interface Draft { findings: string; impression: string; compared?: string | null }
const KEY = (item: string) => `opencare.radiology.draft.${item}`
const load = (item: string): Draft | null => { try { const v = localStorage.getItem(KEY(item)); return v ? JSON.parse(v) as Draft : null } catch { return null } }
const keep = (item: string, d: Draft | null) => { try { if (d && (d.findings.trim() || d.impression.trim())) localStorage.setItem(KEY(item), JSON.stringify(d)); else localStorage.removeItem(KEY(item)) } catch { /* storage blocked: kept on screen only */ } }
const SIDE = 'rounded-sm bg-accent-soft px-1 text-11 font-semibold uppercase tracking-wide text-accent'
/** waiting for its report: scanned, still open, no report signed */
const toReport = (r: RequestQueueRow) => r.order.step_key === 'scanned' && r.order.status !== 'cancelled' && !(r.reply?.is_final)
export function Report({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const { org } = useDepartment(); const qc = useQueryClient()
  const [view, setView] = useState<View>('todo'); const [kind, setKind] = useState<string | null>(null); const [find, setFind] = useState('')
  const [at, setAt] = useState<string | null>(null); const [said, setSaid] = useState<string | null>(null); const [n, setN] = useState(0)
  const f = find.trim().toLowerCase(); const today = ymd(new Date().toISOString())
  const waiting = useMemo(() => (q.data?.requests ?? []).filter(toReport).sort((a, b) => rank(a) - rank(b) || (a.order.last_at ?? '').localeCompare(b.order.last_at ?? '')), [q.data])
  const drafts = waiting.filter((r) => load(r.item)); void n
  const signed = (q.data?.recent ?? []).filter((r) => r.reply && r.order.answered_at && ymd(r.order.answered_at) === today)
  const lists: Record<View, RequestQueueRow[]> = { todo: waiting, drafts, done: signed }
  const kindOf = (r: RequestQueueRow) => r.section_name ?? 'Other'
  const shown = lists[view].filter((r) => (!kind || kindOf(r) === kind) && matches(r.patient, f))
  const kinds = [...KINDS, 'Other'].filter((k) => lists[view].some((r) => kindOf(r) === k))
  const words = useWords(dept.id, [...waiting, ...signed].map((r) => r.item))
  const current = shown.find((r) => r.item === at) ?? (view !== 'done' ? shown[0] : undefined)
  const views: ScreenView<View>[] = [{ id: 'todo', label: 'To report', count: waiting.length, needs: 'warn' }, { id: 'drafts', label: 'Drafts', count: drafts.length },
    { id: 'done', label: 'Signed today', count: signed.length }]
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setAt(null) }}
    filters={kinds.length > 1 && <span className="flex flex-wrap items-center gap-1">
      <Chip shape="pill" on={!kind} onClick={() => setKind(null)}>All <span className="tnum opacity-70">{lists[view].length}</span></Chip>
      {kinds.map((k) => <Chip key={k} shape="pill" on={kind === k} onClick={() => setKind(kind === k ? null : k)}>{k} <span className="tnum opacity-70">{lists[view].filter((r) => kindOf(r) === k).length}</span></Chip>)}</span>}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Record number or name" className="w-full sm:w-64" />}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {q.isLoading ? <Spinner label="Loading" /> : view === 'done'
      ? <Card><ul>{shown.length ? shown.map((r) => { const rep = reportOf(r.reply?.data)
          return <li key={r.item} className="grid gap-0.5 border-t border-line px-4 py-2 text-13 first:border-t-0">
            <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-fg">{r.patient.given_name} {r.patient.family_name}</span>
              <span className="text-muted">{r.service_name}</span>{words.data?.get(r.item)?.side && <span className={SIDE}>{words.data.get(r.item)!.side}</span>}
              {rep.critical && <Tag tone="danger">critical</Tag>}<span className="ms-auto text-12 text-faint tnum">{r.reply?.author_name} · {r.reply ? hm(r.reply.recorded_at) : ''}</span></span>
            <span className="truncate text-muted">{rep.impression}</span></li> }) : <li><Empty>Nothing signed today.</Empty></li>}</ul></Card>
      : !shown.length ? <Card><Empty>{f ? 'No match here.' : view === 'drafts' ? 'No drafts.' : 'Nothing to report.'}</Empty></Card>
      : <div className="grid gap-3 md:grid-cols-[17rem_minmax(0,1fr)] md:items-start">
        <Card className="overflow-hidden md:sticky md:top-3"><ul aria-label="To report" className="max-h-56 overflow-y-auto md:max-h-[70vh]">
          <ListSection title={view === 'drafts' ? 'Drafts' : 'To report'} count={shown.length} />
          {shown.map((r) => { const on = r.item === current?.item; const w = words.data?.get(r.item)
            return <li key={r.item} className="border-t border-line"><button type="button" aria-current={on || undefined} onClick={() => setAt(r.item)}
              className={cn('grid w-full gap-0.5 px-3 py-2 text-start text-13 transition-colors hover:bg-hover focus-ring', on && 'rail bg-hover')}>
              <span className="flex items-center gap-2"><span className="truncate font-medium text-fg">{r.patient.given_name} {r.patient.family_name}</span>
                {load(r.item) && <span className="text-11 text-faint">draft</span>}
                <span className="ms-auto text-12 text-faint tnum">{r.order.last_at ? `${minutesSince(r.order.last_at)} min` : ''}</span></span>
              <span className="flex min-w-0 items-center gap-1.5 text-muted">{r.request?.priority && r.request.priority !== 'routine' && <Tag tone="danger">{r.request.priority}</Tag>}
                {w?.portable && <Tag>portable</Tag>}<span className="truncate">{r.service_name}</span>{w?.side && <span className={SIDE}>{w.side}</span>}</span>
            </button></li> })}
        </ul></Card>
        {current && <ReportCard key={current.item} r={current} deptId={dept.id} side={words.data?.get(current.item)?.side}
          onKept={() => setN((x) => x + 1)} onSigned={(x) => { setSaid(x); setAt(null); refresh(qc) }} templates={templatesFor((org?.templates ?? []).filter((t) => t.department_id === dept.id), current.section_name)} />}
      </div>}
  </ScreenFrame>
}
const rank = (r: RequestQueueRow) => r.request?.priority === 'stat' ? 0 : r.request?.priority === 'urgent' ? 1 : 2

/** the patient's last report of the same kind here, before this one: its exam, date, who signed it and its impression */
function usePrior(r: RequestQueueRow, deptId: string) {
  const { org } = useDepartment()
  return useQuery({ queryKey: ['radiology.prior', r.patient.id, r.item], staleTime: 60_000,
    queryFn: async () => {
      const page = await read<ServerRecord>({ shape: 'record', patient_id: r.patient.id, department_id: deptId, include: [], types: ['result'], departments: [deptId], limit: 30, ...purposeFor(r.patient.id) })
      const kindOf = (e: ServerEntry) => org?.services.find((s) => s.id === (e.data?.service as { id?: string } | undefined)?.id)?.section_name
      const prior = page.entries.filter((e) => !e.hidden && e.refers_to !== r.order.latest_entry && kindOf(e) === r.section_name).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
      return prior ? { name: String((prior.data?.service as { name?: string } | undefined)?.name ?? 'Study'), at: prior.occurred_at, impression: reportOf(prior.data).impression } : null
    } })
}

function ReportCard({ r, deptId, side, templates, onKept, onSigned }: { r: RequestQueueRow; deptId: string; side?: string; templates: { id: string; name: string; lines: string[] }[]
  onKept: () => void; onSigned: (said: string) => void }) {
  const [d, setD] = useState<Draft>(() => load(r.item) ?? { findings: '', impression: '' })
  const [critical, setCritical] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const prior = usePrior(r, deptId); const { org } = useDepartment()
  useEffect(() => { const t = setTimeout(() => { keep(r.item, d); onKept() }, 400); return () => clearTimeout(t) }, [d, r.item]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const walk = isWalkIn(r.order, org?.allDepartments ?? [])
  const who = walk ? (r.order.asked_by ? `the patient or ${r.order.asked_by}` : 'the patient') : r.requester_name ?? r.from_department_name ?? 'the doctor who asked'
  const name = `${r.patient.given_name} ${r.patient.family_name}`
  const ready = !!d.impression.trim()
  const sign = async () => {
    if (!ready || busy) return
    setBusy(true); setError(null)
    const findings = [d.compared ? `Compared with ${d.compared}.` : '', d.findings.trim()].filter(Boolean).join('\n')
    const e: EntryIn = { id: newId(), type: 'result', patient_id: r.patient.id, department_id: deptId, refers_to: r.order.latest_entry, relation: 'answers',
      data: { status: 'final', service: { ...(r.service_id ? { id: r.service_id } : {}), name: r.service_name ?? r.display_line }, conclusion: d.impression.trim(),
        // the impression first: what the doctor reads first, on every line that shows the report
        analytes: [{ key: 'impression', name: 'Impression', code: { system: 'loinc', code: '19005-8', display: 'Impression' }, text: d.impression.trim(), ...(critical ? { interpretation: 'AA' } : {}) },
          ...(findings ? [{ key: 'findings', name: 'Findings', code: { system: 'loinc', code: '18782-3', display: 'Findings' }, text: findings }] : [])] } } as EntryIn
    try { await write(oneSet([e])); keep(r.item, null); onSigned(`${name} · ${r.service_name}: signed${critical ? ' · critical, on the doctor\'s To review now' : ''}`) }
    catch (x) { setError(errorText(x)) } finally { setBusy(false) }
  }
  return <Card className="grid content-start gap-3 p-4" onKeyDown={(k) => { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) { k.preventDefault(); void sign() } }}>
    <div className="grid gap-0.5">
      <p className="flex flex-wrap items-baseline gap-2"><span className="text-18 font-semibold text-fg">{name}</span><span className="text-13 text-muted">{ageSex(r.patient)} · #{r.patient.record_number}</span></p>
      <p className="flex flex-wrap items-center gap-2 text-14 font-medium text-fg">{r.request?.priority && r.request.priority !== 'routine' && <Tag tone="danger">{r.request.priority}</Tag>}
        {r.service_name}{side && <span className={SIDE}>{side}</span>}{r.question_text && <span className="font-normal text-muted">· ? {r.question_text}</span>}</p>
      <p className="text-12 text-muted">{[walk ? (r.order.asked_by ? `${r.order.asked_by} · walk-in` : 'walk-in') : [r.requester_name, r.from_department_name].filter(Boolean).join(' · '),
        r.order.last_at && `scanned ${hm(r.order.last_at)}`, r.step_data?.note].filter(Boolean).join(' · ')}</p>
    </div>
    {prior.data && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-13">
      <span className="text-12 font-semibold uppercase tracking-[0.06em] text-faint">Before</span>
      <span className="text-fg">{prior.data.name} · {shortDate(prior.data.at)}</span>
      <span className="min-w-0 flex-1 truncate text-muted" title={prior.data.impression}>“{prior.data.impression}”</span>
      <Chip variant="check" on={!!d.compared} onClick={() => set({ compared: d.compared ? null : `${prior.data!.name}, ${shortDate(prior.data!.at)}` })}>Compared</Chip></div>}
    {templates.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Template:</span>
      {templates.map((t) => <Chip key={t.id} onClick={() => set(templateOf(t.lines))}>{t.name}</Chip>)}</div>}
    <label className="grid gap-1"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Findings</span>
      <Textarea autoGrow minRows={6} value={d.findings} onChange={(e) => set({ findings: e.target.value })} className="min-h-36" /></label>
    <label className="grid gap-1"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Impression · what the doctor reads first</span>
      <Textarea autoGrow minRows={2} value={d.impression} onChange={(e) => set({ impression: e.target.value })} className="min-h-16 font-medium" /></label>
    {critical && <Callout tone="danger" title={`Critical: tell ${who} now`}>Phone {walk ? 'them' : r.from_department_name ?? 'the department'}, then sign. It reaches the doctor's To review as critical at once.</Callout>}
    {error && <Callout tone="danger" title="Not signed">{error}</Callout>}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={critical ? 'danger' : 'primary'} disabled={!ready} loading={busy} onClick={() => void sign()}>{critical ? 'Sign · critical' : 'Sign'}<Kbd className="ms-1">⌘↵</Kbd></Button>
      <Chip on={critical} onClick={() => setCritical(!critical)}>Critical…</Chip>
      <span className="text-12 text-faint">{!ready ? 'Write the impression first.' : `Signed, it goes to ${walk ? 'the record' : `${r.requester_name ?? 'the doctor'}'s To review and the chart`}. Drafts stay in this browser.`}</span></div>
  </Card>
}
