// /dev/chart/:patientId, mounted only in development (import.meta.env.DEV; build plan 3.4): the chart's parts on real reads while they
// are built, before the switch (3.10) puts them on the patient screen. Here, in the chart's own frame (SplitPane): the composer on top
// (as in the chart), the record panel beside it (3.7–3.8), and a stand-in center that draws what the panel opens — a visit, the
// entries outside one, an entry — through the blocks; the center proper is 3.9's, and the route goes at 3.10. The keys the chart
// will have: / the composer, Alt+P/M/A start /dx /rx /al, Alt+R to the record's sections and back, Esc back to the encounter.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useEntryPage, useFacts, useItem } from '../../../hooks/chart'
import { compose } from '../../../hooks/composer'
import { useDepartment } from '../../../hooks/organization'
import { useRecord } from '../../../hooks/reads'
import type { RecordView, ServerEntry } from '../../../db/types'
import { Button, Centered, Empty, Heading, PageHead, SplitPane, Spinner, errorText } from '../../../ui'
import { Composer, type ComposerHandle } from '../../visit/Composer'
import { SetCard } from '../blocks'
import { BlockContext, type BlockEnv } from '../blocks/env'
import { atOf, withAt, type At } from '../model/at'
import { bySet, encounterItems, listPool, movesOf, outsideOf } from '../model/encounter'
import { baseOf, itemsOf, type ItemCtx } from '../model/items'
import { RecordPanel } from '../panel/RecordPanel'

const START: Record<string, string> = { KeyP: '/dx ', KeyM: '/rx ', KeyA: '/al ' }

export function DevChart() {
  const { patientId = null } = useParams(); const { org, dept, can } = useDepartment()
  const [params, setParams] = useSearchParams(); const at = atOf(params)
  const [tab, setTab] = useState<'main' | 'aside'>('main'); const composer = useRef<ComposerHandle>(null)
  const open = useCallback((a: At) => { setParams((q) => withAt(q, a)); setTab('main') }, [setParams])
  const r = useRecord(patientId, dept?.id ?? null); const facts = useFacts(patientId)
  const s = r.data?.server
  const env = useMemo<BlockEnv>(() => ({ org, me: org?.me.id, departmentId: dept?.id, can, tables: s?.tables, startOpen: at.scope === 'entry' ? [at.id] : undefined,
    onOpen: (id) => open({ scope: 'entry', id }) }), [org, dept, s, can, at, open])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement; const typing = /INPUT|TEXTAREA|SELECT/.test(el.tagName)
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyR') {
        e.preventDefault()
        if (el.closest?.('aside[aria-label="Record"]')) { setTab('main'); composer.current?.focus() }
        else { setTab('aside'); requestAnimationFrame(() => document.querySelector<HTMLElement>('#record-sections [tabindex="0"]')?.focus()) }
      } else if (e.altKey && !e.metaKey && !e.ctrlKey && START[e.code]) { e.preventDefault(); setTab('main'); compose({ text: START[e.code] }) }
      else if (e.key === '/' && !typing) { e.preventDefault(); composer.current?.slash() }
      else if (e.key === 'Escape' && !typing && at.scope !== 'encounter') open({ scope: 'encounter' })
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  if (!dept) return <Centered><p className="text-14 text-muted">Choose a department first.</p></Centered>
  if (r.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (r.error || !r.data || !patientId) return <Centered><p role="alert" className="text-14 text-danger">{r.error ? errorText(r.error) : 'No record'}</p></Centered>
  const canWrite = can('write:note') || can('write:vitals') || can('write:order')
  return <div className="py-4">
    <div className="mx-auto max-w-chart px-4"><PageHead title={`Dev chart · ${r.data.identity.full_name}`} hint="Development only: the composer, the record panel and a stand-in center, on real reads." /></div>
    <BlockContext.Provider value={env}>
      <SplitPane tab={tab} onTab={setTab} mainTab="Encounter" asideTab="Record"
        main={<div className="grid content-start gap-3">
          {canWrite && <Composer key={patientId} ref={composer} r={r.data} patientId={patientId} departmentId={dept.id} can={can} />}
          <Center at={at} r={r.data} facts={facts.data ?? []} patientId={patientId} onOpen={open} />
        </div>}
        aside={<RecordPanel r={r.data} facts={facts.data} factsLoading={facts.isLoading} patientId={patientId} departmentId={dept.id} can={can} at={at} onOpen={open} onCompose={() => setTab('main')} />} />
    </BlockContext.Provider>
  </div>
}

const TITLE: Record<At['scope'], string> = { encounter: "The record's first page", visit: 'A visit', outside: 'Outside a visit', entry: 'An entry',
  record: 'Whole record (the center draws it at 3.9; here the first page)', results: 'Results over time (the center draws it at 3.9; here the first page)' }
/** the stand-in center: what the panel opened, as signed sets through the blocks */
function Center({ at, r, facts, patientId, onOpen }: { at: At; r: RecordView; facts: ServerEntry[]; patientId: string; onOpen: (a: At) => void }) {
  const { org, dept } = useDepartment(); const s = r.server; const types = org?.types
  const page = useEntryPage(at.scope === 'visit' ? { patient_id: patientId, visits: [at.id], limit: 500 } : null)
  const item = useItem(at.scope === 'entry' ? at.id : null, patientId)
  const sets = useMemo(() => {
    const ctx: ItemCtx = { types, services: org?.services, me: org?.me.id, departmentId: dept?.id, orders: s.tables['base.orders'], reviews: s.tables['base.review']?.rows,
      pool: [...listPool(s), ...facts.filter((e) => baseOf(e.type, types) === 'crossed_out')] }
    if (at.scope === 'visit') return page.data ? bySet(encounterItems(page.data.entries, s, at.id, ctx), movesOf(s, at.id), types) : null
    if (at.scope === 'outside') return bySet(itemsOf(outsideOf(s.entries, s, types), ctx), [], types)
    if (at.scope === 'entry') { const first = item.data?.find((e) => e.id === at.id)
      return item.data ? bySet(itemsOf(item.data.filter((e) => e.item === first?.item), { ...ctx, pool: [...(ctx.pool ?? []), ...item.data] }), [], types) : null }
    return bySet(itemsOf([...s.entries, ...facts.filter((e) => !s.entries.some((x) => x.id === e.id))], ctx), [], types)
  }, [at, s, facts, page.data, item.data, org, dept, types])
  return <section aria-label="Center" className="grid content-start gap-3">
    <Heading right={at.scope !== 'encounter' && <Button size="xs" variant="ghost" onClick={() => onOpen({ scope: 'encounter' })}>Back · Esc</Button>}>{TITLE[at.scope]}</Heading>
    {!sets ? <Spinner /> : sets.length ? sets.map((x) => <SetCard key={x.set_id} set={x} />) : <Empty>Nothing here yet.</Empty>}
    {at.scope === 'outside' && <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => onOpen({ scope: 'record' })}>Earlier → Whole record</Button>}
  </section>
}
