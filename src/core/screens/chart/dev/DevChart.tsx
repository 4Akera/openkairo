// /dev/chart/:patientId, mounted only in development (import.meta.env.DEV; build plan 3.4): the chart's parts on real reads while they
// are built, before the switch (3.10) puts them on the patient screen. Here: the record's first page as signed sets through the blocks,
// with the facts (alerts, procedures, observations, cross-outs) and the private-notes notice. The record panel joins at 3.7, the
// center at 3.9; the route goes at 3.10.
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useFacts } from '../../../hooks/chart'
import { useDepartment } from '../../../hooks/organization'
import { useRecord } from '../../../hooks/reads'
import { Centered, Empty, PageHead, Spinner, errorText } from '../../../ui'
import { SetCard } from '../blocks'
import { PrivateNotes } from '../blocks/Privacy'
import { BlockContext, type BlockEnv } from '../blocks/env'
import { bySet, listPool } from '../model/encounter'
import { itemsOf } from '../model/items'
import { nameOf } from '../../../db/views'

export function DevChart() {
  const { patientId = null } = useParams(); const { org, dept, can } = useDepartment()
  const r = useRecord(patientId, dept?.id ?? null); const facts = useFacts(patientId)
  const s = r.data?.server
  const sets = useMemo(() => !s || !org || !dept ? [] : bySet(itemsOf([...s.entries, ...(facts.data ?? []).filter((e) => !s.entries.some((x) => x.id === e.id))], {
    types: org.types, services: org.services, me: org.me.id, departmentId: dept.id, orders: s.tables['base.orders'], reviews: s.tables['base.review']?.rows,
    pool: listPool(s) }), [], org.types), [s, facts.data, org, dept])
  const env = useMemo<BlockEnv>(() => ({ org, me: org?.me.id, departmentId: dept?.id, can, tables: s?.tables,
    onOpen: (id) => document.getElementById(`entry-${id}`)?.focus() }), [org, dept, s, can])
  if (!dept) return <Centered><p className="text-14 text-muted">Choose a department first.</p></Centered>
  if (r.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (r.error) return <Centered><p role="alert" className="text-14 text-danger">{errorText(r.error)}</p></Centered>
  const hidden = (s?.hidden ?? []).filter((h) => h.items > 0).map((h) => ({ ...h, department: nameOf(org, h.department_id) ?? '' }))
  return <div className="mx-auto grid max-w-chart gap-3 p-4">
    <PageHead title={`Dev chart · ${r.data?.identity.full_name ?? ''}`} hint="Development only: the record's first page drawn through the chart's blocks, on real reads." />
    <BlockContext.Provider value={env}>
      {patientId && <PrivateNotes hidden={hidden} patientId={patientId} />}
      {sets.length ? sets.map((x) => <SetCard key={x.set_id} set={x} />) : <Empty>Nothing in the record yet.</Empty>}
    </BlockContext.Provider>
  </div>
}
