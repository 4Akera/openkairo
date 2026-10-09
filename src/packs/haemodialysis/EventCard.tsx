// An event on the machine (spec/openCare.md §5.6, D2c): what happened (several: Low BP, Cramps, …), what was done (Saline 200 or 100 mL,
// taking off paused, blood flow lowered, the doctor called) and words, with a BP or pulse taken then; Sign writes one set — the base's
// note, the saline as the base's given, and a reading. Under the readings, the stay's events, the newest first.
import { useState } from 'react'
import type { Department, PresenceRow } from '@core/db/types'
import { Button, Card, Chip, Input, Kbd, NumberInput, hm } from '@core/ui'
import { CardHead, SignState } from './parts'
import { DONE, EVENTS, eventProblems, eventSet, eventWords, type StayEvent } from './event'
import type { Reading } from './reading'
import { onSign } from './session'
import { useSign } from './useSession'

const LABEL = 'text-12 text-muted'
const toggle = (list: string[], k: string) => list.includes(k) ? list.filter((x) => x !== k) : [...list, k]

export function EventCard({ dept, stay, last }: { dept: Pick<Department, 'id'>; stay: PresenceRow; last: Partial<Reading> | null }) {
  const [events, setEvents] = useState<string[]>([]); const [done, setDone] = useState<string[]>([])
  const [words, setWords] = useState(''); const [bp, setBp] = useState(''); const [pulse, setPulse] = useState<number | null>(null)
  const s = useSign()
  const problems = eventProblems({ events, bp, words })
  const ready = !problems.length && !s.busy
  const reset = () => { setEvents([]); setDone([]); setWords(''); setBp(''); setPulse(null) }
  const sign = () => { if (ready) void s.sign(eventSet({ patientId: stay.patient_id, departmentId: dept.id, stay, events, done, words, bp, pulse, last }), reset) }
  // one saline at a time
  const pick = (k: string) => setDone((d) => k.startsWith('saline_') && !d.includes(k) ? [...d.filter((x) => !x.startsWith('saline_')), k] : toggle(d, k))
  return <Card className="grid content-start gap-2 p-3" onKeyDown={onSign(sign)}>
    <CardHead>An event</CardHead>
    <div role="group" aria-label="What happened" className="flex flex-wrap gap-1">{EVENTS.map(([k, w]) =>
      <Chip key={k} variant="check" on={events.includes(k)} onClick={() => setEvents((e) => toggle(e, k))}>{w}</Chip>)}</div>
    <div role="group" aria-label="What was done" className="flex flex-wrap items-center gap-1"><span className={LABEL}>Done</span>{DONE.map(([k, w]) =>
      <Chip key={k} variant="check" on={done.includes(k)} onClick={() => pick(k)}>{w}</Chip>)}</div>
    <Input dense value={words} maxLength={300} onChange={(e) => setWords(e.target.value)} placeholder="What else was done" aria-label="What else was done" />
    <div className="flex flex-wrap items-end gap-1.5">
      <label className="grid gap-0.5"><span className={LABEL}>BP</span><Input dense value={bp} onChange={(e) => setBp(e.target.value)} placeholder="88/54" aria-label="BP" className="w-20 tnum" /></label>
      <label className="grid gap-0.5"><span className={LABEL}>Pulse</span><NumberInput dense integer label="Pulse" value={pulse} onValue={setPulse} className="w-16" /></label>
      <span className="pb-1 text-12 text-faint">a reading, the machine's numbers kept</span>
    </div>
    {problems.length > 0 && (events.length > 0 || bp.trim()) && <p className="text-12 text-danger">{problems.join(' · ')}</p>}
    <SignState err={s.err} warn={s.warn} />
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={sign} disabled={!ready} loading={s.busy}>Sign the event<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {!events.length && <span className="text-12 text-faint">Choose what happened</span>}</div>
  </Card>
}

/** the stay's events, the newest first: the time, what happened (red with Low BP), what was done */
export function EventList({ events }: { events: StayEvent[] }) {
  if (!events.length) return null
  return <Card className="grid gap-1.5 p-3">
    <CardHead>Events</CardHead>
    <ul className="grid gap-1">{events.map((e) => { const w = eventWords(e.heading)
      return <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-13">
        <span className="font-mono text-12 text-faint">{hm(e.at)}</span>
        <b className={w?.tone === 'danger' ? 'font-semibold text-danger' : 'font-semibold text-warn'}>{e.heading}</b>
        {e.text && e.text !== e.heading && <span className="text-muted">{e.text}</span>}</li> })}</ul>
  </Card>
}
