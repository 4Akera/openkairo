// The emergency pack's pictures (2026-10-08, proposed by Claude, awaiting the owner): triage at the door, the ER's board (the base's,
// its cubicles and resus bays; the waiting chairs, not triaged first, then by level), and where the patient goes. The drug round, obs and handover are
// the shared ward pack's (stays.tsx), ticked here too.
import { Siren } from 'lucide-react'
import { Badge, Button, Callout, Card, Chip, Input, Kbd, ScreenFrame, Tag, Textarea, cn, type ScreenView } from '@core/ui'
import { App, Label } from './kit'
import { Line } from './order'
import { Ask, Board, Stay, noop, type Bed } from './stays'

const ER = 'Emergency'
const erTabs = ['Board', 'Drug round', 'Handover']
const LEVELS: [number, string, string, string][] = [[1, 'Immediate', 'now', 'danger'], [2, 'Very urgent', '10 min', 'danger'], [3, 'Urgent', '30 min', 'warn'], [4, 'Standard', '60 min', 'neutral'], [5, 'Non-urgent', '120 min', 'neutral']]

// ── 1 · triage at the door ──
export function ErTriage() {
  const complaints = ['Chest pain', 'Short of breath', 'Injury · road accident', 'Fall', 'Abdominal pain', 'Fever', 'Poisoning', 'Scorpion or snake', 'Burn', 'Fits', 'Weakness one side', 'Bleeding in pregnancy']
  return <App dept={ER} user="Heba Nabil" tabs={erTabs} tab="Board">
    <ScreenFrame action={<Button size="sm"><Siren />Arrived<Kbd className="ms-1">N</Kbd></Button>}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
        <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-12 text-faint">#10288</span><span className="text-18 font-semibold text-fg">Karim Mahmoud</span>
          <span className="text-13 text-muted">34 M · arrived 14:02 by ambulance · call 4471</span><span className="ms-auto text-12 text-faint">waiting 4 min</span></div>
        <div className="grid gap-1.5"><Label>What brings him</Label>
          <div className="flex flex-wrap gap-1.5">{complaints.map((c, i) => <Chip key={c} on={i === 2} onClick={noop}>{c}</Chip>)}</div>
          <Input readOnly value="motorbike vs microbus, helmet, pain left chest and left thigh" /></div>
        <div className="grid gap-1.5"><Label>Vitals</Label><Line>/v 96/60 124 28 36.8 spo2 92 pain 8</Line>
          <span className="text-12 text-faint">Consciousness (ACVPU) is not a base vital today: Q5.</span></div>
        <div className="grid gap-1.5"><Label>Level</Label>
          <div className="flex flex-wrap gap-2">{LEVELS.map(([n, w, t, tone]) => <button key={n} type="button" className={cn('grid min-w-28 rounded-lg px-3 py-2 text-start ring-1',
            n === 2 ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface ring-line')}>
            <span className={cn('text-14 font-semibold', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{n} · {w}</span>
            <span className="text-12 text-muted">{t === 'now' ? 'doctor at once' : `doctor within ${t}`}</span></button>)}</div>
          <p className="text-12 text-warn">Suggested 2 from the vitals: pulse 124, breathing 28, SpO₂ 92. The nurse decides; a different level asks why in a few words.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Label>Police case</Label><Chip on onClick={noop}>Yes · road accident</Chip><Chip onClick={noop}>No</Chip>
          <span className="text-12 text-faint">the report number can come later, before he leaves</span></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button>Triage · to Resus 2<Kbd className="ms-1">⌘↵</Kbd></Button>
          <Button variant="outline">Triage · wait for a cubicle</Button><span className="text-12 text-faint">a level 1 or 2 is offered the free resus bay first</span></div>
      </Card>
      <p className="text-12 text-faint">The ER's reception or the triage nurse presses Arrived (one search, or New patient, or an unknown patient). Triage is the emergency pack's own entry (the level,
        what brings them, why a level was changed); the vitals are the base's. Retriage is the same card again from the tile.</p>
      <Ask n={6}>Which scale? Drawn: five levels with a time to the doctor (the Australasian scale: now, 10, 30, 60, 120 min). Manchester has the same five levels with longer
        times (now, 10, 60, 120, 240 min). ESI is the other common choice: levels 1–2 by danger, 3–5 by how many tests and treatments they will need, no times. The scale is the clinic's setting on the pack's page; the times are the department's.</Ask>
    </ScreenFrame>
  </App>
}

// ── 2 · the ER's board ──
export function ErBoard() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All', count: 8 }, { id: 'late', label: "Past the level's time", count: 2, needs: 'danger' }, { id: 'back', label: 'Results back', count: 1 }, { id: 'go', label: 'To leave', count: 2 }]
  const beds: Bed[] = [
    { name: 'Resus 1', who: { name: 'Fathy Ragab', sexAge: 'M 61', day: 1, clinician: 'Dr. Tamer Ezz', reason: 'chest pain · STEMI', urgent: false },
      line: [{ text: '1 · Immediate', tone: 'danger' }, 'seen 2 min ago', 'for CCU'], buttons: ['Triage', 'Where to'] },
    { name: 'Resus 2', who: { name: 'Karim Mahmoud', sexAge: 'M 34', day: 1, clinician: null, reason: 'road accident', urgent: false },
      line: [{ text: '2 · Very urgent', tone: 'danger' }, { text: 'no doctor · 12 min', tone: 'danger' }, 'police case'], buttons: ['Triage', 'Where to'] },
    { name: 'Cubicle 1', who: { name: 'Salwa Hamed', sexAge: 'F 71', day: 1, clinician: 'Dr. Tamer Ezz', reason: 'short of breath', urgent: false },
      line: [{ text: '3 · Urgent', tone: 'warn' }, 'seen 1 h 43 ago', { text: 'results back', tone: 'info' }, 'NEWS2 4'], buttons: ['Triage', 'Where to'] },
    { name: 'Cubicle 2', who: { name: 'Ola Fawzy', sexAge: 'F 29', day: 1, clinician: 'Dr. Rana Galal', reason: 'abdominal pain', urgent: false },
      line: [{ text: '3 · Urgent', tone: 'warn' }, 'seen 25 min ago', 'US pending'], buttons: ['Triage', 'Where to'] },
    { name: 'Cubicle 3', who: { name: 'Mostafa Saeed', sexAge: 'M 9', day: 1, clinician: 'Dr. Rana Galal', reason: 'scorpion sting', urgent: false },
      line: [{ text: '3 · Urgent', tone: 'warn' }, 'seen 6 h ago', { text: 'for home', tone: 'ok' }], buttons: ['Triage', 'Where to'] },
    { name: 'Cubicle 4', closed: true },
  ]
  const waiting: Bed[] = [
    { name: 'Chairs', who: { name: 'Nadia Ibrahim', sexAge: 'F 52', day: 1, clinician: null, reason: null, urgent: false },
      line: [{ text: 'not triaged · 6 min', tone: 'warn' }], buttons: ['Triage', 'Where to'] },
    { name: 'Chairs', who: { name: 'Hany Sherif', sexAge: 'M 45', day: 1, clinician: null, reason: 'cut hand', urgent: false },
      line: ['4 · Standard', { text: 'waiting 72 min', tone: 'danger' }], buttons: ['Triage', 'Where to'] },
    { name: 'Chairs', who: { name: 'Mariam Adel', sexAge: 'F 19', day: 1, clinician: null, reason: 'sore throat, fever', urgent: false },
      line: ['5 · Non-urgent', 'waiting 35 min'], buttons: ['Triage', 'Where to'] },
  ]
  return <App dept={ER} user="Dr. Tamer Ezz" tabs={erTabs} tab="Board">
    <ScreenFrame views={views} view="all" onView={noop} action={<Button size="sm" variant="outline"><Siren />Arrived<Kbd className="ms-1">N</Kbd></Button>}>
      <Board beds={beds} noBed={waiting} noBedTitle="Waiting · not triaged first, then by level, then by time" />
      <p className="text-12 text-faint">The base's board: the bays and cubicles are its places, the ER's waiting chairs its “no bed” list. Emergency's words lead the line (level, how long since
        triage or since the doctor saw them, where they go), the ward pack's follow (NEWS2, a dose due). Past the level's time with no doctor: red. A doctor takes a patient with the tile's name
        (the base's assigned). “To leave”: a Where to chosen, not yet signed. The level says how urgent, so the base's “urgent” is not used here; the base's “Day 1” stays on ER tiles for now.
        Two pack buttons a tile: Triage and Where to take the place of the ward pack's Give and Obs (doses go through the Drug round tab). The base's Discharge opens the same card as Where to,
        with Home chosen. Cubicle 4 is closed while it is cleaned.</p>
      <Ask n={2}>An ER patient is a short stay in a place (as the base's stays, marked as emergency stays by the department's setting), so the board, the bays and Move work today with no core change.
        The other way is a core change letting a clinic visit sit in a place. The same question holds for a dialysis chair.</Ask>
    </ScreenFrame>
  </App>
}

// ── 3 · where the patient goes ──
export function ErWhereTo() {
  const go: [string, string, boolean?][] = [['Home', 'the letter, medicines, a follow-up'], ['Admit to a ward', 'Medical 2 free · Surgical 1 free', true], ['ICU', '1 free · ICU 5'], ['CCU', '1 free'],
    ['Theatre', 'the theatre list'], ['Another facility', 'why, and where'], ['Left before being seen', ''], ['Left against advice', 'signed by'], ['Died', 'in the ER or brought in dead · time and cause']]
  return <Stay dept={ER} user="Dr. Tamer Ezz" who={['Salwa Hamed', '71 y · F · #10233']} where="Emergency · Cubicle 1 · 2 h 05"
    safety={<Badge tone="danger">Sulfa · severe</Badge>} words={<><Tag tone="warn">3 · Urgent</Tag><Tag>seen 1 h 43 ago</Tag></>}
    actions={<Button size="sm" variant="outline" className="ring-2 ring-accent">Discharge</Button>}>
    <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
      <Label>Discharge · where to · from the ER</Label>
      <div className="grid gap-2 sm:grid-cols-3">{go.map(([w, s, on]) => <button key={w} type="button" className={cn('grid rounded-lg px-3 py-2 text-start ring-1',
        on ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface ring-line')}>
        <span className="text-14 font-medium text-fg">{w}</span>{s && <span className="text-12 text-muted">{s}</span>}</button>)}</div>
      <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
        <div className="flex flex-wrap items-center gap-2"><Label>Ward</Label><Chip on onClick={noop}>Medical Ward</Chip><Chip onClick={noop}>Surgical Ward</Chip>
          <Label className="ms-2">Bed</Label><Chip on onClick={noop}>Bed 2</Chip><Chip onClick={noop}>Bed 8</Chip><Chip onClick={noop}>the ward chooses</Chip></div>
        <div className="flex flex-wrap items-center gap-2"><Label>Under</Label><Chip on onClick={noop}>Dr. Ali Hassan</Chip><Chip onClick={noop}>the ward's on-call</Chip></div>
        <Textarea readOnly minRows={2} value="COPD exacerbation with type 2 respiratory failure, improving on nebulisers; off BiPAP since 13:00, on oxygen 2 L, target SpO₂ 88–92 %." />
      </div>
      <Callout tone="info" title="What the ward will see">At Sign, one set ends her ER stay (Cubicle 1 frees) and starts the ward's in Bed 2, “from Emergency”, with this note;
        her ER chart, the medicines started here and the doses given go with her.</Callout>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button>Sign · admit to Medical Ward<Kbd className="ms-1">⌘↵</Kbd></Button>
        <span className="text-12 text-faint">door to doctor 22 min · in the ER 2 h 05 · these times are the ER's monthly figures · a police case with no report number shows a notice here, never a stop</span></div>
    </Card>
    <p className="text-12 text-faint">The base's Discharge, opened in the ER: its endings (Home, Another facility, Left against advice, Died) with the ER's “Left before being seen” and the moves to a
      ward, ICU, CCU or theatre (Q3). Where to on the tile opens the same card.</p>
    <Ask n={3}>Moving a stay to another department (ER → ward, ward → ICU, ICU → ward, the labour ward → a separate postnatal ward) is a base change: today a stay moves only between the places of its own department.
      Drawn: the ER stay ends (“to Medical Ward”) and the ward's stay starts from it in the same set, so each department keeps its own times; ward ↔ ICU the same. The other way: one stay that changes department (one admission time for the whole
      hospital stay, each department's part read from its moves); or, as today, the ER discharges and the ward admits again, typed again.</Ask>
  </Stay>
}

