// The patient screen (spec/openCare.md §4.6, chart-plan.md): the clinic visit (/visit/:id), the ward stay (/visit/:id of a stay) and
// the record with no encounter (/patient/:id). The banner with Done or Sign always in reach; the encounter in the center — the
// composer, the drafts drawn as blocks, what was signed — and the record on the right, a stack of sections; under 640 px (a phone) the two are
// tabs. Whose visit it is: the queue row, else who-is-where (base.presence), else the patient of /patient/:id. A reader who may not
// read the record here gets the glance. Every kept behaviour of the old visit screen is in useChartActions and model/visit.ts.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useFacts } from '../../hooks/chart'
import { compose } from '../../hooks/composer'
import { useDraftsFor } from '../../hooks/drafts'
import { useDepartment } from '../../hooks/organization'
import { rememberPatient } from '../../hooks/recent'
import { useRecord, useVisitQueue } from '../../hooks/reads'
import { read } from '../../db/rpc'
import type { PresenceRow, TableRead } from '../../db/types'
import { Centered, SplitPane, Spinner, errorText } from '../../ui'
import { nextPatient } from '../clinic/words'
import type { ComposerHandle } from '../visit/Composer'
import { ChartBanner } from './ChartBanner'
import { DoneChoices } from './Actions'
import { EncounterPane } from './center/EncounterPane'
import { ChartContext, type Chart, type KindOrAll } from './context'
import { ChartGlance } from './glance/ChartGlance'
import { atOf, withAt, type At } from './model/at'
import { KINDS, isForMe } from './model/items'
import { cmdEnter, doneNext, roleOf } from './model/visit'
import { RecordPanel } from './panel/RecordPanel'
import { useChartActions } from './useChartActions'

const START: Record<string, string> = { KeyP: '/dx ', KeyM: '/rx ', KeyA: '/al ', p: '/dx ', m: '/rx ', a: '/al ' }
const kindOf = (v: string | null): KindOrAll => KINDS.includes(v as never) ? v as KindOrAll : 'all'

