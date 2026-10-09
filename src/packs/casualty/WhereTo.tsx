// The Where to card (spec/openCare.md §5.6, piece E3): under the patient's row, inline (never over the list). The ER's times worked out
// from what is written, the police case's notice (never a stop), the choices (ICU and CCU only when the clinic has one; Died only for
// whoever may record a death) and the panel of the one chosen: for an admission the departments of beds with their free beds and "the
// ward chooses", the reason and a note for the ward; another facility and why; who signed against advice; died in the ER or brought in
// dead, when, and the cause. Decided writes the decision alone (boarding starts); Sign writes the leaving in one Done (an admission
// passes the stay to the next department, its note in the new stay). A warning comes back with Sign anyway.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp, write, WriteRefused, WriteWarned, type EntryIn, type Finding } from '@core/db/rpc'
import { oneSet } from '@core/db/entries'
import { banner } from '@core/db/views'
import type { Department, Identity, PresenceRow } from '@core/db/types'
import { words as findingWords } from '@core/db/words'
import { useDepartment } from '@core/hooks/organization'
import { refresh } from '@core/hooks/writes'
import { Button, Callout, Card, Chip, Field, Input, Kbd, NumberInput, Textarea, cn, errorText } from '@core/ui'
import type { StayFacts } from './board'
import { Group } from './TriageCard'
import { SIGN_ONLY, bedsOf, choicesFor, decideSet, destinations, destsFor, hintOf, isAdmit, leaveSet, policeNotice, timesLine, timesOf,
  type Beds, type Leave, type To } from './where'

export interface WhereToProps { dept: Department; row: PresenceRow; identity?: Identity; facts?: StayFacts; onDone: () => void; onCancel: () => void }

