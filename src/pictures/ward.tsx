// The shared ward-nursing pack's pictures (2026-10-08, proposed by Claude, awaiting the owner): who ticks what, the ward's board, the
// drug round, the treatment sheet and /rx in a stay, obs with NEWS2, fluid balance, handover, the discharge letter, its settings.
// Ticked by the ward, the ER, ICU, CCU and the labour ward (stays.tsx holds the parts every one of them draws).
import { Clock, Printer } from 'lucide-react'
import { Badge, Button, Callout, Card, Chip, Input, Kbd, ScreenFrame, Sparkline, Tag, Textarea, cn, type ScreenView, type Tone } from '@core/ui'
import { App, Arabic, Label } from './kit'
import { Keys, Line, Under } from './order'
import { Ask, Board, Grid, Stay, noop, type Bed, type GridRow } from './stays'

const WARD = 'Medical Ward'
const NURSE = 'Nour Adel'
const wardTabs = ['Beds', 'Drug round', 'Handover']
const penicillin = <Badge tone="danger">Penicillin · severe</Badge>
const HF = ['Mahmoud Fekry', '70 y · M · #10068'] as [string, string]
const KM = 'Dr. Khaled Mansour'

// ── 0 · who ticks what ──
export function StaysMap() {
  const packs = ['Ward nursing', 'Emergency', 'Critical care', 'ObGyn · labour', 'Dialysis']
  const rows: [string, string, (string | null)[]][] = [
    ['Medical Ward, Surgical Ward', 'beds', ['✓', null, null, null, null]],
    ['Emergency', 'cubicles + resus', ['✓', '✓', null, null, null]],
    ['ICU', 'beds', ['✓', null, 'ICU setup', null, null]],
    ['CCU', 'beds', ['✓', null, 'CCU setup', null, null]],
    ['Labour ward & postnatal', 'delivery beds, beds, cots', ['✓', null, null, '✓', null]],
    ['Dialysis unit', 'chairs', [null, null, null, null, '✓']],
  ]
  const brings: [string, string][] = [
    ['Ward nursing (shared)', 'The drug round and the treatment sheet · observations with NEWS2 (in the labour ward and postnatal, the obgyn pack\'s MEOWS in its place) and when the next are due · fluid balance · handover · the discharge letter. Its words on each tile\'s one line (NEWS2, obs due, a dose late, the balance); on the ICU and CCU tiles it says nothing, the hourly chart speaks there. Give and Obs on the ward\'s tiles; where a specialty pack comes first in the department\'s order, its two buttons take the tile (rule 4: two in all) and Give and Obs are in the stay and the Drug round tab.'],
    ['Emergency', 'Triage at the door (5 levels, the time to the doctor) · the board\'s waiting list (not triaged first, then by level) · door-to-doctor time · where the patient goes (home, a ward, ICU, theatre, another hospital) · police case.'],
    ['Critical care', 'The hourly chart (vitals, ventilator, infusions, in and out in one column per hour) · infusions titrated · SOFA each morning · the daily goals. CCU: the rhythm row, chest pain, heparin by aPTT, the pain-to-needle times.'],
    ['ObGyn · labour', 'The labour board\'s line (G/P, weeks, cervix, hours) · the partograph with its alert and action lines · the birth (mode, Apgar, blood loss) · the baby\'s own record · MEOWS after birth.'],
    ['Dialysis', 'The unit by shift and chair · the session (weights, the fluid to take off, machine readings, unit drugs) · the standing schedule (Sat/Mon/Wed…) · HBV and HCV chairs.'],
  ]
  return <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6">
    <p className="text-14 text-muted">Six kinds of department, one board. What every one of them needs is in <b className="font-medium text-fg">one shared pack</b>; each specialty adds only what is its own.
      Ticked per department (§5.1 rule 1), so a ward never sees the partograph and the ICU never sees triage.</p>
    <Card className="overflow-x-auto"><table className="w-full text-13">
      <thead><tr className="border-b border-line"><th className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">Department</th>
        <th className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">Places</th>
        {packs.map((p) => <th key={p} className="px-3 py-2 text-center text-11 font-semibold uppercase tracking-[0.06em] text-faint">{p}</th>)}</tr></thead>
      <tbody>{rows.map(([d, pl, t]) => <tr key={d} className="border-t border-line"><td className="px-3 py-2 font-medium text-fg">{d}</td><td className="px-3 py-2 text-muted">{pl}</td>
        {t.map((x, i) => <td key={i} className="px-3 py-2 text-center">{x ? <span className="text-fg">{x === '✓' ? '✓' : `✓ ${x}`}</span> : <span className="text-faint">—</span>}</td>)}</tr>)}</tbody>
    </table></Card>
    <p className="text-12 text-faint">Pack order, which speaks first on the tile and whose buttons it shows: ER: emergency, ward · ICU and CCU: critical, ward · labour ward: obgyn, ward
      (obgyn's buttons only while she is in labour; after birth, Give and Obs).</p>
    <div className="grid gap-2">{brings.map(([p, w]) => <Card key={p} className="grid gap-1 p-3"><span className="text-14 font-semibold text-fg">{p}</span><span className="text-13 text-muted">{w}</span></Card>)}</div>
    <Card className="grid gap-1 p-3"><span className="text-14 font-semibold text-fg">What stays the base's, untouched</span>
      <span className="text-13 text-muted">The board and its tiles, Admit · Move · Discharge, the stay's chart (Sign, Since yesterday), /v /rx /dx /order, the base's <i>given</i> for every dose,
        scores worked out by the server, results to review. The packs write base entries wherever the base has the idea; their own types only for what it lacks.</span></Card>
    <Ask n={1}>One shared pack for ward nursing, ticked by the ward, the ER, ICU, CCU and the labour ward, plus four small packs on top (emergency; critical care with an ICU and a CCU setup;
      obgyn's labour ward; dialysis)? The other way is each department's pack carrying its own drug round and charts: five copies of the same thing.</Ask>
  </div>
}

// ── 1 · the ward's board ──
export function WardBoard() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All beds', count: 8 }, { id: 'in', label: 'In', count: 5 }, { id: 'free', label: 'Free', count: 2 }, { id: 'closed', label: 'Closed', count: 1 }]
  const beds: Bed[] = [
    { name: 'Bed 1', who: { name: HF[0], sexAge: 'M 70', day: 1, clinician: 'Dr. Ali Hassan', reason: 'heart failure', urgent: false },
      line: ['NEWS2 2', 'obs due 18:00', 'balance −350 mL'], buttons: ['Give', 'Obs'] },
    { name: 'Bed 2' },
    { name: 'Bed 3', who: { name: 'Hoda Samy', sexAge: 'F 63', day: 3, clinician: 'Dr. Ali Hassan', reason: 'pneumonia', urgent: false },
      line: [{ text: 'NEWS2 6', tone: 'warn' }, 'obs due 15:06', { text: '1 dose late', tone: 'danger' }], buttons: ['Give', 'Obs'] },
    { name: 'Bed 4', who: { name: 'Fatma Ali', sexAge: 'F 55', day: 5, clinician: KM, reason: 'DKA', urgent: false },
      line: ['NEWS2 0', { text: 'going home today', tone: 'ok' }], buttons: ['Give', 'Obs'] },
    { name: 'Bed 5', who: { name: 'Sayed Mostafa', sexAge: 'M 66', day: 2, clinician: 'Dr. Ali Hassan', reason: 'sepsis ? urinary', urgent: true },
      line: [{ text: 'NEWS2 7', tone: 'danger' }, 'obs every 30 min', 'Dr. told 13:40'], buttons: ['Give', 'Obs'] },
    { name: 'Bed 6', closed: true },
    { name: 'Bed 7', who: { name: 'Amal Hassan', sexAge: 'F 48', day: 4, clinician: KM, reason: 'cellulitis, diabetes', urgent: false },
      line: ['NEWS2 1', 'insulin due 14:00'], buttons: ['Give', 'Obs'] },
    { name: 'Bed 8' },
  ]
  return <App dept={WARD} user={NURSE} tabs={wardTabs} tab="Beds">
    <ScreenFrame views={views} view="all" onView={noop}>
      <Board beds={beds} />
      <p className="text-12 text-faint">The tiles are the base's, unchanged. The ward pack says one line on each (the last NEWS2 and its colour, when the next obs are due, a dose late, the balance
        where a fluid chart is kept) and adds two buttons: <b className="font-medium text-muted">Give</b> opens this patient's doses due, <b className="font-medium text-muted">Obs</b> the chart with /v ready.</p>
    </ScreenFrame>
  </App>
}

