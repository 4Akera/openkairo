// End (spec/openCare.md §5.6, D2c): the nurse's card at the end of a session, opened by the tile's End (?card=end) or the patient line's
// "End session": the weight after (against the dry weight: "72.6 kg: 0.6 above dry", under dry in amber), BP and pulse, the fluid taken
// off (the last reading's, editable), the needle sites, ended early with a reason, an outcome, and the time it came off the machine (now,
// or the time typed when signing late). One Done writes the vitals, the session completed (or stopped) and the base's Discharge.
import { useState } from 'react'
import type { Department, PresenceRow } from '@core/db/types'
import { Button, Card, Chip, Input, Kbd, NumberInput } from '@core/ui'
import { litres } from './board'
import { NEEDLES, endProblems, endSet, endWords, endedAt, offPreset } from './end'
import { CardHead, SignState } from './parts'
import { onSign, type SessionNow } from './session'
import { useSign } from './useSession'

const LABEL = 'text-12 text-muted'

export function EndCard({ dept, stay, session, lastUf, dry, now, onDone, onClose }: { dept: Pick<Department, 'id'>; stay: PresenceRow; session: SessionNow | null
  lastUf: number | null; dry: number | null; now: number; onDone: (at: string) => void; onClose: () => void }) {
  const [weight, setWeight] = useState<number | null>(null); const [bp, setBp] = useState(''); const [pulse, setPulse] = useState<number | null>(null)
  const [offL, setOffL] = useState<number | null>(offPreset(lastUf))
  const [needles, setNeedles] = useState<string[]>([]); const [needleWords, setNeedleWords] = useState('')
  const [stopped, setStopped] = useState(false); const [reason, setReason] = useState(''); const [outcome, setOutcome] = useState('')
  const [time, setTime] = useState('')
  const s = useSign()
  const on = session?.status === 'in-progress'
  // the tab's clock checks the time typed; the sign reads the clock again (blank: the moment it is signed)
  const ended = endedAt(time, now)
  const x = { patientId: stay.patient_id, departmentId: dept.id, stay, session, weight, bp, pulse, removed: offL != null ? Math.round(offL * 1000) : null,
    needles, needleWords, stopped, reason, outcome, ended }
  const problems = [...endProblems(x), ...(ended === null ? ['The time as 13:05'] : [])]
  const ready = !problems.length && !s.busy
  const sign = () => {
    if (!ready) return
    const at = endedAt(time) ?? ended ?? ''; const es = endSet({ ...x, ended: at })
    if (es.length) void s.sign(es, () => onDone(at))
  }
  const w = endWords(weight, dry)
  return <Card className="grid max-w-3xl content-start gap-2 p-3" onKeyDown={onSign(sign)}>
    <CardHead right={<Button size="xs" variant="ghost" onClick={onClose}>Cancel</Button>}>End the session</CardHead>
    {!on && <p className="text-13 text-warn">{session ? 'The session has ended already: End discharges the stay.' : 'No session in this stay: End discharges it.'}</p>}
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
      <label className="grid gap-0.5"><span className={LABEL}>Weight after <span className="text-faint">kg</span></span><NumberInput dense label="Weight after" value={weight} onValue={setWeight} className="w-20" /></label>
      <label className="grid gap-0.5"><span className={LABEL}>BP</span><Input dense value={bp} onChange={(e) => setBp(e.target.value)} placeholder="118/72" aria-label="BP" className="w-20 tnum" /></label>
      <label className="grid gap-0.5"><span className={LABEL}>Pulse</span><NumberInput dense integer label="Pulse" value={pulse} onValue={setPulse} className="w-16" /></label>
      {on && <label className="grid gap-0.5"><span className={LABEL}>Taken off <span className="text-faint">L</span></span><NumberInput dense label="Taken off, litres" value={offL} onValue={setOffL} className="w-20" /></label>}
      {on && <label className="grid gap-0.5"><span className={LABEL}>Came off at</span><Input dense type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Came off at (blank: now)" className="w-28" /></label>}
    </div>
    {w && <p className={w.tone === 'warn' ? 'text-13 text-warn' : 'text-13 text-fg'}>{w.text}</p>}
    {on && <>
      {lastUf != null && <p className="text-12 text-faint">Taken off from the last reading ({litres(lastUf)} L); change it to the machine's figure.</p>}
      <div role="group" aria-label="Needle sites" className="flex flex-wrap items-center gap-1"><span className={LABEL}>Needles</span>{NEEDLES.map(([k, t]) =>
        <Chip key={k} variant="check" on={needles.includes(k)} onClick={() => setNeedles((n) => n.includes(k) ? n.filter((y) => y !== k) : [...n, k])}>{t}</Chip>)}
        <Input dense value={needleWords} maxLength={120} onChange={(e) => setNeedleWords(e.target.value)} placeholder="Words" aria-label="Needle sites, words" className="min-w-0 flex-1" /></div>
      <div className="flex flex-wrap items-center gap-1.5"><Chip variant="check" on={stopped} onClick={() => setStopped(!stopped)}>Ended early</Chip>
        {stopped && <Input dense value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Why" aria-label="Why it ended early" className="min-w-0 flex-1" />}</div>
      <Input dense value={outcome} maxLength={300} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome (optional)" aria-label="Outcome" />
    </>}
    {problems.length > 0 && weight != null && <p className="text-12 text-danger">{problems.join(' · ')}</p>}
    <SignState err={s.err} warn={s.warn} />
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={sign} disabled={!ready} loading={s.busy}>Done · discharge home<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {weight == null && <span className="text-12 text-faint">Needs the weight after</span>}</div>
  </Card>
}