export function WhereTo({ dept, row, identity, facts, onDone, onCancel }: WhereToProps) {
  const { org, can } = useDepartment(); const qc = useQueryClient()
  const departments = org?.departments ?? []
  const classOf = (id: string) => departments.find((d) => d.id === id)?.encounter_class
  const ids = destinations(departments, dept.id, null, classOf).map((d) => d.id)
  const bedsQ = useQuery({ queryKey: ['casualty-beds', dept.id, ids], queryFn: () => packOp<Beds>('casualty.beds', dept.id, { departments: ids }),
    enabled: ids.length > 0, retry: false })
  const beds = bedsOf(bedsQ.data)
  const dests = destinations(departments, dept.id, beds, classOf)
  const decided = facts?.decided
  const [now] = useState(() => Date.now())   // when the card opened
  const [to, setToNow] = useState<To | null>(decided?.to ?? null)
  const [depChosen, setDepNow] = useState<string | undefined>(decided?.department_id)
  const [bedChosen, setBedNow] = useState<string | null>(null)   // null: the ward chooses
  const [reason, setReasonNow] = useState(row.reason ?? ''); const [note, setNoteNow] = useState('')
  const [facility, setFacilityNow] = useState(decided?.facility ?? ''); const [why, setWhyNow] = useState(decided?.why ?? ''); const [signedBy, setSignedByNow] = useState('')
  const [bid, setBidNow] = useState(false); const [ago, setAgoNow] = useState<number | null>(null); const [cause, setCauseNow] = useState('')
  const [report, setReportNow] = useState(decided?.police_report ?? '')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [warn, setWarn] = useState<{ findings: Finding[]; retry: (codes: string[]) => void } | null>(null)
  // any change drops the warning: the changed card goes back through a plain Decided or Sign
  const edit = <T,>(set: (x: T) => void) => (x: T) => { setWarn(null); set(x) }
  const setTo = edit(setToNow); const setDep = edit(setDepNow); const setBed = edit(setBedNow); const setReason = edit(setReasonNow); const setNote = edit(setNoteNow)
  const setFacility = edit(setFacilityNow); const setWhy = edit(setWhyNow); const setSignedBy = edit(setSignedByNow); const setBid = edit(setBidNow)
  const setAgo = edit(setAgoNow); const setCause = edit(setCauseNow); const setReport = edit(setReportNow)

  const choices = choicesFor(dests).filter((c) => c.to !== 'died' || can('write:died'))
  const offered = destsFor(to, dests)
  // the department: the one chosen while it is offered, else the only one offered
  const dest = offered.find((d) => d.id === depChosen) ?? (offered.length === 1 ? offered[0] : undefined)
  const bed = dest?.free.some((b) => b.id === bedChosen) ? bedChosen : null
  const nameOf = (id: string) => departments.find((d) => d.id === id)?.name ?? 'a ward'
  const leave: Leave | null = to && { to, department_id: dest?.id, place_id: bed, reason, note, facility, why, signed_by: signedBy, brought_in_dead: bid,
    cause, police_report: report }
  // died in the ER: never before they came in (brought in dead: up to 12 hours before)
  const agoMax = bid ? 720 : Math.min(720, timesOf(row, facts, Date.now()).inEr)
  const where = !to ? '' : isAdmit(to) ? (to === 'operating_room' ? `the operating room, then ${dest?.name ?? '…'}` : dest?.name ?? '…') : facility.trim()
  const decideLabel = to === 'home' ? 'Decided · for home' : to === 'other_facility' ? `Decided · to ${where || '…'}` : `Decided · for ${where}`
  const signLabel = !to ? 'Sign' : to === 'home' ? 'Sign · home now' : to === 'operating_room' ? `Sign · to ${where}` : isAdmit(to) ? `Sign · admit to ${where}`
    : to === 'other_facility' ? `Sign · to ${where || '…'}` : to === 'left_unseen' ? 'Sign · left before being seen' : to === 'against_advice' ? 'Sign · left against advice' : 'Sign · died'
  const blocked = !leave || busy || (isAdmit(to) && !dest) || (to === 'other_facility' && !facility.trim()) || (to === 'died' && ago !== null && ago > agoMax)
  const notice = policeNotice(facts?.police, report)
  const p = identity ? banner(identity) : null

  /** one set: landed → done; warned → the card keeps that set, and Sign anyway resends it with the codes confirmed */
  async function send(es: EntryIn[], confirmed: string[] = []) {
    setBusy(true); setErr(null); setWarn(null)
    try {
      await write(oneSet(es, confirmed.length ? { confirmed } : {}))
      refresh(qc); for (const k of ['casualty-board', 'casualty-beds']) void qc.invalidateQueries({ queryKey: [k] })
      onDone()
    } catch (e) {
      if (e instanceof WriteWarned) setWarn({ findings: e.outcome.findings, retry: (c) => void send(es, [...confirmed, ...c]) })
      else if (e instanceof WriteRefused && e.code === 'wrong_target') {
        // another decision came meanwhile: read the board again (the card takes the latest as it comes) and choose again
        setErr('Where to was changed meanwhile — the card now has the latest; choose again'); void qc.invalidateQueries({ queryKey: ['casualty-board'] })
      } else { setErr(errorText(e)); if (e instanceof WriteRefused && e.code === 'bed_taken') void bedsQ.refetch() }
    } finally { setBusy(false) }
  }
  const decide = () => { if (leave && !blocked) void send(decideSet(leave, row, dept.id, decided)) }
  // the time of death worked out as Sign is pressed, never from when the card opened
  const sign = () => { if (leave && !blocked) void send(leaveSet({ ...leave, died_at: ago ? new Date(Date.now() - ago * 60_000).toISOString() : undefined },
    row, dept.id, nameOf, decided)) }
  const pick = (t: To) => { setTo(t); if (isAdmit(t) && !destsFor(t, dests).some((d) => d.id === depChosen)) setDep(undefined) }

  return <Card className="m-2 grid gap-3 p-4" onKeyDown={(e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !blocked) { e.preventDefault(); sign() } }}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-13">
      <span className="font-semibold">Where to · from {dept.name}</span>
      {p && <span className="text-muted">#{p.record_number} {p.given_name} {p.family_name}</span>}
      <span className="text-muted">{timesLine(timesOf(row, facts, now))}</span>
    </div>
    {notice && <Callout tone="warn" role="status">{notice}</Callout>}
    <div role="radiogroup" aria-label="Where to" className="grid gap-2 sm:grid-cols-3">{choices.map((c) => {
      const on = to === c.to; const hint = c.to === 'ward' || c.to === 'icu' || c.to === 'ccu' ? (beds ? hintOf(c.to, dests) : destsFor(c.to, dests).map((d) => d.name).join(' · ')) : c.hint
      return <button key={c.to} type="button" role="radio" aria-checked={on} onClick={() => pick(c.to)}
        className={cn('grid rounded-lg px-3 py-2 text-start ring-1 ring-inset transition-colors focus-ring', on ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface ring-line hover:ring-line-strong')}>
        <span className="text-14 font-medium">{c.label}</span>{hint && <span className="text-12 text-muted">{hint}</span>}</button> })}</div>
    {isAdmit(to) && <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
      <Group label={to === 'operating_room' ? 'Then to' : 'Department'}><span className="flex flex-wrap gap-1.5">{offered.length ? offered.map((d) =>
        <Chip key={d.id} on={dest?.id === d.id} onClick={() => setDep(d.id)}>{d.name}{beds ? ` · ${d.free.length} free` : ''}</Chip>)
        : <span className="text-13 text-muted">No department of beds here takes them</span>}</span></Group>
      {dest && <Group label="Bed"><span className="flex flex-wrap gap-1.5">{dest.free.map((b) => <Chip key={b.id} on={bed === b.id} onClick={() => setBed(b.id)}>{b.name}</Chip>)}
        <Chip on={!bed} onClick={() => setBed(null)}>the ward chooses</Chip></span></Group>}
      <Field label="Reason"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Why they are admitted" /></Field>
      <Field label="For the ward" hint="An emergency note in the new stay"><Textarea minRows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the ward needs to know" /></Field>
    </div>}
    {to === 'other_facility' && <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Where" hint="Required"><Input value={facility} maxLength={120} onChange={(e) => setFacility(e.target.value)} placeholder="Name of the facility" tone={facility.trim() ? 'default' : 'danger'} /></Field>
      <Field label="Why"><Input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="In a few words" /></Field></div>}
    {to === 'against_advice' && <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Signed by"><Input value={signedBy} maxLength={80} onChange={(e) => setSignedBy(e.target.value)} placeholder="the patient, his brother Ahmed" /></Field>
      <Field label="What was explained"><Input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="The risks, in a few words" /></Field></div>}
    {to === 'died' && <div className="grid gap-2">
      <Group label="Died"><span className="flex flex-wrap gap-1.5"><Chip on={!bid} onClick={() => setBid(false)}>In the ER</Chip><Chip on={bid} onClick={() => setBid(true)}>Brought in dead</Chip></span></Group>
      <div className="grid gap-2 sm:grid-cols-2">
        <Group label="When"><span className="flex items-center gap-1.5"><Chip on={!ago} onClick={() => setAgo(null)}>now</Chip>
          <NumberInput integer dense label="Minutes ago" value={ago} onValue={(n) => setAgo(n === null ? null : Math.min(agoMax, Math.max(0, n)))} placeholder="minutes ago" className="w-28" />
          {ago !== null && ago > agoMax ? <span className="text-12 text-danger">before they came in: {agoMax} minutes at most</span>
            : <span className="text-12 text-faint">{ago ? `${ago} minutes ago` : 'now'}</span>}</span></Group>
        <Field label="Cause"><Input value={cause} maxLength={200} onChange={(e) => setCause(e.target.value)} placeholder="In words" /></Field></div></div>}
    {(facts?.police || decided?.police_report || report) && <Field label="Police report number" hint="Before they leave, never a stop">
      <Input value={report} maxLength={40} onChange={(e) => setReport(e.target.value)} placeholder="2214/2026" className="w-40" /></Field>}
    {warn && <div className="grid gap-1.5 rounded-md bg-warn-soft p-2 text-13 text-warn">{warn.findings.map((f, i) => <span key={i}>{findingWords(f.code)}{f.detail ? `: ${f.detail}` : ''}</span>)}
      <span><Button size="sm" onClick={() => warn.retry(warn.findings.map((f) => f.code))} loading={busy}>Sign anyway</Button></span></div>}
    {err && <p className="text-13 text-danger">{err}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button>
      {to && !SIGN_ONLY.includes(to) && <Button variant="outline" disabled={blocked} loading={busy} onClick={decide}>{decideLabel}</Button>}
      <Button disabled={blocked} loading={busy} onClick={sign}>{signLabel}<Kbd className="ms-1">⌘↵</Kbd></Button></div>
  </Card>
}
