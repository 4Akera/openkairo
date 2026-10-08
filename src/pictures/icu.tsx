// The critical care pack's pictures (2026-10-08, proposed by Claude, awaiting the owner): one pack for ICU and CCU, two starter setups.
// The board's line (ventilated, the infusions, MAP, SOFA), the hourly chart (one column per hour: vitals, ventilator, infusions, in
// and out), the morning's SOFA and daily goals, and the CCU's chart (rhythm, chest pain, ST, heparin by aPTT, the pain-to-needle times).
import { Button, Callout, Card, Chip, Input, Kbd, ScreenFrame, Tag, Textarea, cn, type ScreenView } from '@core/ui'
import { App, Label } from './kit'
import { Keys } from './order'
import { Ask, Board, Grid, Stay, noop, type Bed, type GridRow } from './stays'

const ICU = 'ICU'
const icuTabs = ['Beds', 'Drug round', 'Handover']
const hours = ['08', '09', '10', '11', '12', '13', '14']
/** a setting carried on from the hour before, not typed again */
const kept = (v: string) => <span className="text-faint">{v}</span>
const keptNote = <p className="text-12 text-faint">Faint: a setting carried on from the hour before, not typed again.</p>
const nabil: [string, string] = ['Nabil Farag', '62 y · M · #10147 · 78 kg']
const nabilWords = <><Tag tone="info">Ventilated d3</Tag><Tag tone="warn">noradrenaline 0.15 mcg/kg/min</Tag></>

// ── 1 · the ICU's board ──
export function IcuBoard() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All beds', count: 6 }, { id: 'in', label: 'In', count: 5 }, { id: 'free', label: 'Free', count: 1 }]
  const beds: Bed[] = [
    { name: 'ICU 1', who: { name: 'Nabil Farag', sexAge: 'M 62', day: 3, clinician: 'Dr. Hany Salem', reason: 'septic shock, pneumonia', urgent: false },
      line: [{ text: 'Ventilated d3', tone: 'info' }, { text: 'noradrenaline 0.15', tone: 'warn' }, 'MAP 67', 'SOFA 11'], buttons: ['ICU chart', 'Goals'] },
    { name: 'ICU 2', who: { name: 'Samia Ibrahim', sexAge: 'F 46', day: 1, clinician: 'Dr. Hany Salem', reason: 'after laparotomy', urgent: false },
      line: ['Extubated 10:20', 'MAP 78', 'SOFA 3', { text: 'goals not done', tone: 'warn' }], buttons: ['ICU chart', 'Goals'] },
    { name: 'ICU 3', who: { name: 'Samy Ragab', sexAge: 'M 47', day: 2, clinician: 'Dr. Rasha Kamal', reason: 'DKA, AKI', urgent: false },
      line: ['On air', 'insulin 4 units/h', { text: 'urine 0.4 mL/kg/h', tone: 'warn' }, 'SOFA 4'], buttons: ['ICU chart', 'Goals'] },
    { name: 'ICU 4', who: { name: 'Hamdy Ali', sexAge: 'M 74', day: 9, clinician: 'Dr. Rasha Kamal', reason: 'stroke, aspiration', urgent: false },
      line: [{ text: 'Ventilated d9', tone: 'info' }, 'trial off today', 'SOFA 6', { text: '1 dose late', tone: 'danger' }], buttons: ['ICU chart', 'Goals'] },
    { name: 'ICU 5' },
    { name: 'ICU 6', who: { name: 'Rania Mostafa', sexAge: 'F 31', day: 2, clinician: 'Dr. Hany Salem', reason: 'eclampsia', urgent: false },
      line: ['On air', 'MgSO₄ 1 g/h', 'BP 152/98', 'SOFA 2'], buttons: ['ICU chart', 'Goals'] },
  ]
  return <App dept={ICU} user="Dr. Hany Salem" tabs={icuTabs} tab="Beds">
    <ScreenFrame views={views} view="all" onView={noop}>
      <Board beds={beds} />
      <p className="text-12 text-faint">The same base board as the ward's. The line is critical care's words first (ventilated and the day, the infusion that holds the pressure,
        MAP, the morning's SOFA), then the ward pack's, which speaks here only when a dose is late (ICU 4). Two pack buttons a tile, in the ICU's pack order: critical care
        is first here, so ICU chart and Goals take them; the ward pack's Give is on the Drug round tab.</p>
    </ScreenFrame>
  </App>
}

