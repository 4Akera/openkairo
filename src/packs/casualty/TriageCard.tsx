// The triage card (spec/openCare.md §5.6): under the patient's row, inline (never over the list). How they came, what brings them,
// the danger signs, the vitals typed as /v words (the base's vitals, ACVPU and air or oxygen among them), the five levels of the
// clinic's scale each with its time to the doctor, the suggestion from the signs (ATS/NEWS2 thresholds: higher only, none under 16 —
// the nurse decides; a less urgent level asks why), then the place: a free resus bay first for a level 1 or 2. One Done writes the
// vitals, the triage, the base's urgent to match the level and the move to the place. A warning comes back with Sign anyway.
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { write, WriteWarned, type EntryIn, type Finding } from '@core/db/rpc'
import { oneSet } from '@core/db/entries'
import { banner } from '@core/db/views'
import type { Department, Identity, Place, PresenceRow, ServerEntry } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { refresh } from '@core/hooks/writes'
import { ageIn } from '@core/screens/chart/sections'
import { vitalsWords } from '@core/screens/visit/vitals'
import { words as findingWords } from '@core/db/words'
import { Button, Card, Chip, Field, Input, Kbd, TONE, cn, errorText, hm, ymd } from '@core/ui'
import { LEVELS, LEVEL_WORDS, levelWord, scaleOf, timeWords, toneOf, type Level } from './scale'
import { BASIS, DANGER, needsWhy, shows, signWords, suggest, type Danger } from './suggest'
import { ARRIVALS, COMPLAINTS, WHY_MAX, arrivalOf, placeChoices, triageSet, vitalsOf, type Arrival, type Complaint, type TriageDraft } from './triage'
import { dur, type StayFacts } from './board'

export interface TriageCardProps {
  dept: Department; row: PresenceRow; identity?: Identity; opening?: ServerEntry; facts?: StayFacts; arrival?: Arrival | null; arrivalRef?: string
  places: Place[]; taken: Set<string>; onDone: () => void; onCancel: () => void
}

/** a labelled group of chips (a label element would hand its clicks to the first chip) */
export const Group = ({ label, children }: { label: string; children: ReactNode }) =>
  <div role="group" aria-label={label} className="grid content-start gap-1"><span className="text-12 font-medium text-muted">{label}</span>{children}</div>

