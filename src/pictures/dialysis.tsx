// The dialysis pack's pictures (2026-10-08, proposed by Claude, awaiting the owner): the unit by shift and chair (the base's board, its
// chairs), the session (weights, the fluid to take off, machine readings, the unit's drugs) and the standing schedule (Sat/Mon/Wed or
// Sun/Tue/Thu, a shift, a chair; HBV and HCV chairs apart). It does not use the ward pack: the session card holds its own readings.
import type { ReactNode } from 'react'
import { Button, Callout, Card, Chip, Input, Kbd, ListRow, ScreenFrame, Tag, type ScreenView } from '@core/ui'
import { App, Label } from './kit'
import { Keys } from './order'
import { Ask, Board, Grid, Stay, noop, type Bed, type GridRow } from './stays'

const HD = 'Dialysis unit'
const hdTabs = ['Chairs', 'Schedule']
const shifts = <span className="flex flex-wrap items-center gap-1">{[['Shift 1 · 07:00', false], ['Shift 2 · 11:30', true], ['Shift 3 · 16:00', false]].map(([s, on]) =>
  <Chip key={s as string} shape="pill" on={on as boolean} onClick={noop}>{s}</Chip>)}</span>

// ── 1 · the unit today ──
export function HdUnit() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All chairs', count: 8 }, { id: 'on', label: 'On', count: 5 }, { id: 'due', label: 'Due, not started', count: 2, needs: 'warn' }, { id: 'done', label: 'Finished', count: 0 }]
  const chairs: Bed[] = [
    { name: 'Chair 1', who: { name: 'Said Abdelaziz', sexAge: 'M 56', day: 1, clinician: 'Dr. Walid Hamza', reason: 'HD · AV fistula', urgent: false },
      line: ['on · 1:30 left', 'off 1.4 of 2.8 L', 'BP 112/70'], buttons: ['Readings', 'End'] },
    { name: 'Chair 2', who: { name: 'Nadia Sobhy', sexAge: 'F 63', day: 1, clinician: 'Dr. Walid Hamza', reason: 'HD · catheter', urgent: false },
      line: ['on · 1:20 left', { text: 'BP 88/54 · cramp', tone: 'danger' }, 'saline 200 mL'], buttons: ['Readings', 'End'] },
    { name: 'Chair 3', who: { name: 'Ibrahim Taha', sexAge: 'M 41', day: 1, clinician: 'Dr. Walid Hamza', reason: 'HD · AV fistula', urgent: false },
      line: ['on · 1:50 left', 'off 1.5 of 3.2 L', { text: 'gained 3.4 kg', tone: 'warn' }], buttons: ['Readings', 'End'] },
    { name: 'Chair 4' },
    { name: 'Chair 5', who: { name: 'Fawzia Kamel', sexAge: 'F 70', day: 1, clinician: 'Dr. Walid Hamza', reason: 'HD · AV fistula', urgent: false },
      line: ['on · 1:50 left', 'off 1.1 of 2.0 L', 'EPO given'], buttons: ['Readings', 'End'] },
    { name: 'Chair 6' },
    { name: 'HCV chair 7', who: { name: 'Mohamed Rady', sexAge: 'M 52', day: 1, clinician: 'Dr. Walid Hamza', reason: 'HD · AV graft', urgent: false },
      line: ['on · 1:40 left', 'off 1.4 of 2.5 L'], buttons: ['Readings', 'End'] },
    { name: 'HBV chair 8', closed: true },
  ]
  const due: [string, string, string, string, ReactNode, number | null][] = [
    ['10162', 'Hassan Morsy', '66 M', 'Chair 4', <><Tag tone="warn">not here · due 11:30</Tag><span className="text-muted">last session Sat</span></>, null],
    ['10187', 'Shaimaa Lotfy', '38 F', 'Chair 6', <span className="text-muted">here 13:50 · weighed 61.8 kg</span>, 20],
  ]
  return <App dept={HD} user="Rasha Mounir" tabs={hdTabs} tab="Chairs">
    <ScreenFrame views={views} view="all" onView={noop} filters={shifts}>
      <Board beds={chairs} />
      <p className="text-12 font-medium text-faint">Due this shift · from the schedule</p>
      <Card><ul>{due.map(([n, name, age, chair, said, min]) => <ListRow key={n} number={n} name={name} age={age} minutes={min}
        status={<><span className="font-medium">{chair}</span>{said}</>} actions={<><Button size="xs" variant="outline">Start</Button><Button size="xs" variant="ghost">Missed</Button></>} />)}</ul></Card>
      <p className="text-12 text-faint">The base's board with chairs for beds. Dialysis says the time left, the fluid taken off against the target and the last blood pressure; a fall or a cramp in red.
        Who is due is the pack's own list, read from the standing schedule (not stays yet, so not the base's tiles). Start is the base's Admit here into the patient's scheduled chair,
        with the session begun in the same Done; Missed records a missed session for the doctor's list. End asks the weight after, the BP and the needle sites, then does the base's
        Discharge; Move and Discharge stay for a patient who leaves mid-session (to the ER, home), and Admit here on a free chair for an extra session. Every tile says Day 1 because a
        session is drawn as a short stay in the chair (Q2, asked on the ER board; the other way is a core change letting a visit sit in a chair).</p>
    </ScreenFrame>
  </App>
}