// ── 2 · the hourly chart ──
export function IcuChart() {
  const rows: GridRow[] = [
    { group: 'Vitals', label: 'Heart rate', cells: ['112', '108', '110', '104', '98', '96', ''] },
    { label: 'MAP', unit: 'mmHg', cells: [{ v: '58', f: 'low' }, { v: '61', f: 'low' }, '66', '68', '70', '67', ''] },
    { label: 'SpO₂', unit: '%', cells: ['93', '94', '95', '95', '96', '95', ''] },
    { label: 'Temperature', cells: ['38.6', '', '', '38.1', '', '', ''] },
    { label: 'CVP', unit: 'cmH₂O', cells: ['8', '', '', '10', '', '', ''] },
    { label: 'GCS · RASS', cells: ['E2 VT M4 · −4', '', '', 'E3 VT M5 · −3', '', '', ''] },
    { group: 'Ventilator', label: 'Mode', cells: ['VC', kept('VC'), kept('VC'), kept('VC'), kept('VC'), kept('VC'), ''] },
    { label: 'FiO₂ · PEEP', cells: ['0.6 · 10', kept('0.6 · 10'), '0.5 · 10', kept('0.5 · 10'), '0.45 · 8', kept('0.45 · 8'), ''] },
    { label: 'Vt · rate', cells: ['420 · 18', kept('420 · 18'), kept('420 · 18'), kept('420 · 18'), kept('420 · 18'), kept('420 · 18'), ''] },
    { group: 'Infusions', label: 'Noradrenaline', unit: 'mcg/kg/min', cells: ['0.25', kept('0.25'), '0.2', kept('0.2'), '0.15', kept('0.15'), ''] },
    { label: 'Propofol', unit: 'mg/h', cells: ['120', kept('120'), kept('120'), '100', kept('100'), kept('100'), ''] },
    { label: 'Fentanyl', unit: 'mcg/h', cells: ['75', kept('75'), kept('75'), kept('75'), kept('75'), kept('75'), ''] },
    { label: 'Insulin', unit: 'units/h', cells: ['2', kept('2'), kept('2'), '3', kept('3'), kept('3'), ''] },
    { group: 'In and out', label: 'In', unit: 'mL', cells: ['145', '145', '140', '140', '210', '140', ''] },
    { label: 'Urine', unit: 'mL', cells: [{ v: '20', f: 'low' }, { v: '25', f: 'low' }, '40', '45', '50', '55', ''] },
    { label: 'Balance', unit: 'since 08', cells: ['+125', '+245', '+345', '+440', '+600', '+685', ''] },
    { group: 'Bloods', label: 'Glucose', unit: 'mg/dL', cells: [{ v: '212', f: 'high' }, '', '', { v: '186', f: 'high' }, '', '', ''] },
    { label: 'Lactate', cells: [{ v: '4.1', f: 'high' }, '', '', { v: '2.6', f: 'high' }, '', '', ''] },
    { group: 'Signed', label: 'By', cells: ['MS', 'MS', 'MS', 'MS', 'MS', 'MS', { due: true }] },
  ]
  const field = (k: string, v: string, w: string) => <span className="flex items-center gap-1"><span className="text-12 text-muted">{k}</span><Input readOnly value={v} className={cn('h-8 tnum', w)} /></span>
  return <Stay dept={ICU} user="Mariam Saad" who={nabil} where="Admitted · ICU 1 · day 3"
    safety={<span className="text-muted">No known allergies</span>} words={nabilWords} wide>
    <div className="flex flex-wrap items-center gap-2"><Label>ICU chart · hourly</Label><Chip shape="pill" on onClick={noop}>Since 08:00</Chip><Chip shape="pill" onClick={noop}>Last 24 h</Chip>
      <Chip shape="pill" onClick={noop}>By day</Chip><span className="ms-auto text-12 text-faint">the 14:00 column is being typed</span></div>
    <Grid times={hours} rows={rows} now={6} first="11rem" />
    {keptNote}
    <Card className="grid gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-13"><Label>14:00</Label>{field('HR', '96', 'w-16')}{field('BP', '118/56 (77)', 'w-28')}{field('SpO₂', '96', 'w-16')}
        <span className="text-muted">…</span>
        <span className="ms-2 rounded-md bg-sunken px-2 py-1 text-fg">Noradrenaline <b className="tnum">0.15 → 0.1</b> mcg/kg/min · 5.9 mL/h (4 mg in 50 mL) · target MAP ≥ 65</span></div>
      <Keys><Kbd>tab</Kbd> down the column · a blank keeps last hour's setting · <Kbd>⌘↵</Kbd> sign the hour (vitals, ventilator, rates, in and out: one set)</Keys>
    </Card>
    <Ask n={7}>One column per hour is one set: the base's vitals, the ventilator's settings and each infusion's rate (critical care's own types, a rate change continuing its infusion),
      in and out (the ward pack's), signed once by the nurse (the last row). The rate in mL/h is worked out from the dose, the weight and the bag the doctor chose. Drawn as the
      ICU's paper chart, hours across. The other way: each value its own entry, signed as it is typed (a rate change at 10:40 on its own), and the chart only draws them by hour.</Ask>
  </Stay>
}