export function TriageCard({ dept, row, identity, opening, facts, arrival: carried, arrivalRef, places, taken, onDone, onCancel }: TriageCardProps) {
  const { org } = useDepartment(); const qc = useQueryClient()
  const [arrival, setArrivalNow] = useState<Arrival | null>(carried ?? arrivalOf(opening?.data?.admit_source as string | undefined) ?? null)
  const [ref, setRefNow] = useState(arrivalRef ?? ''); const [complaint, setComplaintNow] = useState<Complaint | null>(null)
  const [text, setTextNow] = useState(row.reason ?? ''); const [danger, setDangerNow] = useState<Danger[]>([]); const [line, setLineNow] = useState('')
  const [level, setLevelNow] = useState<Level | null>(null); const [why, setWhyNow] = useState('')
  const [chosenPlace, setPlaceNow] = useState<string | null | undefined>(undefined)   // undefined: not chosen, the level's default
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  // a warning holds the very set it was given for: Sign anyway resends that set with its codes added to those confirmed before
  const [warn, setWarn] = useState<{ findings: Finding[]; retry: (codes: string[]) => void } | null>(null)
  // any change to the draft drops the warning: the changed draft goes back through a plain Triage
  const edit = <T,>(set: (x: T) => void) => (x: T) => { setWarn(null); set(x) }
  const setArrival = edit(setArrivalNow); const setRef = edit(setRefNow); const setComplaint = edit(setComplaintNow); const setText = edit(setTextNow)
  const setDanger = edit(setDangerNow); const setLine = edit(setLineNow); const setLevel = edit(setLevelNow); const setWhy = edit(setWhyNow); const setPlace = edit(setPlaceNow)
  const scale = scaleOf(org); const [now] = useState(() => Date.now())   // when the card opened
  const v = vitalsOf(line)
  const age = identity?.birth_date ? ageIn(identity.birth_date, ymd(new Date(now).toISOString()), 'years') : null
  const sug = suggest(v.params, danger, age)
  const whyNeeded = needsWhy(sug, level)
  const { free, own, place } = placeChoices(places, taken, row, dept.id, level, chosenPlace)
  const moving = place && place !== row.place_id ? places.find((p) => p.id === place) : null
  const verb = facts?.triage ? 'Retriage' : 'Triage'
  const label = moving ? `${verb} · to ${moving.name}` : own ? `${verb} · stay in ${own.name}` : `${verb} · wait`
  const blocked = !!v.error || level === null || (whyNeeded && !why.trim()) || busy
  const p = identity ? banner(identity) : null
  const sexAge = identity ? `${identity.gender === 'male' ? 'M' : identity.gender === 'female' ? 'F' : '?'} ${identity.birth_date ? p!.age : '?'}` : ''

  /** one set: landed → done; warned → the card keeps that set, and Sign anyway resends it with the codes confirmed (as the chart does) */
  async function send(es: EntryIn[], confirmed: string[] = []) {
    setBusy(true); setErr(null); setWarn(null)
    try {
      await write(oneSet(es, confirmed.length ? { confirmed } : {}))
      refresh(qc); void qc.invalidateQueries({ queryKey: ['casualty-board'] }); void qc.invalidateQueries({ queryKey: ['pack-tiles'] })
      onDone()
    } catch (e) {
      if (e instanceof WriteWarned) setWarn({ findings: e.outcome.findings, retry: (c) => void send(es, [...confirmed, ...c]) }); else setErr(errorText(e))
    } finally { setBusy(false) }
  }
  function sign() {
    if (level === null) return
    const draft: TriageDraft = { scale, level, arrival, arrival_ref: ref, complaint, words: text, danger, vitals: v.params, suggested: sug, why, place }
    void send(triageSet(draft, row, dept.id))
  }
  const toggle = (d: Danger) => setDanger(danger.includes(d) ? danger.filter((x) => x !== d) : [...danger, d])

  return <Card className="m-2 grid gap-3 p-4" onKeyDown={(e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !blocked) { e.preventDefault(); sign() } }}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-13">
      <span className="font-semibold">{p ? `#${p.record_number} ${p.given_name} ${p.family_name}` : 'Patient'}</span><span className="text-muted">{sexAge}</span>
      <span className="text-muted">arrived {hm(row.checked_in_at)}{arrival === 'ambulance' ? ` · by ambulance${ref.trim() ? ` · call ${ref.trim()}` : ''}` : ''}</span>
      <span className="text-muted">waiting {dur((now - Date.parse(row.checked_in_at)) / 60_000)}</span>
      {facts?.triage && <span className={cn('font-medium', TONE[toneOf(facts.triage.level) ?? 'neutral'].text)}>now {levelWord(facts.triage.level)}</span>}
    </div>
    <Group label="How they came"><span className="flex flex-wrap items-center gap-1.5">{ARRIVALS.map(([k, l]) => <Chip key={k} on={arrival === k} onClick={() => setArrival(arrival === k ? null : k)}>{l}</Chip>)}
      {arrival === 'ambulance' && <Input dense value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} aria-label="Ambulance call" placeholder="Call number" className="w-32" />}</span></Group>
    <Group label="What brings them"><div className="grid gap-1.5"><span className="flex flex-wrap gap-1.5">{COMPLAINTS.map(([k, l]) =>
      <Chip key={k} on={complaint === k} onClick={() => setComplaint(complaint === k ? null : k)}>{l}</Chip>)}</span>
      <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="What brings them, in words" placeholder="In the nurse's words" /></div></Group>
    <Group label="Danger signs"><span className="flex flex-wrap gap-1.5">{DANGER.map((d) => <Chip key={d.key} variant="check" on={danger.includes(d.key)} onClick={() => toggle(d.key)}>{d.label}</Chip>)}</span></Group>
    <Field label="Vitals" error={v.error ?? undefined} hint={!v.error && v.params ? vitalsWords(v.params) : 'As on /v: 96/60 124 36.8 spo2 92 rr 28 a air'}>
      <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="/v 120/80 88 37 spo2 98 rr 16 a air" tone={v.error ? 'danger' : 'default'} /></Field>
    <Group label={`Level · ${scale === 'ats' ? 'Australasian' : 'Manchester'} scale`}><div className="grid gap-1.5">
      <div role="radiogroup" aria-label="Level" className="grid gap-1.5 sm:grid-cols-5">{LEVELS.map((n) => { const t = TONE[toneOf(n) ?? 'neutral']; const on = level === n
        return <button key={n} type="button" role="radio" aria-checked={on} onClick={() => setLevel(n)}
          className={cn('grid rounded-md px-2.5 py-1.5 text-start text-12 ring-1 ring-inset transition-colors focus-ring', on ? `${t.soft} ${t.line} font-semibold` : 'bg-surface ring-line hover:ring-line-strong')}>
          <span className={cn('text-13 font-medium', t.text)}>{n} · {LEVEL_WORDS[n]}</span><span className="text-faint">{timeWords(scale, n)}</span></button> })}</div>
      {age !== null && age < 16 ? <p className="text-12 text-muted">No suggestion under 16: the nurse decides</p>
      : sug && shows(sug, level) && <p className={cn('text-12', TONE[toneOf(sug.level) ?? 'neutral'].text)}>
        Suggested {sug.level} from the signs {BASIS} · {sug.signs.map((s) => signWords(s, v.params)).join(' · ')} — the nurse decides</p>}</div></Group>
    {whyNeeded && <Field label={`Why ${level} and not ${sug!.level}`} hint={`Required, at most ${WHY_MAX} letters`}>
      <Input value={why} maxLength={WHY_MAX} onChange={(e) => setWhy(e.target.value)} placeholder="In a few words" tone={why.trim() ? 'default' : 'danger'} /></Field>}
    <Group label="Place"><span className="flex flex-wrap gap-1.5">
      {own ? <Chip on={place === own.id} onClick={() => setPlace(own.id)}>Stay in {own.name}</Chip> : <Chip on={!place} onClick={() => setPlace(null)}>Chairs</Chip>}
      {free.map((x) => <Chip key={x.id} on={place === x.id} onClick={() => setPlace(x.id)}>{x.name}</Chip>)}</span></Group>
    {warn && <div className="grid gap-1.5 rounded-md bg-warn-soft p-2 text-13 text-warn">{warn.findings.map((f, i) => <span key={i}>{findingWords(f.code)}{f.detail ? `: ${f.detail}` : ''}</span>)}
      <span><Button size="sm" onClick={() => warn.retry(warn.findings.map((f) => f.code))} loading={busy}>Sign anyway</Button></span></div>}
    {err && <p className="text-13 text-danger">{err}</p>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button disabled={blocked} loading={busy} onClick={sign}>{label}<Kbd className="ms-1">⌘↵</Kbd></Button></div>
  </Card>
}
