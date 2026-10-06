// Dispensing (pharmacy.dispensing, spec/openCare.md §5.1 rule 4): the pharmacy's one screen for the work sent to it, in place of the
// bench, in the kit's frame. It lists every request sent here, as the bench did, so nothing sent to the department is on no screen.
// Its views are counted filters: To give (nobody has started), Prepared (counted out, not given yet), Given today. A row is one
// patient: Prepared takes each order to its service's next step; Give all writes every order the pack's form can give as it stands,
// in one set; a request the pack does not answer (a result, a note) goes to the bench's patient page (Answer). Keys as on the bench:
// / or typing goes to the box, ↑↓ move, ↵ folds the row out under itself with each order's form (given, or not and why) and Give,
// Esc folds it, then clears the box.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { answerEntry, oneSet, stepEntry } from '@core/db/entries'
import { write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow } from '@core/db/types'
import { replyFormFor } from '@core/renderers'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex, groupByPatient, matches, nextSteps, phaseOf, stepName, testsLine, type PatientGroup } from '@core/screens/bench/shared'
import { Button, Callout, Card, Empty, Input, ListRow, NotForRole, ScreenFrame, Spinner, Tag, errorText, hm, minutesSince, type ScreenView } from '@core/ui'

type View = 'give' | 'prepared' | 'done'

