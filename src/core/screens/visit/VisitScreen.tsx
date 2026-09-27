import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { useDepartment } from '../../hooks/organization'
import { useRecord, useVisitQueue } from '../../hooks/reads'
import { refresh, useVisitActions } from '../../hooks/writes'
import { useDrafts, useDraftsFor } from '../../hooks/drafts'
import { compose } from '../../hooks/composer'
import { rememberPatient } from '../../hooks/recent'
import { read, write, WriteWarned, words, type EntryBody, type EntryIn, type Finding } from '../../db/rpc'
import { draftEntries, move, oneSet } from '../../db/entries'
import type { PresenceRow, QueueRow, RecordView, TableRead, VisitRow } from '../../db/types'
import type { EntryData } from '../../db/shapes.generated'
import { Badge, Button, Centered, Kbd, Spinner, cn, errorText, flagClass, minutesSince, shortDate, ymd } from '../../ui'
import { RecordViews } from './Record'
import { nextPatient } from '../clinic/words'
import { Side } from './Side'
import { Composer, type ComposerHandle } from './Composer'
import { QueueStrip } from './QueueStrip'
import { Choose } from '../ward/BedBoard'
import { DISPOSITION } from '../ward/words'

/** The visit (spec/openCare.md §4.7), built for typing: banner with Done always in reach, the lists on the left, the composer on the right.
 *  Done is one set: every draft's entries, then seen (when nobody saw the patient yet) and done, each changing the visit's latest version.
 *  A stay (§4.2) has no Done: Sign writes the drafts into the stay as one set and moves nothing; Discharge ends it. */