export function ChartScreen() {
  const { visitId = null, patientId: paramPatient } = useParams()
  const { dept, can, org } = useDepartment(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const queue = useVisitQueue(dept?.work === 'visits' ? dept.id : null)   // a ward has beds, not a queue
  const fromQueue = queue.data?.rows.find((r) => r.id === visitId)
  // a visit opened from elsewhere (the desk, the beds, a link): whose it is comes from who-is-where
  const where = useQuery({ queryKey: ['visit_patient', visitId, dept?.id], enabled: !!visitId && !paramPatient && !fromQueue && !!dept && !queue.isLoading,
    queryFn: async () => (await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept!.id, where: { item: visitId }, entries: false })).rows[0]?.patient_id ?? null })
  const patientId = paramPatient ?? fromQueue?.patient.id ?? where.data ?? null
  const reader = can('read:record')
  const rec = useRecord(reader ? patientId : null, dept?.id ?? null, visitId)
  const facts = useFacts(reader ? patientId : null)
  const drafts = useDraftsFor(patientId).length
  const composer = useRef<ComposerHandle>(null)
  const me = org?.me.id ?? ''; const visit = rec.data?.visit ?? null
  const role = roleOf(visit, dept?.id, me)
  useEffect(() => { if (rec.data) rememberPatient({ ...rec.data.patient }) }, [rec.data?.patient.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // the next patient by the list's own rule: my Back patient (or an unclaimed one) first, else the first waiting
  const next = useMemo(() => nextPatient((queue.data?.rows ?? []).filter((r) => r.id !== visitId), me), [queue.data, visitId, me])
  // what the center shows, the kind filter and the tab (under 640 px) live in the URL
  const at = atOf(params); const kind = kindOf(params.get('kind')); const tab = params.get('tab') === 'record' ? 'aside' : 'main'
  // each change starts from the address as it is now (two quick changes both count), and replaces it: Esc is the way back
  const set = useCallback((f: (q: URLSearchParams) => URLSearchParams) => setParams(() => f(new URLSearchParams(window.location.search)), { replace: true }), [setParams])
  const setTab = useCallback((t: 'main' | 'aside') => set((q) => { if (t === 'aside') q.set('tab', 'record'); else q.delete('tab'); return q }), [set])
  const actions = useChartActions({ r: rec.data, visit, role, patientId, visitId, next, composer, onHeld: () => setTab('main') })
  // what the record opens shows in the center, brought into view (under 640 px its tab comes forward)
  const open = useCallback((a: At) => { set((q) => { const n = withAt(q, a); n.delete('tab'); return n })
    requestAnimationFrame(() => { const el = document.getElementById('chart-scope'); if (!el) return
      const top = el.getBoundingClientRect().top; const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chart-top')) || 0
      if (top < head || top > innerHeight - 96) el.scrollIntoView({ block: 'start', inline: 'nearest' }) }) }, [set])
  const setKind = useCallback((k: KindOrAll) => set((q) => { if (k === 'all') q.delete('kind'); else q.set('kind', k); return q }), [set])
  const kinds = useRef<KindOrAll[]>(['all']); const showKinds = useCallback((ks: KindOrAll[]) => { kinds.current = ks }, [])
  // a notice (an error, warnings to confirm, the discharge chooser) is in the center: under 640 px its tab comes forward
  useEffect(() => { if (actions.err || actions.warn || actions.discharging) setTab('main') }, [actions.err, actions.warn, actions.discharging]) // eslint-disable-line react-hooks/exhaustive-deps
  // the keys, one listener (chart-plan.md §5.2): ⌘↵ Done (Sign in a stay; Sign N for someone else's patient) · / the composer ·
  // Alt+P/M/A start /dx /rx /al · Alt+R the record's sections and back · [ ] the kind filter · Esc back to this visit
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement; const typing = /INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable
      const alt = e.altKey && !e.metaKey && !e.ctrlKey
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const act = cmdEnter(role, drafts)
        if (act) { e.preventDefault(); if (act === 'sign') actions.sign(); else actions.done(!!dept && doneNext(dept)) }
      } else if (e.key === '/' && !typing) { e.preventDefault(); setTab('main'); composer.current?.slash() }
      else if (alt && e.code === 'KeyR') {
        e.preventDefault()
        if (el.closest?.('aside[aria-label="Record"]')) { setTab('main'); composer.current?.focus() }
        else { setTab('aside'); requestAnimationFrame(() => document.querySelector<HTMLElement>('#record-sections [tabindex="0"]')?.focus()) }
      } else if (alt && START[e.code || e.key.toLowerCase()]) { e.preventDefault(); setTab('main'); compose({ text: START[e.code || e.key.toLowerCase()] }) }
      else if ((e.key === '[' || e.key === ']') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const ks = kinds.current; const i = Math.max(0, ks.indexOf(kindOf(new URLSearchParams(window.location.search).get('kind'))))
        e.preventDefault(); setKind(ks[(i + (e.key === ']' ? 1 : -1) + ks.length) % ks.length])
      } else if (e.key === 'Escape' && !typing) {
        if (actions.more) actions.setMore(false); else if (at.scope !== 'encounter') open({ scope: 'encounter' })
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  if (!dept) return <Centered><Spinner /></Centered>
  if (!patientId && (queue.isLoading || where.isLoading)) return <Centered><Spinner label="Opening the visit" /></Centered>
  if (!patientId) return <Centered><p className="text-14 text-faint">This visit is not in your queue. <button type="button" className="rounded-sm text-accent hover:underline focus-ring" onClick={() => navigate('/')}>Back to the queue</button></p></Centered>
  if (!reader) return <ChartGlance patientId={patientId} page />
  if (rec.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (rec.error || !rec.data) return <Centered><p role="alert" className="text-14 text-danger">{rec.error ? errorText(rec.error) : 'No record'}</p></Centered>
  const chart: Chart = { r: rec.data, facts: facts.data, patientId, departmentId: dept.id, encounter: visit, mode: role.stay ? 'stay' : visit ? 'visit' : 'record', role, me, can,
    writer: can('write:note') || can('write:vitals') || can('write:order'), at, open, kind, setKind, showKinds, tab, setTab, actions }
  const review = rec.data.reviews.filter((x) => isForMe(x, me, dept.id)).length   // results waiting for my review
  return <ChartContext.Provider value={chart}><div className="pb-10">
    <ChartBanner next={next} assignee={fromQueue?.assignee_name ?? null} />
    <DoneChoices next={next} />
    <SplitPane className="mt-4" tab={tab} onTab={setTab} mainTab={<>Encounter{drafts > 0 && <span className="text-accent tnum">· {drafts}</span>}</>}
      asideTab={<>Record{review > 0 && <span className="text-warn tnum">· {review}</span>}</>}
      main={<EncounterPane composer={composer} />}
      aside={<RecordPanel r={rec.data} facts={facts.data} factsLoading={facts.isLoading} patientId={patientId} departmentId={dept.id} can={can} at={at} onOpen={open} onCompose={() => setTab('main')} />} />
  </div></ChartContext.Provider>
}