// ── 2 · the session ──
export function HdSession() {
  const times = ['11:40', '12:10', '12:40', '13:10', '13:40', '14:10']
  const rows: GridRow[] = [
    { group: 'Patient', label: 'BP', cells: ['146/84', '138/80', '128/76', { v: '96/58', f: 'low' }, '112/70', ''] },
    { label: 'Pulse', cells: ['82', '80', '84', '98', '88', ''] },
    { group: 'Machine', label: 'Blood flow', unit: 'mL/min', cells: ['300', '300', '300', '250', '300', ''] },
    { label: 'Arterial pressure', unit: 'mmHg', cells: ['−180', '−190', '−190', '−150', '−190', ''] },
    { label: 'Venous pressure', unit: 'mmHg', cells: ['140', '150', '150', '130', '150', ''] },
    { label: 'TMP', unit: 'mmHg', cells: ['60', '70', '80', '40', '70', ''] },
    { label: 'Taken off', unit: 'L', cells: ['0', '0.4', '0.9', '1.2', '1.4', ''] },
    { label: 'Heparin', unit: 'units/h', cells: ['1 000', '1 000', '1 000', '1 000', '1 000', ''] },
  ]
  const before: [string, string, string?][] = [['Weight', '74.9 kg', 'dry 72.0 · 2.9 kg above dry · after Sat 72.4 (gained 2.5)'], ['BP · pulse · temp', '146/84 · 82 · 36.8'], ['Access', 'AV fistula left arm', 'thrill and bruit ✓'], ['To take off', '2.8 L', '2.9 above dry + 0.3 given back at the end and drinks − 0.4 left above dry for safety']]
  const rx: [string, string][] = [['Time', '4 h'], ['Blood flow', '300 mL/min'], ['Dialysate', '500 mL/min'], ['Bath', 'K 2 · Ca 1.5 · HCO₃ 32'], ['Dialyser', 'FX80'],
    ['Heparin', '2 000 units, then 1 000 units/h'], ['Dry weight', '72.0 kg']]
  return <Stay dept={HD} user="Rasha Mounir" who={['Said Abdelaziz', '56 y · M · #10155']} where="On dialysis · Chair 1 · 2:30 of 4:00"
    safety={<span className="text-muted">No known allergies</span>} words={<><Tag>off 1.4 of 2.8 L</Tag><Tag>HBV immune</Tag></>}
    actions={<><Button size="sm">Sign the reading<Kbd className="ms-1">⌘↵</Kbd></Button><Button size="sm" variant="outline">End session</Button></>} wide>
    <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <Card className="grid gap-2 p-3"><Label>Before · 11:35</Label>
          {before.map(([k, v, s]) => <div key={k} className="grid text-13"><span className="flex justify-between gap-2"><span className="text-muted">{k}</span><b className="font-medium text-fg tnum">{v}</b></span>
            {s && <span className="text-12 text-faint">{s}</span>}</div>)}</Card>
        <Card className="grid gap-1 p-3 text-13"><Label>The prescription · Dr. Walid Hamza, 2 Sep</Label>
          {rx.map(([k, v]) => <span key={k} className="flex flex-wrap justify-between gap-x-2"><span className="text-muted">{k}</span><b className="whitespace-nowrap font-medium text-fg tnum">{v}</b></span>)}
          <p className="text-12 text-faint">The patient's standing prescription: the doctor changes it, every session starts from it.</p></Card>
        <Card className="grid gap-1.5 p-3 text-13"><Label>The unit's drugs today</Label>
          <span className="flex flex-wrap items-center gap-1.5"><Chip on variant="check" onClick={noop}>Epoetin 4 000 IU IV</Chip><Chip variant="check" onClick={noop}>Iron sucrose 100 mg IV</Chip>
            <span className="text-12 text-faint">due Mon and Wed · each ticked is the base's given</span></span></Card>
      </div>
      <div className="grid content-start gap-2">
        <Label>Readings · every 30 minutes</Label>
        <Grid times={times} rows={rows} now={5} first="12rem" />
        <Card className="grid gap-2 p-3"><div className="flex flex-wrap items-center gap-2 text-13"><Label>14:10</Label>
          {[['BP', '118/72', 'w-24'], ['Pulse', '86', 'w-14'], ['Blood flow', '300', 'w-14']].map(([k, v, w]) => <span key={k} className="flex items-center gap-1.5"><span className="text-12 text-muted">{k}</span>
            <Input readOnly value={v} className={`h-8 ${w} tnum`} /></span>)}<span className="text-muted">…</span></div>
          <Keys><Kbd>tab</Kbd> across the reading · a blank keeps the machine's last · an event: <span className="font-mono">/event low BP · saline 200 mL · taking off paused 10 min</span></Keys></Card>
        <Callout tone="warn" title="13:10 · BP 96/58, cramps">Saline 200 mL, blood flow down to 250, taking off paused 10 minutes. Back to 112/70 at 13:40. The doctor sees it on the session; no stop.</Callout>
      </div>
    </div>
    <p className="text-12 text-faint">End asks the weight after (72.6 kg: the target was 72.4, dry 72.0 + 0.4, and the 200 mL saline stayed in), the BP and the needle sites, then does the base's Discharge. The session is dialysis's own entry (prescription as given, weights, fluid taken off,
      times); each reading the base's vitals with the machine's numbers beside them (its own type); the drugs are the base's given. TMP is the pressure across the filter. Kt/V and URR come from the month's bloods.</p>
  </Stay>
}