// ── 3 · the morning: SOFA and the daily goals ──
export function IcuGoals() {
  const sofa: [string, string, number][] = [['Breathing · PaO₂/FiO₂', '168 on the ventilator', 3], ['Platelets', '96', 2], ['Bilirubin', '1.4', 1],
    ['Blood pressure', 'noradrenaline 0.25 at 08:00', 4], ['GCS', 'sedated · 15 before sedation', 0], ['Kidney · creatinine', '1.6 · urine 860 mL / 24 h', 1]]
  const goals: [string, string[], number][] = [
    ['Feeding', ['NG feed 40 mL/h', 'nil by mouth', 'eating'], 0], ['Analgesia', ['pain controlled', 'needs more'], 0], ['Sedation · RASS target', ['−2 to 0', '−4 · deep'], 0],
    ['Clot prevention', ['enoxaparin', 'stockings', 'not yet · bleeding'], 0], ['Head up 30°', ['yes', 'no'], 0], ['Stomach protection', ['yes', 'not needed'], 0],
    ['Glucose 140–180', ['on target', 'insulin infusion'], 1], ['Bowels', ['opened', 'not since day 1'], 1],
    ['Central line d3', ['keep', 'remove'], 0], ['Urinary catheter d3', ['keep', 'remove'], 0], ['Arterial line d3', ['keep', 'remove'], 0],
    ['Antibiotics · meropenem d3, cultures back', ['keep', 'narrow', 'stop'], 1], ['Trial off the ventilator', ['not today · FiO₂ 0.6, PEEP 10', 'today'], 0],
  ]
  return <Stay dept={ICU} user="Dr. Hany Salem" who={nabil} where="Admitted · ICU 1 · day 3"
    safety={<span className="text-muted">No known allergies</span>} words={nabilWords} wide>
    <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="grid content-start gap-2 p-3">
        <Label>SOFA · this morning</Label>
        {sofa.map(([k, v, p]) => <div key={k} className="flex items-baseline justify-between gap-2 text-13"><span className="text-muted">{k}</span><span className="text-end text-fg tnum">{v} <b className={cn('ms-1 inline-block w-4 text-end', p ? 'text-warn' : 'text-faint')}>{p}</b></span></div>)}
        <p className="flex items-baseline gap-2 border-t border-line pt-2"><b className="text-22 font-semibold text-fg tnum">11</b><span className="text-13 text-muted">yesterday 12 · admission 13</span></p>
        <p className="text-12 text-faint">Filled from the record (the worst value of the last 24 h); the doctor checks each and the server adds it up (SOFA, 1996, a declared table).</p>
      </Card>
      <Card className="grid content-start gap-2 p-3">
        <Label>Daily goals · ward round 09:30</Label>
        <ul className="grid gap-1.5">{goals.map(([g, opts, on]) => <li key={g} className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-44 shrink-0 text-fg">{g}</span>
          {opts.map((o, i) => <Chip key={o} on={i === on} onClick={noop}>{o}</Chip>)}</li>)}</ul>
        <Textarea readOnly dense minRows={2} value="Goals today: MAP ≥ 65 off noradrenaline by tonight; negative 500 mL; chase sputum culture; family meeting 17:00." />
      </Card>
    </div>
    <div className="flex flex-wrap items-center gap-2"><Button size="sm">Sign the round<Kbd className="ms-1">⌘↵</Kbd></Button>
      <span className="text-12 text-faint">signs SOFA 11 and the goals together; the board says “goals not done” until then</span></div>
    <Callout tone="neutral" title="The lines and their days">Central line right IJ, urinary catheter, arterial line: each is the base's procedure (inserted, removed), so the day counts itself,
      and the goals ask about each line every morning.</Callout>
    <Ask n={8}>SOFA every morning and the daily goals (the FAST HUGS BID list, the ICU's own words) as one round card, signed once: drawn. The other way: SOFA as a score of its own
      on the stay and the goals as a separate checklist, each signed apart. APACHE II on admission is a second score, later.</Ask>
  </Stay>
}

// ── 4 · CCU: the same pack, its own rows ──
export function CcuChart() {
  const rows: GridRow[] = [
    { group: 'Heart', label: 'Rhythm', cells: ['SR', 'SR', 'SR · VEs', 'AF · new', 'AF', 'AF', ''] },
    { label: 'Heart rate', cells: ['78', '82', '84', { v: '128', f: 'high' }, '104', '96', ''] },
    { label: 'BP', unit: 'mmHg', cells: ['128/74', '122/70', '118/72', { v: '98/60', f: 'low' }, '110/66', '114/70', ''] },
    { label: 'Chest pain', unit: '0–10', cells: ['2', '0', '0', '3', '0', '0', ''] },
    { label: 'ST', unit: 'fall', cells: ['', '↓ 60% at 90 min', '', 'no new change', '', '', ''] },
    { group: 'Infusions', label: 'Heparin', unit: 'units/h', cells: ['1 000', kept('1 000'), kept('1 000'), kept('1 000'), '1 100', kept('1 100'), ''] },
    { label: 'Nitrate (GTN)', unit: 'mcg/min', cells: ['20', kept('20'), '10', 'off', '', '', ''] },
    { label: 'Amiodarone', unit: 'mg/h', cells: ['', '', '', '300 over 1 h', '37.5', kept('37.5'), ''] },
    { group: 'Bloods', label: 'aPTT', unit: 's', cells: ['', '', '', '', { v: '44', f: 'low' }, '', ''] },
    { label: 'Troponin', unit: 'ng/L', cells: [{ v: '1 840', f: 'high' }, '', '', '', '', '', ''] },
    { label: 'Potassium', unit: 'mmol/L', cells: ['', '', '', { v: '3.6', f: 'low' }, '', '', ''] },
    { label: 'Magnesium', unit: 'mmol/L', cells: ['', '', '', '0.8', '', '', ''] },
  ]
  const times: [string, string, string?, boolean?][] = [['Pain began', '06:10'], ['At the door', '07:30'], ['First ECG', '07:36', '✓ 6 min · target 10', true],
    ['Thrombolysis', '07:58', 'ECG to needle 22 min · door to needle 28 · pain to needle 1 h 48'], ['Into CCU', '08:20'], ['Angiography', 'by 07:58 tomorrow', '2–24 h after lysis']]
  return <Stay dept="CCU" user="Dr. Tarek Nour" who={['Adel Shawky', '58 y · M · #10311 · 84 kg']} where="Admitted · CCU 2 · day 1"
    safety={<span className="text-muted">No known allergies</span>} words={<><Tag tone="warn">AF since 11:00</Tag><Tag>Killip I</Tag></>} wide>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-13"><b className="font-semibold text-fg">Anterior STEMI · tenecteplase</b>
      {times.map(([k, v, s, met]) => <span key={k} className="flex items-baseline gap-1.5 border-s border-line ps-2"><span className="text-muted">{k}</span><b className="font-semibold text-fg tnum">{v}</b>
        {s && <span className={cn('text-12', met ? 'text-ok' : 'text-muted')}>{s}</span>}</span>)}</div>
    <Grid times={hours} rows={rows} now={6} first="11rem" />
    {keptNote}
    <Card className="grid gap-1 p-3 text-13"><Label>Heparin · by aPTT (the unit's table)</Label>
      <p className="text-fg">aPTT 44 s at 12:00 (target 50–70 s) → <b>raise by 100 units/h to 1 100</b>, next aPTT 18:00. <span className="text-muted">The table suggests; the nurse signs the new rate like any titration.</span></p></Card>
    <Ask n={14}>CCU as the critical pack's second setup (its rows: the rhythm, chest pain, ST, heparin by aPTT; the times from pain to needle on the stay), not a pack of its own: drawn.
      The rhythm is a word typed or picked (SR, AF, VT…), not a monitor feed; monitors and ECG files come later.</Ask>
  </Stay>
}
