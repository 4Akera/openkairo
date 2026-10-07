// The chart's writes (chart-plan.md §2 #3–14, moved from visit/VisitScreen.tsx as they were): the composer's line is added first
// (flush: a card that cannot be added holds the action and says why), the drafts become entries with or without the visit, and one
// set goes out — Sign (a stay's drafts into the stay; someone else's patient outside the visit), Done (+ seen, + done, then the next
// patient or the queue; Done closes now, Wait for results keeps the visit open while orders are out), back to the waiting room (the
// back arrow with my patient in consult), Discharge. Warnings come back as a card: Sign anyway resends with them confirmed. Opening a
// waiting patient of mine calls them once.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '../../hooks/organization'
import { refresh, useVisitActions } from '../../hooks/writes'
import { useDrafts } from '../../hooks/drafts'
import { useComposer } from '../../hooks/composer'
import { write, WriteWarned, type EntryIn, type Finding } from '../../db/rpc'
import { draftEntries, move, oneSet } from '../../db/entries'
import type { QueueRow, RecordView, VisitRow } from '../../db/types'
import type { EntryData } from '../../db/shapes.generated'
import { errorText } from '../../ui'
import type { ComposerHandle } from '../visit/Composer'
import { afterDone, backReason, callsOnOpen, visitMoves, type Role } from './model/visit'

export interface ChartActions {
  busy: boolean; err: string | null; warn: { findings: Finding[]; retry: (confirmed: string[]) => void } | null; clearWarn: () => void
  discharging: boolean; setDischarging: (on: boolean) => void
  /** Done: closes the visit now (wait false), or keeps it open while its orders are out (Wait for results) */
  sign: () => void; done: (andNext: boolean, wait: boolean) => void; backToWaiting: () => void
  discharge: (d: EntryData['discharged']['disposition']) => void; startVisit: () => void
}
interface Args { r: RecordView | undefined; visit: VisitRow | null; role: Role; patientId: string | null; visitId: string | null; next: QueueRow | null; composer: RefObject<ComposerHandle | null>
  /** an action waits (the line cannot be added, or a long note is open): bring the encounter forward, so the reason shows */
  onHeld?: () => void }

export function useChartActions({ r, visit, role, patientId, visitId, next, composer, onHeld }: Args): ChartActions {
  const { dept, org, can } = useDepartment(); const navigate = useNavigate(); const qc = useQueryClient(); const visits = useVisitActions()
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState<ChartActions['warn']>(null); const [discharging, setDischarging] = useState(false)
  // opening a waiting or back patient of mine from the queue calls them, once (calling is not seeing)
  const called = useRef<string | null>(null)
  useEffect(() => {
    if (visit && called.current !== visit.id && callsOnOpen(visit, role, can('write:called'), !!visitId)) { called.current = visit.id; visits.call.mutate({ visit }) }
  }, [visit?.id, visit?.presence.state]) // eslint-disable-line react-hooks/exhaustive-deps
  // another patient's chart starts clean: a warning card, an error or the discharge chooser belong to the one before
  // (reset while rendering, React's way to adjust state when a prop changes)
  const [of, setOf] = useState(patientId)
  if (of !== patientId) { setOf(patientId); setWarn(null); setErr(null); setDischarging(false) }
  const drafts = () => useDrafts.getState().byPatient[patientId ?? ''] ?? []
  /** the composer's line goes first; if it cannot be added (a warning to confirm, a field missing) the action waits and the card says
   *  why. An open long note is not signed until it is added: the action waits there too, and the note gets the focus */
  const flushed = () => {
    if (useComposer.getState().longNote) {
      onHeld?.(); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="The note"]')?.focus()); return false
    }
    const ok = composer.current ? composer.current.flush() : true
    if (!ok) { onHeld?.(); requestAnimationFrame(() => composer.current?.focus()) }
    return ok
  }
  /** the drafts as entries (a medication sent on is two), in the visit or outside any */
  const entries = (withVisit: boolean): EntryIn[] => drafts().flatMap((d) =>
    draftEntries(d, { patientId: patientId!, departmentId: dept!.id, visitId: withVisit && visit ? visit.id : null, record: r, org }))
  /** one set: landed → the drafts cleared; warnings → a card, and Sign anyway resends with them confirmed */
  async function send(es: EntryIn[], after: () => void, confirmed: string[] = []) {
    if (!es.length) { after(); return }
    setErr(null); setWarn(null); setBusy(true)
    try { await write(oneSet(es, { confirmed })); useDrafts.getState().clear(patientId!); refresh(qc); after() }
    catch (e) { if (e instanceof WriteWarned) setWarn({ findings: e.outcome.findings, retry: (c) => void send(es, after, [...confirmed, ...c]) }); else setErr(errorText(e)) }
    finally { setBusy(false) }
  }
  return {
    busy, err, warn, clearWarn: () => setWarn(null), discharging, setDischarging,
    /** the drafts alone, no move: into a stay while admitted (the patient stays open), else outside any visit */
    sign: () => { if (flushed() && patientId && dept) void send(entries(role.admitted), () => undefined) },
    done: (andNext, wait) => {
      if (!patientId || !visit || role.stay || !dept || !flushed()) return
      const es = entries(true); const go = afterDone(andNext, next)
      void send([...es, ...visitMoves(visit, dept.id, es.length, { type: 'done', data: { wait } })], () => navigate(go.to, { replace: go.replace }))
    },
    /** the back arrow with my patient in consult: they step out (an ECG, paying) and what is written is signed now, the visit staying
     *  open; with nothing written they are as they were before the call (model/visit.ts backReason) */
    backToWaiting: () => {
      if (!patientId || !visit || role.stay || !dept || !flushed()) return
      const es = entries(true)
      void send([...es, ...visitMoves(visit, dept.id, es.length, { type: 'back_to_waiting', data: { reason: backReason(es.length) } })], () => navigate('/'))
    },
    /** a stay ends from its own screen too: what is written goes with the discharge; the ward's beds come next */
    discharge: (disposition) => {
      if (!patientId || !visit || !role.admitted || !dept || !flushed()) return
      void send([...entries(true), move('discharged', visit, dept.id, { disposition })], () => navigate('/'))
    },
    startVisit: () => { if (patientId && dept) visits.open.mutate({ patient_id: patientId, department_id: dept.id }, { onSuccess: (v) => navigate(`/visit/${v.id}`), onError: (e) => setErr(errorText(e)) }) },
  }
}