export function VisitScreen() {
  const { visitId, patientId: paramPatient } = useParams()
  const { dept, can, org } = useDepartment()
  const navigate = useNavigate(); const qc = useQueryClient()
  const queue = useVisitQueue(dept?.work === 'visits' ? dept.id : null)   // a ward has beds, not a queue
  const fromQueue = queue.data?.rows.find((r) => r.id === visitId)
  // a visit opened from elsewhere (the desk, a link): whose it is comes from who-is-where
  const where = useQuery({ queryKey: ['visit_patient', visitId, dept?.id], enabled: !!visitId && !paramPatient && !fromQueue && !!dept && !queue.isLoading,
    queryFn: async () => (await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept!.id, where: { item: visitId }, entries: false })).rows[0]?.patient_id ?? null })
  const patientId = paramPatient ?? fromQueue?.patient.id ?? where.data ?? null
  const rec = useRecord(patientId, dept?.id ?? null, visitId ?? null)
  const visits = useVisitActions()
  const drafts = useDraftsFor(patientId)
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState<{ findings: Finding[]; retry: (confirmed: string[]) => void } | null>(null)
  const [discharging, setDischarging] = useState(false)
  const today = useRef<ComposerHandle>(null)
  const visit = rec.data?.visit ?? null
  // a stay takes only its own moves (§4.2): it is never called, seen or Done here, and is nobody's in the clinic's sense
  const stay = visit?.kind === 'stay'; const admitted = stay && visit.presence.state === 'admitted'
  // this department's visit, and this clinician's patient: another doctor's patient is theirs to finish
  const meId = org?.me.id
  const mine = !!visit && !stay && visit.department_id === dept?.id && (visit.status !== 'in_consult' || !visit.assignee_id || visit.assignee_id === meId)
  const withOther = !!visit && visit.department_id === dept?.id && visit.status === 'in_consult' && !!visit.assignee_id && visit.assignee_id !== meId
  useEffect(() => { if (rec.data) rememberPatient({ ...rec.data.patient }) }, [rec.data?.patient.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // opening a waiting patient from the queue calls him (calling is not seeing)
  const started = useRef<string | null>(null)
  useEffect(() => { if (visit && mine && (visit.presence.state === 'waiting' || visit.presence.state === 'back') && can('write:called') && visitId && started.current !== visit.id) { started.current = visit.id; visits.call.mutate({ visit }) } }, [visit?.id, visit?.presence.state]) // eslint-disable-line react-hooks/exhaustive-deps
  // the next patient by the list's own rule: my Back patient (or an unclaimed one) first, else the first waiting
  const next = useMemo(() => nextPatient((queue.data?.rows ?? []).filter((r) => r.id !== visitId), meId), [queue.data, visitId, meId])
  /** the composer's line goes with Done; if it cannot be added (a warning to confirm, a field missing) Done waits and the card says why */
  const flushed = () => today.current ? today.current.flush() : true
  /** the drafts as entries (a medication sent to the pharmacy is two) */
  const entries = (withVisit: boolean): EntryIn[] => (useDrafts.getState().byPatient[patientId ?? ''] ?? []).flatMap((d) =>
    draftEntries(d, { patientId: patientId!, departmentId: dept!.id, visitId: withVisit && visit ? visit.id : null, record: rec.data, org }))
  /** the visit's moves after the drafts: seen when nobody saw him yet, then the move asked for; each changes the one before */
  const moves = (v: VisitRow, last: EntryBody<'done' | 'back_to_waiting'>): EntryIn[] => {
    const seen = !v.seen_at && entries(true).length ? [move('seen', v, dept!.id, {})] : []
    return [...seen, last.type === 'done' ? move('done', v, dept!.id, last.data, seen[0]?.id) : move('back_to_waiting', v, dept!.id, last.data, seen[0]?.id)]
  }
  /** one set: landed → cleared; warnings → inline cards, Sign anyway resends with them confirmed */
  async function send(es: EntryIn[], after: () => void, confirmed: string[] = []) {
    if (!es.length) { after(); return }
    setErr(null); setWarn(null); setBusy(true)
    try { await write(oneSet(es, { confirmed })); useDrafts.getState().clear(patientId!); refresh(qc); after() }
    catch (e) { if (e instanceof WriteWarned) setWarn({ findings: e.outcome.findings, retry: (c) => void send(es, after, [...confirmed, ...c]) }); else setErr(errorText(e)) }
    finally { setBusy(false) }
  }
  /** the drafts alone, no move: in a stay they are written into it, and the patient stays open */
  function sign() { if (!flushed() || !patientId) return; void send(entries(admitted), () => undefined) }
  function done(andNext: boolean, wait?: boolean) {
    if (!patientId || !visit || stay || !flushed()) return
    void send([...entries(true), ...moves(visit, { type: 'done', data: wait === undefined ? {} : { wait } })], () => navigate(andNext && next ? `/visit/${next.id}` : '/', { replace: andNext && !!next }))
  }
  /** another patient from the list: what is typed stays a draft; a patient only called, with nothing written, goes back to his place */
  async function openOther(to: QueueRow) {
    if (!flushed()) return; setErr(null)
    const written = (useDrafts.getState().byPatient[patientId ?? ''] ?? []).length > 0
    try {
      if (visit && mine && visit.status === 'in_consult' && !visit.seen_at && !written) await visits.back.mutateAsync({ visit, reason: 'other' })
      navigate(`/visit/${to.id}`)
    } catch (e) { setErr(errorText(e)) }
  }
  /** the patient steps out (an ECG, paying): what is written is signed now; the visit stays open */
  function backToWaiting() {
    if (!patientId || !visit || stay || !flushed()) return
    void send([...entries(true), ...moves(visit, { type: 'back_to_waiting', data: { reason: 'sent_out' } })], () => navigate('/'))
  }
  /** a stay ends from its own screen too: what is written goes with the discharge; the ward's beds come next */
  function discharge(disposition: EntryData['discharged']['disposition']) {
    if (!patientId || !visit || !admitted || !flushed()) return
    void send([...entries(true), move('discharged', visit, dept!.id, { disposition })], () => navigate('/'))
  }
  // the keyboard: / the composer · Alt+P/M/A start a problem, medication, allergy in it · ⌘↵ Done (Sign in a stay)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && stay) { e.preventDefault(); sign() }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && visit?.status === 'in_consult' && mine) { e.preventDefault(); done(dept?.after_done !== 'queue') }
      else if (e.key === '/' && !typing) { e.preventDefault(); today.current?.slash() }
      else if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const line = ({ KeyP: '/dx ', KeyM: '/rx ', KeyA: '/al ', p: '/dx ', m: '/rx ', a: '/al ' } as Record<string, string>)[e.code || e.key.toLowerCase()]
        if (line) { e.preventDefault(); compose({ text: line }) }
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  if (!dept) return <Centered><Spinner /></Centered>
  if (!patientId && (queue.isLoading || where.isLoading)) return <Centered><Spinner label="Opening the visit" /></Centered>
  if (!patientId) return <Centered><p className="text-14 text-faint">This visit is not in your queue. <button className="text-accent" onClick={() => navigate('/')}>Back to the queue</button></p></Centered>
  if (rec.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (rec.error || !rec.data) return <Centered><p className="text-14 text-danger">{rec.error?.message ?? 'no record'}</p></Centered>
  const r = rec.data
  const canWrite = can('write:note') || can('write:vitals') || can('write:order')
  const strip = dept.work === 'visits' && !stay && !!queue.data   // the clinic's line above the banner: the lists below stick lower
  return <div className="pb-10">
    <Banner r={r} visit={visit} mine={mine} onBack={() => navigate('/')} stay={stay && visit ? stayWords(visit, org?.places.find((p) => p.id === visit.place_id)?.name) : null}
      strip={strip ? <QueueStrip rows={queue.data.rows.filter((x) => x.id !== visitId)} next={next} me={meId} onOpen={(x) => void openOther(x)} /> : null}
      actions={stay && visit ? <>
        {admitted && visit.department_id === dept.id && can('write:discharged') && !discharging && <Button variant="outline" onClick={() => setDischarging(true)} disabled={busy}>Discharge</Button>}
        <Button onClick={sign} disabled={busy}>Sign{drafts.length ? ` ${drafts.length}` : ''}<Kbd className="ml-1">⌘↵</Kbd></Button></>
      : mine && visit?.status === 'in_consult' ? <>
        <Button onClick={() => done(dept.after_done !== 'queue')} disabled={busy}>{drafts.length ? `Sign ${drafts.length} · ` : ''}Done{dept.after_done !== 'queue' && next ? ` → ${next.patient.given_name}` : ''}<Kbd className="ml-1">⌘↵</Kbd></Button>
        <Menu.Root><Menu.Trigger asChild><Button variant="outline" size="md" aria-label="More"><ChevronDown className="h-4 w-4" /></Button></Menu.Trigger>
          <Menu.Portal><Menu.Content align="end" sideOffset={6} className="z-popover min-w-60 rounded-lg border border-line bg-raised p-1 text-14 shadow-md">
            {dept.patients_wait
              ? <MenuItem onSelect={() => done(dept.after_done !== 'queue', false)} hint="The visit closes now; results go to your review list">Done — patient goes home</MenuItem>
              : <MenuItem onSelect={() => done(dept.after_done !== 'queue', true)} hint="The patient comes back when the results are in">Done — patient waits for results</MenuItem>}
            {dept.after_done === 'queue' ? next && <MenuItem onSelect={() => done(true)}>Done → next patient ({next.patient.given_name})</MenuItem> : <MenuItem onSelect={() => done(false)}>Done, back to the queue</MenuItem>}
            {!visit.seen_at && <MenuItem onSelect={() => visits.back.mutate({ visit, reason: 'not_here' }, { onSuccess: () => navigate('/') })} hint="Called but not here: he keeps his place, and the desk sees the missed call">Not here</MenuItem>}
            <MenuItem onSelect={() => void backToWaiting()} hint={drafts.length ? `Signs the ${drafts.length} written so far; the visit stays open` : 'The visit stays open; call the patient in again later'}>Return to waiting</MenuItem>
          </Menu.Content></Menu.Portal></Menu.Root></>
        : <>{withOther && <span className="text-14 text-faint">With {fromQueue?.assignee_name ?? 'another clinician'} — theirs to finish</span>}
            {!mine && drafts.length > 0 && <Button onClick={sign} disabled={busy}>Sign {drafts.length}</Button>}
            {!visit && dept.work === 'visits' && can('write:checked_in') && <Button variant="outline" onClick={() => visits.open.mutate({ patient_id: patientId, department_id: dept.id }, { onSuccess: (v) => navigate(`/visit/${v.id}`) })}>Start visit</Button>}</>} />
    {err && <p className="mx-auto mt-3 max-w-7xl rounded-lg bg-danger-soft px-3 py-2 text-14 text-danger ring-1 ring-danger-line" role="alert">{err}</p>}
    {warn && <div className="mx-auto mt-3 grid max-w-7xl gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-14 text-warn ring-1 ring-warn-line" role="alert">
      {warn.findings.map((f, i) => <p key={i}><b className="font-medium">{words(f.code)}</b>{f.detail ? ` — ${f.detail}` : ''}</p>)}
      <div className="flex gap-2"><Button size="sm" onClick={() => warn.retry(warn.findings.map((f) => f.code))} disabled={busy}>Sign anyway</Button><Button size="sm" variant="ghost" onClick={() => setWarn(null)}>Change it</Button></div></div>}
    {discharging && admitted && <div className="mx-auto mt-3 flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-sunken px-3 py-2 ring-1 ring-line">
      <span className="text-14 font-medium">Discharge{drafts.length ? ` — signs the ${drafts.length} written` : ''}</span>
      <Choose label="To" options={DISPOSITION} go="Discharge" busy={busy} onCancel={() => setDischarging(false)} onGo={discharge} /></div>}
    <div className="mx-auto mt-4 grid max-w-7xl gap-4 px-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* the lists stay in view while the record scrolls */}
      <div className={cn('lg:sticky lg:self-start lg:overflow-y-auto', strip ? 'lg:top-[6.6rem] lg:max-h-[calc(100vh-7.6rem)]' : 'lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)]')}>
        <Side r={r} patientId={patientId} departmentId={dept.id} can={can} />
      </div>
      <div className="grid content-start gap-4">
        {canWrite && <Composer key={patientId} ref={today} r={r} patientId={patientId} departmentId={dept.id} can={can} />}
        <RecordViews r={r} patientId={patientId} departmentId={dept.id} view={org?.organization.record_view ?? 'visits'} />
      </div>
    </div>
  </div>
}

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
/** "Admitted · Bed 3 · day 2": day 1 is the day of admission, in the clinic's time zone; a stay that ended, its last day */
const stayWords = (v: VisitRow, bed: string | null | undefined) => {
  const day = Math.round((Date.parse(ymd(v.ended_at ?? new Date().toISOString())) - Date.parse(ymd(v.arrived_at))) / 86_400_000) + 1
  return v.presence.state === 'admitted' ? `Admitted · ${bed ?? 'no bed'} · day ${day}` : `Discharged ${shortDate(v.ended_at ?? v.presence.last_at)} · ${day} day${day > 1 ? 's' : ''}`
}
function Banner({ r, visit, mine, stay, onBack, actions, strip }: { r: RecordView; visit: VisitRow | null; mine: boolean; stay: string | null; onBack: () => void; actions: React.ReactNode; strip?: React.ReactNode }) {
  const v = r.latest_vitals ?? []; const pick = (c: string) => v.find((x) => x.code === c || x.code === `loinc:${c}`)   // values carry 'loinc:' codes
  const allergies = r.allergies.filter((a) => a.status === 'active')
  const vit = [pick('8480-6') && pick('8462-4') ? ['BP', `${pick('8480-6')!.value_number}/${pick('8462-4')!.value_number}`, pick('8480-6')!.flag] : null, pick('8867-4') ? ['P', pick('8867-4')!.value_number, pick('8867-4')!.flag] : null,
    pick('8310-5') ? ['T', pick('8310-5')!.value_number, pick('8310-5')!.flag] : null, pick('29463-7') ? ['Wt', pick('29463-7')!.value_number, null] : null, pick('59408-5') ? ['SpO₂', pick('59408-5')!.value_number, pick('59408-5')!.flag] : null].filter(Boolean) as [string, number | string, string | null][]
  return <div className="sticky top-0 z-sticky border-b border-line bg-surface/95 backdrop-blur">
    {strip}
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <button onClick={onBack} className="-ml-1 rounded-md p-1 text-faint hover:bg-hover hover:text-fg" title={stay ? 'Back to the beds' : 'Back to the queue'}><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2"><span className="text-18 font-semibold tracking-tight text-fg">{r.patient.given_name} {r.patient.family_name}</span><span className="text-14 text-muted tnum">{r.patient.age} y · {SEX[r.patient.sex] ?? ''}</span>{r.patient.died_on && <Badge tone="neutral">deceased</Badge>}</p>
        <p className="text-12 text-faint tnum">#{r.patient.record_number}{r.patient.phone_text && ` · ${r.patient.phone_text}`}{visit && (stay ? <> · <span className="text-accent">{stay}</span></>
          : <> · <span className={mine ? 'text-accent' : ''}>{visit.status.replace('_', ' ')}</span> · {visit.is_first ? 'new' : 'follow-up'}{visit.seen_at && ` · ${minutesSince(visit.seen_at)} min`}</>)}{visit?.priority && visit.priority !== 'routine' && <Badge tone="danger" className="ml-1.5">{visit.priority}</Badge>}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">{allergies.length ? allergies.map((a) => <Badge key={a.id} tone="danger">⚠ {a.substance_name}</Badge>) : r.allergy_review ? <span className="text-12 text-faint">No known allergies</span> : <span className="text-12 text-warn">Allergies not asked</span>}</div>
      {vit.length > 0 && <div className="flex items-baseline gap-3 text-12 text-faint tnum">{vit.map(([l, n, f]) => <span key={l}>{l} <b className={cn('font-semibold text-fg', f && f !== 'normal' && flagClass(f))}>{n}</b></span>)}</div>}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  </div>
}

function MenuItem({ children, hint, onSelect }: { children: React.ReactNode; hint?: string; onSelect: () => void }) {
  return <Menu.Item onSelect={onSelect} className="cursor-pointer rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-hover">{children}{hint && <span className="block text-11 text-faint">{hint}</span>}</Menu.Item>
}
