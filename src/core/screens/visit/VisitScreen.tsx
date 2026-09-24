import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Lock } from 'lucide-react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { useDepartment } from '../../hooks/organization'
import { useRecord, useVisitQueue } from '../../hooks/reads'
import { useVisitActions, useWriteSet } from '../../hooks/writes'
import { useDrafts, useDraftsFor } from '../../hooks/drafts'
import { compose } from '../../hooks/composer'
import { rememberPatient } from '../../hooks/recent'
import type { RecordView, VisitRow } from '../../db/types'
import { Badge, Button, Centered, Kbd, Spinner, cn, errorText, flagClass, minutesSince } from '../../ui'
import { RecordViews } from './Record'
import { Side } from './Side'
import { Composer, type ComposerHandle } from './Composer'

/** The visit (spec 05), built for typing: banner with Done always in reach, the lists on the left, the composer on the right. */
export function VisitScreen() {
  const { visitId, patientId: paramPatient } = useParams()
  const { dept, can, org } = useDepartment()
  const navigate = useNavigate()
  const queue = useVisitQueue(dept?.id ?? null)
  const fromQueue = queue.data?.rows.find((r) => r.id === visitId)
  const patientId = paramPatient ?? fromQueue?.patient.id ?? null
  const rec = useRecord(patientId, dept?.id ?? null)
  const visits = useVisitActions()
  const ws = useWriteSet(dept?.id ?? null, patientId)
  const drafts = useDraftsFor(patientId)
  const [err, setErr] = useState<string | null>(null)
  const today = useRef<ComposerHandle>(null)
  const visit = rec.data?.visit ?? null
  const mine = !!visit && visit.department_id === dept?.id
  useEffect(() => { if (rec.data) rememberPatient({ ...rec.data.patient }) }, [rec.data?.patient.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // opening a waiting/pending patient from the queue starts the consult (nurses hold mark:in_consult too)
  const started = useRef<string | null>(null)
  useEffect(() => { if (visit && mine && (visit.status === 'waiting' || visit.status === 'pending') && can('mark:in_consult') && visitId && started.current !== visit.id) { started.current = visit.id; visits.move.mutate({ visit_id: visit.id, from_status: visit.status, status: 'in_consult' }) } }, [visit?.id, visit?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => queue.data?.rows.find((r) => r.id !== visitId && (r.band === 'back' || r.band === 'waiting')) ?? null, [queue.data, visitId])
  // what is signed: the drafts as they are now (the composer may have just added its line)
  const items = (withVisit: boolean) => (useDrafts.getState().byPatient[patientId ?? ''] ?? []).map((d) => ({ function: d.function, params: { ...d.params, id: d.id, patient_id: patientId, department_id: dept!.id, ...(withVisit && visit ? { visit_id: visit.id } : {}) } }))
  /** the composer's line goes with Done; if it cannot be added (a warning to confirm, a field missing) Done waits and the card says why */
  const flushed = () => today.current ? today.current.flush() : true
  async function sign() {
    if (!flushed()) return
    if (!patientId || !items(false).length) return; setErr(null)
    try { await ws.mutateAsync(items(false)); useDrafts.getState().clear(patientId) } catch (e) { setErr(errorText(e)) }
  }
  async function done(andNext: boolean, wait?: boolean) {
    if (!patientId || !visit || !flushed()) return; setErr(null)
    try {
      const set = items(true)
      if (set.length) await ws.mutateAsync(set)
      useDrafts.getState().clear(patientId)
      await visits.move.mutateAsync({ visit_id: visit.id, from_status: visit.status, status: 'done', wait })
      navigate(andNext && next ? `/visit/${next.id}` : '/', { replace: andNext && !!next })
    } catch (e) { setErr(errorText(e)) }
  }
  /** the patient steps out (an ECG, paying): what is written is signed now, so nothing waits in this browser; the visit stays open */
  async function backToWaiting() {
    if (!patientId || !visit || !flushed()) return; setErr(null)
    try {
      const set = items(true)
      if (set.length) await ws.mutateAsync(set)
      useDrafts.getState().clear(patientId)
      await visits.move.mutateAsync({ visit_id: visit.id, from_status: visit.status, status: 'waiting' })
      navigate('/')
    } catch (e) { setErr(errorText(e)) }
  }
  // the keyboard: / the composer · Alt+P/M/A start a problem, medication, allergy in it · ⌘↵ Done
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && visit?.status === 'in_consult' && mine) { e.preventDefault(); void done(dept?.after_done !== 'queue') }
      else if (e.key === '/' && !typing) { e.preventDefault(); today.current?.slash() }
      else if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const line = ({ KeyP: '/dx ', KeyM: '/rx ', KeyA: '/al ', p: '/dx ', m: '/rx ', a: '/al ' } as Record<string, string>)[e.code || e.key.toLowerCase()]
        if (line) { e.preventDefault(); compose({ text: line }) }
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  if (!dept) return <Centered><Spinner /></Centered>
  if (!patientId && queue.isLoading) return <Centered><Spinner label="Opening the visit" /></Centered>
  if (!patientId) return <Centered><p className="text-sm text-neutral-500">This visit is not in your queue. <button className="text-teal-800" onClick={() => navigate('/')}>Back to the queue</button></p></Centered>
  if (rec.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (rec.error || !rec.data) return <Centered><p className="text-sm text-red-700">{rec.error?.message ?? 'no record'}</p></Centered>
  const r = rec.data
  const busy = ws.isPending || visits.move.isPending
  const canWrite = can('write:note') || can('write:vitals') || can('write:request')
  return <div className="pb-10">
    <Banner r={r} visit={visit} mine={mine} onBack={() => navigate('/')}
      actions={mine && visit?.status === 'in_consult' ? <>
        <Button onClick={() => done(dept.after_done !== 'queue')} disabled={busy}>{drafts.length ? `Sign ${drafts.length} · ` : ''}Done{dept.after_done !== 'queue' && next ? ` → ${next.patient.given_name}` : ''}<Kbd className="ml-1 border-white/40">⌘↵</Kbd></Button>
        <Menu.Root><Menu.Trigger asChild><Button variant="outline" size="md" aria-label="More"><ChevronDown className="h-4 w-4" /></Button></Menu.Trigger>
          <Menu.Portal><Menu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg">
            {dept.patients_wait
              ? <MenuItem onSelect={() => done(dept.after_done !== 'queue', false)} hint="The visit closes now; results go to your review list">Done — patient goes home</MenuItem>
              : <MenuItem onSelect={() => done(dept.after_done !== 'queue', true)} hint="The patient comes back when the results are in">Done — patient waits for results</MenuItem>}
            {dept.after_done === 'queue' ? next && <MenuItem onSelect={() => done(true)}>Done → next patient ({next.patient.given_name})</MenuItem> : <MenuItem onSelect={() => done(false)}>Done, back to the queue</MenuItem>}
            <MenuItem onSelect={() => void backToWaiting()} hint={drafts.length ? `Signs the ${drafts.length} written so far; the visit stays open` : 'The visit stays open; call the patient in again later'}>Return to waiting</MenuItem>
            <Menu.Separator className="my-1 h-px bg-neutral-100" />
            <MenuItem onSelect={() => visits.private.mutate({ visit_id: visit.id, is_private: !visit.is_private })} hint={visit.is_private ? 'Its notes become readable to every clinician' : 'Its notes show as "Private note" outside this department'}>{visit.is_private ? 'Make this visit not private' : 'Make this visit private'}</MenuItem>
          </Menu.Content></Menu.Portal></Menu.Root></>
        : <>{!mine && drafts.length > 0 && <Button onClick={sign} disabled={busy}>Sign {drafts.length}</Button>}
            {!visit && dept.is_visited && can('write:visit') && <Button variant="outline" onClick={() => visits.open.mutate({ patient_id: patientId, department_id: dept.id }, { onSuccess: (v) => navigate(`/visit/${v.id}`) })}>Start visit</Button>}</>} />
    {err && <p className="mx-auto mt-3 max-w-7xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200" role="alert">{err}</p>}
    <div className="mx-auto mt-4 grid max-w-7xl gap-4 px-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* the lists stay in view while the record scrolls */}
      <div className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:self-start lg:overflow-y-auto">
        <Side r={r} patientId={patientId} can={can} />
      </div>
      <div className="grid content-start gap-4">
        {canWrite && <Composer key={patientId} ref={today} r={r} patientId={patientId} departmentId={dept.id} can={can} />}
        <RecordViews r={r} patientId={patientId} departmentId={dept.id} view={org?.organization.record_view ?? 'visits'} />
      </div>
    </div>
  </div>
}

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
function Banner({ r, visit, mine, onBack, actions }: { r: RecordView; visit: VisitRow | null; mine: boolean; onBack: () => void; actions: React.ReactNode }) {
  const v = r.latest_vitals ?? []; const pick = (c: string) => v.find((x) => x.code === c || x.code === `loinc:${c}`)   // values carry 'loinc:' codes
  const allergies = r.allergies.filter((a) => a.status === 'active')
  const vit = [pick('8480-6') && pick('8462-4') ? ['BP', `${pick('8480-6')!.value_number}/${pick('8462-4')!.value_number}`, pick('8480-6')!.flag] : null, pick('8867-4') ? ['P', pick('8867-4')!.value_number, pick('8867-4')!.flag] : null,
    pick('8310-5') ? ['T', pick('8310-5')!.value_number, pick('8310-5')!.flag] : null, pick('29463-7') ? ['Wt', pick('29463-7')!.value_number, null] : null, pick('59408-5') ? ['SpO₂', pick('59408-5')!.value_number, pick('59408-5')!.flag] : null].filter(Boolean) as [string, number | string, string | null][]
  return <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <button onClick={onBack} className="-ml-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title="Back to the queue"><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2"><span className="text-lg font-semibold tracking-tight text-neutral-900">{r.patient.given_name} {r.patient.family_name}</span><span className="text-sm text-neutral-600 tnum">{r.patient.age} y · {SEX[r.patient.sex] ?? ''}</span>{r.patient.died_on && <Badge tone="neutral">deceased</Badge>}</p>
        <p className="text-xs text-neutral-500 tnum">#{r.patient.record_number}{r.patient.phone_text && ` · ${r.patient.phone_text}`}{visit && <> · <span className={mine ? 'text-teal-800' : ''}>{visit.status.replace('_', ' ')}</span> · {visit.is_first ? 'new' : 'follow-up'}{visit.seen_at && ` · ${minutesSince(visit.seen_at)} min`}</>}{visit?.priority && visit.priority !== 'routine' && <Badge tone="red" className="ml-1.5">{visit.priority}</Badge>}{visit?.is_private && <Badge className="ml-1.5"><Lock className="mr-1 h-3 w-3" />private visit</Badge>}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">{allergies.length ? allergies.map((a) => <Badge key={a.id} tone="red">⚠ {a.substance_name}</Badge>) : r.allergy_review ? <span className="text-xs text-neutral-500">No known allergies</span> : <span className="text-xs text-amber-700">Allergies not asked</span>}</div>
      {vit.length > 0 && <div className="flex items-baseline gap-3 text-xs text-neutral-500 tnum">{vit.map(([l, n, f]) => <span key={l}>{l} <b className={cn('font-semibold text-neutral-800', f && f !== 'normal' && flagClass(f))}>{n}</b></span>)}</div>}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  </div>
}

function MenuItem({ children, hint, onSelect }: { children: React.ReactNode; hint?: string; onSelect: () => void }) {
  return <Menu.Item onSelect={onSelect} className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100">{children}{hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}</Menu.Item>
}