// ── 3 · the schedule ──
export function HdSchedule() {
  const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']
  const chairs = ['Chair 1', 'Chair 2', 'Chair 3', 'Chair 4', 'Chair 5', 'Chair 6', 'HCV chair 7', 'HBV chair 8']
  const pattern: Record<string, [string, string]> = {
    'Chair 1': ['Said Abdelaziz', 'Hala Fikry'], 'Chair 2': ['Nadia Sobhy', 'Omar Bakr'], 'Chair 3': ['Ibrahim Taha', ''], 'Chair 4': ['Hassan Morsy', 'Wael Saber'],
    'Chair 5': ['Fawzia Kamel', 'Samira Adly'], 'Chair 6': ['Shaimaa Lotfy', 'Reda Hussein'], 'HCV chair 7': ['Mohamed Rady', 'Atef Naguib'], 'HBV chair 8': ['', 'Magdy Fahmy'],
  }
  // a one-off change this week: Nadia Sobhy's Wed session moved to Thu, into Chair 3; the pattern stays
  const oneOff: Record<string, ReactNode> = {
    'Chair 2 Wed': <><span className="text-muted line-through">Nadia Sobhy</span> <span className="text-12 text-faint">moved to Thu</span></>,
    'Chair 3 Thu': <><span className="text-fg">Nadia Sobhy</span> <Tag>this week only · from Wed</Tag></> }
  const bloods: [string, ReactNode, ReactNode, 'ok' | 'warn'][] = [['Said Abdelaziz', 'Kt/V 1.38 · URR 71 % · on target', 'Hb 10.6 · K 5.1 · phosphate 5.2 · albumin 3.9', 'ok'],
    ['Nadia Sobhy', 'Kt/V 1.12 · URR 62 % · below target (1.2 · 65 %)', <span className="font-medium text-warn">Hb 8.9 · low ↓</span>, 'warn'],
    ['Ibrahim Taha', 'virology due · every 3 months', 'HBsAg · HCV Ab', 'warn'], ['Fawzia Kamel', 'not drawn yet', 'due Wed, before the session', 'warn']]
  return <App dept={HD} user="Dr. Walid Hamza" tabs={hdTabs} tab="Schedule">
    <ScreenFrame views={[{ id: 'week', label: 'The week', count: 14 }, { id: 'bloods', label: 'Monthly bloods', count: 3, needs: 'warn' }, { id: 'missed', label: 'Missed', count: 1, needs: 'danger' }]}
      view="week" onView={noop} filters={shifts} action={<Button size="sm" variant="outline">Add a patient</Button>}>
      <Card className="overflow-x-auto"><table className="w-full text-13">
        <thead><tr className="border-b border-line"><th className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">Shift 2</th>
          {days.map((d) => <th key={d} className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{d}</th>)}</tr></thead>
        <tbody>{chairs.map((c) => <tr key={c} className="border-t border-line"><td className="px-3 py-2 font-medium text-fg">{c}</td>
          {days.map((d, i) => { const who = pattern[c][i % 2]
            return <td key={d} className="px-3 py-2">{oneOff[`${c} ${d}`] ?? (who ? <span className="text-fg">{who}</span> : c.startsWith('HBV')
              ? <span className="text-12 text-muted">kept for HBV</span> : <button type="button" className="text-12 text-accent">free</button>)}</td> })}</tr>)}</tbody>
      </table></Card>
      <p className="text-12 text-faint">Each row is a chair: one patient on Sat/Mon/Wed, another on Sun/Tue/Thu (twice a week where chairs are short), at this shift. HBV and HCV patients
        in their own chairs (the base's isolation alert shows who belongs there; the nurse decides). A holiday or a one-off change moves one session, not the pattern: Nadia Sobhy's Wed, this week.</p>
      <Label className="pt-1">Monthly bloods · October</Label>
      <Card><ul>{bloods.map(([n, a, b, t]) => <li key={n} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-13 first:border-t-0">
        <span className="w-36 font-medium text-fg">{n}</span><Tag tone={t}>{a}</Tag><span className="text-muted">{b}</span></li>)}</ul></Card>
      <Ask n={13}>The schedule is the dialysis pack's own small table (patient, days, shift, chair), as the pharmacy's stock is: drawn, with a one-off move that leaves the pattern as it is. The other way is the
        bookings pack's sessions, which book one visit at a time: each session a separate visit, and the weekly pattern itself kept nowhere.</Ask>
    </ScreenFrame>
  </App>
}