export function Dispensing({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const navigate = useNavigate(); const { org, can } = useDepartment()
  const [view, setView] = useState<View>('give'); const [find, setFind] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({}); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0); const [arrows, setArrows] = useState(false)    // arrows: the keys moved the cursor (shown as a bar)
  const box = useRef<HTMLInputElement>(null); const list = useRef<HTMLUListElement>(null)
  const f = find.trim().toLowerCase()
  // every request sent here, the bench's whole work: the pack's form answers its own, the bench's page the rest
  const rows = q.data?.requests ?? []
  const give = groupByPatient(rows.filter((r) => phaseOf(r.request?.step) === 'todo')).filter((g) => matches(g.patient, f))
  const prepared = groupByPatient(rows.filter((r) => phaseOf(r.request?.step) === 'doing')).filter((g) => matches(g.patient, f))
  const done = (q.data?.recent ?? []).filter((r) => matches(r.patient, f))
  const views: ScreenView<View>[] = [{ id: 'give', label: 'To give', count: give.length, needs: 'warn' }, { id: 'prepared', label: 'Prepared', count: prepared.length },
    { id: 'done', label: 'Given today', count: done.length }]
  const groups = view === 'give' ? give : view === 'prepared' ? prepared : []
  const n = view === 'done' ? done.length : groups.length
  const c = Math.min(cursor, Math.max(0, n - 1))

  // one set for the patient; the row closes and the lists are read again
  const land = async (patient: string, items: EntryIn[]) => {
    if (!items.length) return
    setBusy(patient); setError(null)
    try { await write(oneSet(items)); setOpen(null); setValues({}); refresh(qc) } catch (x) { setError(errorText(x)) } finally { setBusy(null) }
  }
  const formOf = (r: RequestQueueRow) => { const pf = replyFormFor(r.reply_type); return pf && can(pf.action) ? pf : undefined }
  /** each order its form gives as it stands (value undefined: as prescribed), or as filled in the fold */
  const answers = (g: PatientGroup, filled: boolean) => g.rows.flatMap((r) => { const w = formOf(r)?.toWrite(r, filled ? values[r.order.item] : undefined); return w ? [answerEntry(r, dept.id, w)] : [] })
  const toggle = (pid: string) => { setOpen(open === pid ? null : pid); setError(null) }
  const pick = (v: View) => { setView(v); setOpen(null); setCursor(0); box.current?.focus() }
  // ↵ folds out the row under the cursor; with a search typed, the first match in either list
  const enter = () => {
    const g = groups[c] ?? (f ? [...give, ...prepared][0] : undefined); if (!g) return
    if (!groups.includes(g)) setView(give.includes(g) ? 'give' : 'prepared')
    toggle(g.patient.id)
  }
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setArrows(true); setCursor(Math.max(0, Math.min(c + 1, n - 1))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setArrows(true); setCursor(Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); enter() }
    else if (e.key === 'Escape') { if (open) setOpen(null); else { setFind(''); setCursor(0) } }
  }
  // typing anywhere goes to the box; / jumps there; ↑↓ ↵ Esc work with nothing focused
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); box.current?.focus() }
      else if (e.key.length === 1 && e.key !== ' ') box.current?.focus()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape' || (e.key === 'Enter' && t === document.body)) onKey(e)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => { list.current?.querySelector('.dispense-cursor')?.scrollIntoView({ block: 'nearest' }) }, [c, view])

  const row = (g: PatientGroup, i: number) => {
    const isOpen = open === g.patient.id; const quick = answers(g, false)
    const steps = view === 'give' ? nextSteps(g.rows, org, can) : []
    const others = g.rows.filter((r) => !replyFormFor(r.reply_type))    // answered with a result or a note, on the bench's page
    const answer = others.length > 0 && <Button size="sm" variant="outline" onClick={() => navigate(`/bench/${g.patient.id}`)}>Answer{others.length > 1 ? ` ${others.length}` : ''}</Button>
    return [<ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)}
      selected={isOpen || (i === c && arrows)} enter={i === c && !arrows && !!f} className={i === c ? 'dispense-cursor' : undefined}
      status={<>{g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}<span className="truncate">{testsLine(g.rows)}</span></>}
      minutes={g.since ? minutesSince(g.since) : null} onOpen={() => toggle(g.patient.id)}
      actions={<>{steps.map((s) => <Button key={`${s.type} ${s.key}`} size="sm" variant="outline" disabled={busy === g.patient.id}
          onClick={() => void land(g.patient.id, s.rows.map((r) => stepEntry(r, dept.id, 'in-progress', undefined, s.key, s.type)))}>{stepName(s.key)}{s.rows.length > 1 ? ` ${s.rows.length}` : ''}</Button>)}
        {answer}
        {quick.length > 0 && <Button size="sm" loading={busy === g.patient.id && !isOpen} onClick={() => void land(g.patient.id, quick)}>Give all{quick.length > 1 ? ` ${quick.length}` : ''}</Button>}</>} />,
      isOpen && <li key={`${g.patient.id} fold`} className="grid gap-3 border-t border-line bg-sunken p-3">
        {g.rows.filter((r) => replyFormFor(r.reply_type)).map((r) => { const F = formOf(r)?.Editor
          return F ? <F key={r.order.item} request={r} value={values[r.order.item] as never} onChange={(v: unknown) => setValues((x) => ({ ...x, [r.order.item]: v }))} />
            : <NotForRole key={r.order.item} size="sm">{r.display_line} — not for your role here.</NotForRole> })}
        {others.length > 0 && <div className="flex flex-wrap items-center gap-2 text-14 text-muted"><span>{others.map((r) => r.service_name ?? r.display_line).join(', ')}: answered on the patient's page</span>{answer}</div>}
        <div className="flex gap-2">{others.length < g.rows.length && <Button size="sm" loading={busy === g.patient.id} disabled={!answers(g, true).length} onClick={() => void land(g.patient.id, answers(g, true))}>Give</Button>}
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button></div>
      </li>]
  }
  const search = <Input ref={box} autoFocus value={find} onChange={(e) => { setFind(e.target.value); setCursor(0); setArrows(false) }} onKeyDown={onKey}
    placeholder="Record number or name" aria-label="Find a patient — ↑↓ move · ↵ open · Esc clear" className="w-full sm:w-72" />
  return <ScreenFrame views={views} view={view} onView={pick} search={search}
    notice={error && <Callout tone="danger" title="Not given">{error}</Callout>}>
    {q.isLoading ? <Spinner label="Loading prescriptions" /> : <Card><ul ref={list}>
      {view !== 'done' ? (groups.length ? groups.flatMap(row) : <li><Empty>{f ? 'No match here.' : view === 'give' ? 'Nothing to give.' : 'Nothing prepared.'}</Empty></li>)
        : done.length ? done.map((r, i) => <ListRow key={r.id} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)}
            selected={i === c && arrows} className={i === c ? 'dispense-cursor' : undefined}
            status={<>{r.request?.status === 'cancelled' && <Tag tone="warn">{r.reply_type === 'pharmacy.dispense' ? 'not given' : 'not done'}</Tag>}<span className="truncate">{r.request?.reply_line ?? r.service_name}</span></>}
            actions={<><span className="tnum">{r.reply?.author_name}{r.reply && ` · ${hm(r.reply.recorded_at)}`}</span>
              <Button size="sm" variant="outline" disabled={!r.reply} onClick={() => navigate(`/bench/correct/${r.id}`)}>Correct</Button></>} />)
        : <li><Empty>{f ? 'No match here.' : 'Nothing given in the last 24 hours.'}</Empty></li>}
    </ul></Card>}
  </ScreenFrame>
}