// ── 2 · the drug round ──
type Dose = { bed: string; who: string; drug: string; how: string; at: string; state: 'due' | 'late' | 'given'; facts?: [string, Tone][]; check?: boolean; open?: boolean; by?: string }
function DoseRow({ d }: { d: Dose }) {
  return <li className={cn('border-t border-line first:border-t-0', d.open && 'rail bg-hover')}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-13">
      <span className="w-14 shrink-0 font-mono text-12 text-faint">{d.bed}</span>
      <span className="w-32 shrink-0 truncate font-medium text-fg">{d.who}</span>
      <span className="min-w-0 flex-1"><span className="font-medium text-fg">{d.drug}</span> <span className="text-muted">{d.how}</span></span>
      {d.facts?.map(([w, t]) => <Tag key={w} tone={t}>{w}</Tag>)}
      {d.check && <Tag tone="info">second nurse</Tag>}
      <span className="w-24 shrink-0 text-end text-12 tnum">{d.state === 'late' ? <span className="font-medium text-danger">{d.at} · late</span> : d.state === 'given' ? <span className="text-ok">✓ {d.by}</span> : <span className="text-faint">{d.at}</span>}</span>
      {d.state !== 'given' && <span className="flex gap-1"><Button size="sm" variant={d.open ? 'primary' : 'outline'}>Give</Button><Button size="sm" variant="ghost">Not given</Button></span>}
    </div>
    {d.open && <div className="mx-4 mb-3 grid gap-2 rounded-lg border border-line bg-sunken p-3">
      <div className="flex flex-wrap items-center gap-2 text-13"><Label>Glucose now</Label><Input readOnly value="268" className="h-8 w-20 tnum" /><span className="text-muted">mg/dL · the doctor's scale says</span>
        <b className="text-16 font-semibold text-fg tnum">6 units</b><span className="text-muted">regular insulin SC</span></div>
      <div className="flex flex-wrap items-center gap-2 text-13"><Label>Site</Label>{['Abdomen', 'Thigh', 'Arm'].map((s, i) => <Chip key={s} on={i === 0} onClick={noop}>{s}</Chip>)}</div>
      <div className="flex flex-wrap items-center gap-2 text-13"><Label>Checked with</Label><Chip on onClick={noop}>Dina Samir</Chip><Chip onClick={noop}>Yasmin Ashraf</Chip><Chip onClick={noop}>someone else…</Chip>
        <span className="text-12 text-faint">insulin is on the ward's high-alert list</span></div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm">Given · 6 units<Kbd className="ms-1">↵</Kbd></Button>
        <span className="text-12 text-faint">writes the base's <i>given</i> (dose, route, site, who checked) and the glucose as vitals, in one set</span></div>
    </div>}
  </li>
}
export function WardRound() {
  const views: ScreenView<string>[] = [{ id: 'due', label: 'Due now', count: 6, needs: 'warn' }, { id: 'late', label: 'Late', count: 1, needs: 'danger' }, { id: 'prn', label: 'As needed', count: 3 }, { id: 'given', label: 'Given this round', count: 11 }]
  const doses: Dose[] = [
    { bed: 'Bed 1', who: HF[0], drug: 'Furosemide 40 mg', how: 'IV · three times a day', at: '14:00', state: 'due', facts: [['BP 98/60 at 12:10', 'warn'], ['K 3.3', 'warn']] },
    { bed: 'Bed 3', who: 'Hoda Samy', drug: 'Azithromycin 500 mg', how: 'oral · once a day', at: '08:00', state: 'late' },
    { bed: 'Bed 3', who: 'Hoda Samy', drug: 'Cefuroxime 750 mg', how: 'IV · three times a day', at: '14:00', state: 'due', facts: [['penicillin allergy · doctor signed anyway', 'warn']] },
    { bed: 'Bed 3', who: 'Hoda Samy', drug: 'Heparin 5 000 units', how: 'SC · three times a day', at: '14:00', state: 'due', check: true },
    { bed: 'Bed 5', who: 'Sayed Mostafa', drug: 'Meropenem 1 g', how: 'IV · every 8 hours', at: '14:00', state: 'due' },
    { bed: 'Bed 7', who: 'Amal Hassan', drug: 'Insulin regular', how: 'SC · by the scale', at: '14:00', state: 'due', check: true, open: true },
    { bed: 'Bed 7', who: 'Amal Hassan', drug: 'Metformin 500 mg', how: 'oral · three times a day', at: '14:00', state: 'given', by: 'Nour 14:02' },
  ]
  return <App dept={WARD} user={NURSE} tabs={wardTabs} tab="Drug round">
    <ScreenFrame views={views} view="due" onView={noop} search={<Input placeholder="Bed, name or medicine" className="w-full sm:w-60" readOnly />}
      date={<span className="flex items-center gap-1 text-13 text-muted"><Clock className="size-4" />14:00 round · now 14:06</span>}>
      <Card><ul>{doses.map((d, i) => <DoseRow key={i} d={d} />)}</ul></Card>
      <Keys><Kbd>↑↓</Kbd> a dose <Kbd>↵</Kbd> Give <Kbd>N</Kbd> Not given (refused · fasting · vomiting · not in stock · held by the doctor · away from the ward) <Kbd>⌘↵</Kbd> give every clean dose of this bed</Keys>
      <p className="text-12 text-faint">The round is the doctors' current prescriptions on this ward, at the ward's dose times (a setting: twice a day = 08:00 and 20:00). A clean dose gives in one key; the
        facts beside a dose are shown, never a stop. A dose not given within an hour of its time is late on the board and the round; a dose just given stays at the foot, ticked, and counts in Given this round. Each Give is the base's <i>given</i>; nothing new holds the round.</p>
      <Ask n={4}>A high-alert medicine (insulin, heparin, potassium IV, opioids, chemotherapy; the ward's list) asks who checked it. Given with nobody named, should it land and be flagged for the
        ward's review (drawn), or be refused?</Ask>
    </ScreenFrame>
  </App>
}

// ── 3 · the treatment sheet, and the doctor's /rx in a stay ──
export function WardSheet() {
  const times = ['02', '06', '08', '12', '14', '18', '20', '22']
  const rows: GridRow[] = [
    { group: 'Regular', label: 'Cefuroxime 750 mg IV', unit: '3 times a day', cells: [undefined, { done: 'Samah' }, undefined, undefined, { due: true }] },
    { label: 'Azithromycin 500 mg oral', unit: 'once a day', cells: [undefined, undefined, { late: '6 h' }] },
    { label: 'Paracetamol 1 g IV', unit: 'every 6 hours', cells: [{ done: 'Samah' }, undefined, { done: 'Nour' }, undefined, { due: true }, undefined, undefined, undefined] },
    { label: 'Heparin 5 000 units SC', unit: '3 times a day', cells: [undefined, { done: 'Samah' }, undefined, undefined, { due: true }] },
    { label: 'Omeprazole 40 mg IV', unit: 'once a day', cells: [undefined, undefined, { not: 'not in stock' }] },
    { group: 'As needed', label: 'Ondansetron 4 mg IV', unit: 'max 3 a day', cells: [{ done: '03:10 Samah' }] },
    { group: 'Fluids', label: 'Normal saline 1 L IV', unit: 'over 12 h', cells: [{ done: 'bag 2' }, undefined, undefined, undefined, { due: true }] },
  ]
  return <Stay dept={WARD} user="Dr. Ali Hassan" who={['Hoda Samy', '63 y · F · #10044']} where="Admitted · Bed 3 · day 3" safety={penicillin}
    words={<><Tag tone="warn">NEWS2 6</Tag><Tag tone="danger">1 dose late</Tag></>} wide>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2"><Label>Treatment sheet · today</Label><Chip shape="pill" on onClick={noop}>Today</Chip><Chip shape="pill" onClick={noop}>Yesterday</Chip><Chip shape="pill" onClick={noop}>The whole stay</Chip></div>
        <Grid times={times} rows={rows} now={4} first="17rem" />
        <p className="text-12 text-faint">The sheet the ward keeps on paper today (drug × hour), drawn from the prescriptions and every <i>given</i>. A dose opens its entry: who gave it, when, the site,
          who checked. Stopped medicines fold under the sheet with the day they stopped.</p>
      </div>
      <Card className="grid content-start gap-2 p-3">
        <Label>The doctor prescribes in the stay</Label>
        <Line>/rx metronidazole 500 iv tds 7d</Line>
        <Under>
          <p className="text-13 text-fg">Metronidazole 500 mg IV · three times a day · 7 days</p>
          <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="text-muted">On this ward: 06:00 · 14:00 · 22:00</span></div>
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-13 text-fg">First dose</span><Chip on onClick={noop}>Now, then 22:00</Chip><Chip onClick={noop}>At 14:00</Chip><Chip onClick={noop}>At 22:00</Chip></div>
          <Keys><Kbd>tab</Kbd> takes the first · <span className="font-mono">stat</span> on the line gives one dose now and nothing after</Keys>
        </Under>
        <p className="text-12 text-faint">Sign sends it to the round at once: the nurse sees “Metronidazole · first dose now” at the top of Due now. The pharmacy gets it as today.</p>
      </Card>
    </div>
  </Stay>
}

// ── 4 · observations and NEWS2 ──
export function WardObs() {
  const parts: [string, string, number][] = [['Breathing', '22 /min', 2], ['SpO₂ · scale 1', '94 %', 1], ['Air or oxygen', 'air', 0], ['Systolic BP', '105', 1], ['Pulse', '104', 1], ['ACVPU', 'alert', 0], ['Temperature', '38.4', 1]]
  return <Stay dept={WARD} user={NURSE} who={['Hoda Samy', '63 y · F · #10044']} where="Admitted · Bed 3 · day 3" safety={penicillin} words={<Tag tone="warn">NEWS2 6</Tag>}>
    <Card className="grid gap-2 p-3">
      <Line>/v 105/68 104 22 38.4 spo2 94</Line>
      <Under tone="warn">
        <div className="flex flex-wrap items-center gap-2 text-13"><span className="text-fg">NEWS2 needs two more answers</span>
          <span className="text-muted">Air or oxygen</span><Chip on onClick={noop}>Air</Chip><Chip onClick={noop}>Oxygen…</Chip>
          <span className="text-muted">ACVPU</span><Chip on onClick={noop}>Alert</Chip><Chip onClick={noop}>New confusion</Chip><Chip onClick={noop}>Voice</Chip><Chip onClick={noop}>Pain</Chip><Chip onClick={noop}>Unresponsive</Chip></div>
        <div className="grid gap-0.5 rounded-md bg-surface p-2 text-13 tnum sm:grid-cols-2">{parts.map(([k, v, p]) =>
          <span key={k} className="flex justify-between gap-2 px-1"><span className="text-muted">{k}</span><span className="text-fg">{v} <span className={cn('ms-1 inline-block w-4 text-end', p ? 'font-medium text-warn' : 'text-faint')}>{p}</span></span></span>)}</div>
        <p className="flex flex-wrap items-center gap-2 text-14"><b className="text-18 font-semibold text-warn tnum">NEWS2 6</b><span className="text-warn">medium · urgent response</span>
          <span className="text-12 text-faint">worked out by the server · NEWS2, RCP 2017</span></p>
        <p className="text-12 text-faint">SpO₂ scale 1 unless a doctor has prescribed an oxygen target of 88–92 % in this stay (COPD with high CO₂): then scale 2, said on the line.</p>
      </Under>
      <Callout tone="warn" title="Tell Dr. Ali Hassan now · obs every hour">The ward's response for 5–6. A notice only, as the lab's critical value: Sign writes the vitals and the score; the next obs are due 15:06.</Callout>
      <div className="flex flex-wrap items-center gap-3 text-13"><span className="text-muted">NEWS2 this stay</span><Sparkline points={[{ at: 1, value: 2 }, { at: 2, value: 3 }, { at: 3, value: 3 }, { at: 4, value: 4 }, { at: 5, value: 6 }]} width={120} height={24} label="NEWS2" />
        <span className="text-12 text-faint">2 → 6 since yesterday</span></div>
    </Card>
    <Ask n={5}>Every ward /v with the six numbers asks air or oxygen and ACVPU and writes NEWS2 with the vitals (drawn). Should air/oxygen and ACVPU become two base vitals keys (a base
      change; ICU, ER and labour use them too), or stay only inside the score (no change, but not charted on their own)? The response by score is the ward's setting.</Ask>
  </Stay>
}

// ── 5 · fluid balance ──
export function WardFluids() {
  const times = ['08–14', '14–20', '20–08']
  const rows: GridRow[] = [
    { group: 'In', label: 'IV fluids', unit: 'mL', cells: ['500', '250'], total: '750' },
    { label: 'By mouth', unit: 'mL', cells: ['400', '150'], total: '550' },
    { group: 'Out', label: 'Urine', unit: 'mL', cells: ['1 250', '900'], total: '2 150' },
    { label: 'Vomit', unit: 'mL', cells: ['', ''], total: '—' },
    { group: 'Balance', label: 'In − out', unit: 'mL', cells: [{ v: '−350' }, { v: '−500' }], total: <span className="text-fg">−850 <span className="text-12 font-normal text-muted">· target −1 000</span></span> },
    { label: 'Urine', unit: 'mL/kg/h', cells: ['2.5', '1.9'] },
  ]
  return <Stay dept={WARD} user={NURSE} who={HF} where="Admitted · Bed 1 · day 1" safety={<span className="text-muted">No known allergies</span>}
    words={<Tag>balance −850 since 08:00</Tag>}>
    <Card className="grid gap-2 p-3">
      <Line>/out urine 900</Line>
      <Under><p className="text-13 text-fg">Urine 900 mL · 14:00–19:40 · since the last at 14:00</p>
        <Keys><span className="font-mono">/in 250 iv ns · /in 150 oral · /out urine 300 · /out drain 50 · /out ng 200 · /out vomit</span></Keys></Under>
    </Card>
    <div className="flex flex-wrap items-center gap-2"><Label>Fluid balance · today from 08:00 · now 19:40</Label><span className="text-12 text-muted">target: 1 L negative a day (Dr. Ali Hassan) · weight 82 kg today, 83.4 on admission</span></div>
    <Grid times={times} rows={rows} now={1} totals="Today" first="10rem" />
    <p className="text-12 text-faint">Each line is one measure of the ward pack's own type (in or out, what, how much, the time it covers); an IV bag the round gives counts as in hour by hour at its
      rate, so a bag running across two shifts is split between them. The day runs 08:00 to 08:00, by the ward's shifts. Only for patients a doctor or nurse starts a chart for
      (Start fluid chart, in the card Obs opens); from then the board shows the balance.</p>
  </Stay>
}

// ── 6 · handover ──
export function WardHandover() {
  const beds: [string, string, string, [string, Tone][], string, string][] = [
    ['Bed 1', HF[0], 'M 70 · day 1 · heart failure', [['NEWS2 2', 'neutral'], ['−350 mL of −1 L', 'neutral'], ['K 3.3', 'warn']],
      'Passing a lot of urine, less breathless. Potassium low, doctor added oral KCl.', ''],
    ['Bed 3', 'Hoda Samy', 'F 63 · day 3 · pneumonia', [['NEWS2 6', 'warn'], ['azithromycin late', 'danger'], ['chest X-ray today', 'neutral']],
      'Spiking 38.4, more breathless than this morning; Dr. Ali saw her 13:40, blood cultures sent. Chest X-ray done 10:20, film only: Dr. Ali to read it.', 'Repeat obs 15:06; remind Dr. Ali of the film; she asked to call her son.'],
    ['Bed 5', 'Sayed Mostafa', 'M 66 · day 2 · sepsis ? urinary', [['NEWS2 7', 'danger'], ['obs every 30 min', 'warn'], ['DNR', 'warn']], '', ''],
  ]
  return <App dept={WARD} user={NURSE} tabs={wardTabs} tab="Handover">
    <ScreenFrame views={[{ id: 'all', label: 'All beds', count: 5 }, { id: 'mine', label: 'My beds', count: 3 }]} view="mine" onView={noop}
      date={<span className="text-13 text-muted">Day → evening · 14:00</span>}>
      <Card><ul>{beds.map(([b, n, l, f, s, todo]) => <li key={b} className="grid gap-2 border-t border-line px-4 py-3 first:border-t-0">
        <div className="flex flex-wrap items-center gap-2 text-13"><span className="w-14 font-mono text-12 text-faint">{b}</span><span className="font-medium text-fg">{n}</span><span className="text-muted">{l}</span>
          <span className="ms-auto flex flex-wrap gap-1">{f.map(([w, t]) => <Tag key={w} tone={t}>{w}</Tag>)}</span></div>
        <div className="grid gap-1.5 sm:ps-16">
          <Textarea readOnly minRows={1} value={s} placeholder="What happened this shift — situation and what you found" />
          <Input readOnly value={todo} placeholder="For the next shift: what to do, what to chase" />
        </div>
      </li>)}</ul></Card>
      <Keys><Kbd>tab</Kbd> the next box · <Kbd>⌘↵</Kbd> sign the handover (each bed's lines a note in its stay) · the tags come from the record, nobody types them</Keys>
      <Ask n={11}>Should the handover be the base's <i>note</i> with a new kind, “handover” (a small base change; it shows in the stay's day and the next shift reads it here): drawn? The
        other way: the ward pack's own entry type (no base change), shown on this screen and in the ward pack's section of the chart, but not among the stay's notes.</Ask>
    </ScreenFrame>
  </App>
}

// ── 7 · going home: the discharge letter ──
export function WardDischarge() {
  const meds: [string, string, 'continue' | 'new' | 'stop' | 'changed'][] = [
    ['Amoxicillin-clavulanate', 'the urine culture: cefuroxime instead', 'stop'], ['Cefuroxime 500 mg', 'twice a day · 5 more days', 'new'],
    ['Insulin mixed 70/30', '20 units before breakfast, 10 before dinner · pen, taught on the ward', 'new'], ['Metformin 500 mg', 'three times a day', 'continue'], ['Amlodipine 5 mg', 'once a day (was 10 mg)', 'changed'],
  ]
  const tone = { continue: 'neutral', new: 'ok', stop: 'danger', changed: 'warn' } as const
  return <Stay dept={WARD} user={KM} who={['Fatma Ali', '55 y · F · #10075']} where="Admitted · Bed 4 · day 5" safety={<span className="text-muted">No known allergies</span>}
    actions={<Button size="sm" variant="outline" className="ring-2 ring-accent">Discharge</Button>}>
    <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
      <div className="flex flex-wrap items-center gap-2"><Label>Discharge · to</Label>{['Home', 'Another facility', 'Left against advice', 'Died', 'Other'].map((d, i) => <Chip key={d} on={i === 0} onClick={noop}>{d}</Chip>)}</div>
      <div className="grid gap-1"><Label>Diagnoses this stay</Label><p className="text-14 text-fg">Diabetic ketoacidosis, resolved · Type 2 diabetes · Urinary tract infection</p></div>
      <div className="grid gap-1"><Label>What was done</Label><Textarea readOnly minRows={2} value="Insulin infusion 26 h, then subcutaneous. Ketones clear day 2. Urine culture E. coli, sensitive to cefuroxime." /></div>
      <div className="grid gap-1"><Label>Medicines for home</Label>
        <ul className="grid gap-1">{meds.map(([m, h, s]) => <li key={m} className="flex flex-wrap items-center gap-2 text-13"><Tag tone={tone[s]}>{s}</Tag><span className="font-medium text-fg">{m}</span><span className="text-muted">{h}</span></li>)}</ul>
        <p className="text-12 text-faint">The current list as the ward left it: each kept, stopped or changed is the base's medication, as in any visit. New ones go to the pharmacy to collect.</p></div>
      <div className="flex flex-wrap items-center gap-2"><Label>Follow-up</Label><Chip on onClick={noop}>Diabetes clinic · 2 weeks</Chip><span className="text-12 text-faint">booked by the bookings pack where the clinic uses it</span></div>
      <div className="grid gap-1"><Label>For the patient</Label><Arabic className="rounded-lg bg-sunken px-3 py-2">قيسي السكر قبل الفطار وقبل العشا، وماتوقفيش الأنسولين حتى لو مش قادرة تاكلي. ارجعي المستشفى على طول لو حصل ترجيع أو دوخة أو السكر عدّى ٣٠٠.</Arabic></div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button>Sign · discharge home<Kbd className="ms-1">⌘↵</Kbd></Button><Button variant="outline"><Printer />Print the letter</Button>
        <span className="text-12 text-faint">One set: the letter (the base's note, kind letter), the medicines, the discharge. The bed is free on the board at once.</span></div>
    </Card>
    <Ask n={12}>Should the discharge letter be a new printout (A4, the clinic's header, Arabic and English): drawn? Printing is approved for labels, receipts and prescriptions only.
      The other way: no new printout; the letter stays in the record (the base's note) and the patient leaves with the prescription printout.</Ask>
  </Stay>
}

// ── 8 · the ward pack's settings ──
export function WardSettings() {
  const times: [string, string][] = [['Once a day', '08:00'], ['Twice a day', '08:00 · 20:00'], ['Every 12 hours', '08:00 · 20:00'], ['Three times a day', '06:00 · 14:00 · 22:00'],
    ['Every 8 hours', '06:00 · 14:00 · 22:00'], ['Four times a day', '06:00 · 12:00 · 18:00 · 00:00'], ['Every 6 hours', '02:00 · 08:00 · 14:00 · 20:00']]
  const news: [string, string, string, Tone][] = [['0', 'every 12 hours', '—', 'neutral'], ['1–4', 'every 4–6 hours', 'the nurse in charge', 'neutral'], ['3 in any one sign', 'every hour', 'the doctor', 'warn'], ['5–6', 'every hour', 'the doctor now', 'warn'], ['7 or more', 'every 30 min, or on a monitor', 'the doctor now · think ICU', 'danger']]
  return <App dept="Settings" user="Dr. Ali Hassan">
    <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-4">
      <p className="text-13 text-muted">Settings → Departments → <b className="font-medium text-fg">{WARD}</b> · Ward nursing</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="grid content-start gap-2 p-4"><span className="text-14 font-semibold text-fg">Dose times</span>
          <table className="text-13"><tbody>{times.map(([f, t]) => <tr key={f} className="border-t border-line first:border-t-0"><td className="py-1.5 text-muted">{f}</td><td className="py-1.5 text-end font-medium text-fg tnum">{t}</td></tr>)}</tbody></table>
          <p className="text-12 text-faint">A dose is late an hour after its time (a number, 30–180 min).</p></Card>
        <Card className="grid content-start gap-2 p-4"><span className="text-14 font-semibold text-fg">NEWS2 · the response</span>
          <table className="text-13"><thead><tr className="text-11 font-semibold uppercase tracking-[0.06em] text-faint"><th className="py-1 text-start">Score</th><th className="py-1 text-start">Obs</th><th className="py-1 text-start">Tell</th></tr></thead>
            <tbody>{news.map(([s, o, t, tone]) => <tr key={s} className="border-t border-line"><td className="py-1.5"><Tag tone={tone}>{s}</Tag></td><td className="py-1.5 text-muted">{o}</td><td className="py-1.5 text-fg">{t}</td></tr>)}</tbody></table>
          <p className="text-12 text-faint">The score itself is the server's table (Settings → Scores, signed off by a doctor); only the response is the ward's.</p></Card>
        <Card className="grid content-start gap-2 p-4"><span className="text-14 font-semibold text-fg">High-alert medicines · a second nurse checks</span>
          <div className="flex flex-wrap gap-1.5">{['Insulin', 'Heparin', 'Enoxaparin', 'Potassium chloride IV', 'Morphine', 'Pethidine', 'Tramadol', 'Chemotherapy'].map((m) => <Chip key={m} on variant="check" onClick={noop}>{m}</Chip>)}<Chip onClick={noop}>+ add</Chip></div>
          <p className="text-12 text-faint">By active ingredient or ATC class, so every brand counts.</p></Card>
        <Card className="grid content-start gap-2 p-4"><span className="text-14 font-semibold text-fg">Shifts</span>
          <p className="text-13 text-fg tnum">08:00 · 14:00 · 20:00</p>
          <p className="text-12 text-faint">The handover's times, the fluid chart's columns, the drug round's day (08:00 to 08:00).</p></Card>
      </div>
    </div>
  </App>
}
