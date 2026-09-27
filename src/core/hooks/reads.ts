// Every screen's reads, through the one door out (spec/openCare.md §3.10). The server logs each; the rows come masked.
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { read } from '../db/rpc'
import type { Entry, Identity, ListRowData, OrderRow, Organization, PatientHit, PresenceRow, RecordView, RequestQueue, ReviewRow, ServerEntry, ServerRecord, TableRead, VisitQueue } from '../db/types'
import { banner, benchRow, cards, card, hit, mayIn, queueRows, recentRow, recordView, userName } from '../db/views'
import { ymd } from '../ui'
import { useDepartment } from './organization'
import { useLive } from './live'

const OPEN_STATES = ['waiting', 'called', 'with', 'pending', 'back']
const table = <R,>(t: string, departmentId: string, where: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  read<TableRead<R>>({ shape: 'table', table: t, department_id: departmentId, where, ...extra })

/** a patient opened anyway reads with purpose BTG for 12 hours (spec §4.3): the read log says so */
export const useOpened = create<{ until: Record<string, { at: number; reason: string }>; open: (patientId: string, reason: string) => void }>((set) => ({
  until: {}, open: (patientId, reason) => set((s) => ({ until: { ...s.until, [patientId]: { at: Date.now() + 12 * 3600_000, reason } } })),
}))
export const purposeFor = (patientId: string) => { const o = useOpened.getState().until[patientId]; return o && o.at > Date.now() ? { purpose: 'BTG', reason: o.reason } : { purpose: 'TREAT' } }

/** a clinic's queue: its open visits, the orders they wait for, who has allergies; done today. One query function, so every
 *  observer of the same key (the clinic's own line, the desk's counts) refetches it the same way. */
export const visitQueueFn = (org: Organization, departmentId: string, readAs: string) => async (): Promise<VisitQueue> => {
  const can = (action: string) => mayIn(org, action, readAs)   // the rights where the read is made, not wherever the screen stands
  const open = await table<PresenceRow>('base.presence', readAs, { department_id: departmentId, state: OPEN_STATES })
  const done = await table<PresenceRow>('base.presence', readAs, { department_id: departmentId, state: 'done', day: ymd(new Date().toISOString()) }, { entries: false })
  const visits = open.rows.map((r) => r.item)
  const orders = visits.length && can('read:bench') ? (await table<OrderRow>('base.orders', readAs, { visit_id: visits }, { entries: false })).rows : []
  const patients = [...new Set(open.rows.map((r) => r.patient_id))]
  const allergic = patients.length && can('read:record')
    ? new Set((await table<ListRowData>('base.lists', readAs, { patient_id: patients, list: 'allergies', status: 'active' }, { entries: false })).rows.map((r) => r.patient_id)) : new Set<string>()
  const history = new Map<string, number>()
  if (patients.length) for (const r of (await table<PresenceRow>('base.presence', readAs, { patient_id: patients, department_id: departmentId }, { entries: false })).rows)
    history.set(`${r.patient_id}|${r.department_id}`, (history.get(`${r.patient_id}|${r.department_id}`) ?? -1) + 1)
  const rows = queueRows(open, org, orders, allergic, history)
  return { rows, done_today: done.rows.length, away: rows.filter((r) => !r.present).length }
}
export function useVisitQueue(departmentId: string | null) {
  const { org, dept } = useDepartment()
  const readAs = dept?.id ?? departmentId
  useLive(org ? `organization:${org.organization.id}` : null, [['visit_queue'], ['request_queue']])
  return useQuery({
    queryKey: ['visit_queue', departmentId, readAs],
    enabled: !!departmentId && !!readAs && !!org,
    refetchInterval: 15_000,
    queryFn: visitQueueFn(org!, departmentId!, readAs!),
  })
}

/** a ward's stays: who is admitted, in which bed */
export function useStays(departmentId: string | null) {
  const { org } = useDepartment()
  useLive(org ? `organization:${org.organization.id}` : null, [['visit_queue']])
  return useQuery({
    queryKey: ['visit_queue', 'stays', departmentId],
    enabled: !!departmentId && !!org,
    refetchInterval: 30_000,
    queryFn: () => table<PresenceRow>('base.presence', departmentId!, { department_id: departmentId, state: 'admitted' }, { entries: false }),
  })
}

/** a bench's worklist: the orders sent to this department that are open, and the ones answered in the last day */
export function useRequestQueue(departmentId: string | null) {
  const { org } = useDepartment()
  const can = (action: string) => mayIn(org, action, departmentId)   // the rights in the department read, whatever the screen's own
  useLive(org ? `organization:${org.organization.id}` : null, [['request_queue']])
  return useQuery({
    queryKey: ['request_queue', departmentId],
    enabled: !!departmentId && !!org,
    refetchInterval: 15_000,
    queryFn: async (): Promise<RequestQueue> => {
      const open = await table<OrderRow>('base.orders', departmentId!, { to_department_id: departmentId, status: ['active', 'in-progress', 'on-hold'] })
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const recent = await table<OrderRow>('base.orders', departmentId!, { to_department_id: departmentId, answered_at: { op: '>=', value: since } })
      // what a pharmacy gives: the medication each order is about (the pack's own table)
      const details = new Map<string, Record<string, unknown>>()
      if (can('read:pharmacy.queue')) for (const r of (await table<Record<string, unknown>>('pharmacy.queue', departmentId!, { department_id: departmentId }, { entries: false })).rows) details.set(String(r.item), r)
      const here = new Map<string, boolean>()
      const pts = [...new Set(open.rows.map((r) => r.patient_id))]
      if (pts.length && can('read:queue')) for (const p of (await table<PresenceRow>('base.presence', departmentId!, { patient_id: pts, state: OPEN_STATES }, { entries: false })).rows) here.set(p.patient_id, p.here || here.get(p.patient_id) === true)
      const requests = open.rows.map((x) => { const r = benchRow(x, open, org, here.get(x.patient_id)); const d = details.get(x.item); return d ? { ...r, details: { drug: { name: d.drug }, dose: d.dose, frequency: d.timing, duration_days: d.duration_days, quantity: d.quantity, medication_item: d.medication_item } } : r })
      const answered = recent.rows.filter((x) => x.status === 'completed' || x.status === 'rejected' || x.status === 'cancelled')
      return { requests, recent: answered.map((x) => recentRow(x, recent, org)), done_today: answered.length }
    },
  })
}

/** my results to review (for me, or for my department): critical first */
export function useToReview(departmentId: string | null = null, enabled = true) {
  const { org, dept } = useDepartment()
  const at = departmentId ?? dept?.id ?? null
  return useQuery({
    queryKey: ['to_review', at, org?.me.id], enabled: enabled && !!at && !!org, refetchInterval: 30_000,
    queryFn: async () => {
      const mine = await table<ReviewRow>('base.review', at!, { for_user: org!.me.id })
      return mine.rows.sort((a, b) => Number(b.critical) - Number(a.critical) || b.at.localeCompare(a.at)).map((r) => {
        const e = mine.entries[r.entry_id]; const c = card(e, org); const p = banner(mine.patients[r.patient_id])
        return { ...c, patient_id: r.patient_id, patient: { given_name: p.given_name, family_name: p.family_name }, review: r,
          request: { ...(c.request ?? { step: '', status: 'done' as const, status_reason: null, to_department_id: '', to_department_name: null, priority: 'routine' as const, due_at: r.at, reply_line: null, replied_at: null, review_needed_at: null }),
            reply_line: e.line, reply_flag: c.flag, review_needed_at: r.at, review_reason: r.why } }
      })
    },
  })
}

/** the record: identity, lists, visits, orders, values, a page of entries, and where private items are. One read per patient and
 *  department: the view for a visit is built in select (chart-plan §3.3), so the banner, the center and the record panel share it */
export function useRecord(patientId: string | null, departmentId: string | null, visitId?: string | null) {
  const { org } = useDepartment()
  useLive(patientId ? `record:${patientId}` : null, [['record', patientId]])
  // stable while its inputs are, so the view is not rebuilt on every render
  const select = useCallback((r: ServerRecord): RecordView => recordView(r, org, departmentId!, visitId), [org, departmentId, visitId])
  return useQuery({
    queryKey: ['record', patientId, departmentId],
    enabled: !!patientId && !!departmentId && !!org,
    queryFn: () => read<ServerRecord>({ shape: 'record', patient_id: patientId, department_id: departmentId, limit: 100, ...purposeFor(patientId!) }),
    select,
  })
}

/** find a patient by name, phone, record number or identifier; where each is now */
export function usePatientSearch(_organizationId: string | null, q: string) {
  const { org, dept } = useDepartment()
  const term = q.trim()
  return useQuery({
    queryKey: ['patients', term, dept?.id],
    enabled: !!org && (term.length >= 2 || /^\d+$/.test(term)),
    placeholderData: (p) => p, staleTime: 10_000,
    queryFn: async (): Promise<PatientHit[]> => {
      const r = await read<{ patients: Identity[]; tables: { 'base.presence'?: TableRead<PresenceRow> } }>({ shape: 'patients', q: term, department_id: dept?.id ?? null,
        include: { 'base.presence': { state: OPEN_STATES } } })
      const presence = r.tables['base.presence']?.rows ?? []
      return r.patients.map((i) => hit(i, presence, org))
    },
  })
}

/** one entry in full: every version of its item, and the entries that answer it, change it or are about it */
export function useEntry(entryId: string | null) {
  const { org, dept } = useDepartment()
  return useQuery({
    queryKey: ['record', 'entry', entryId, dept?.id],
    enabled: !!entryId && !!dept && !!org,
    queryFn: async (): Promise<Entry> => {
      const r = await read<{ entries: ServerEntry[] }>({ shape: 'item', item: entryId, department_id: dept!.id })
      const first = r.entries.find((e) => e.id === entryId) ?? r.entries[0]
      const versions = r.entries.filter((e) => e.item === first.item).sort((a, b) => a.item_version - b.item_version)
      const latest = versions[versions.length - 1]
      const related = r.entries.filter((e) => e.item !== first.item)
      const vc = cards(versions, org)
      const c = card(latest, org)
      return { ...c, data: latest.data ?? {}, patient_id: latest.patient_id, patient: null, replaced_by_id: null, is_note: latest.type === 'note',
        can_mark_private: ['note', 'result'].includes(latest.type), is_private: undefined,
        replies: related.filter((e) => e.relation === 'answers' && e.type !== 'step').map((e) => ({ ...card(e, org), data: e.data ?? {} })),
        steps: related.filter((e) => e.type === 'step' || e.type.endsWith('dispense')).map((e, i) => ({ step: String(e.data?.step ?? e.data?.status ?? e.type), recorded_at: e.recorded_at, reason: (e.data?.reason as string) ?? null, position: i })),
        files: ((latest.data?.attachments as { name?: string; mime: string }[] | undefined) ?? []).map((a, i) => ({ position: i + 1, name: a.name ?? 'file', mime: a.mime })),
        versions: vc.filter((x) => x.id !== latest.id), related: related.map((e) => card(e, org)), author_name: userName(org, latest.author_id) }
    },
  })
}
