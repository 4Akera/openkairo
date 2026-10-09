// Haematology and oncology, drawn with the last group (2026-10-08, proposed by Claude, awaiting the owner). clinics.tsx holds the shared parts.
// Haematology: ordering blood (/blood, answered by the Blood bank; a young woman with thalassaemia, so her programme, iron and chelation are
// in the same picture), blood at the bedside on the ward, the INR clinic. Oncology: the cancer's record, today's cycle (/chemo), the
// chemotherapy day unit (chairs on the base's board, as dialysis). The Blood bank and the day unit are departments; the board is the base's.
import type { ReactNode } from 'react'
import { Check, Printer } from 'lucide-react'
import { Button, Card, Chip, Input, Kbd, ListRow, ScreenFrame, Sparkline, Steps, Tag, type ScreenView } from '@core/ui'
import { App, Arabic, Tube } from './kit'
import { Ask, Board, Chips, Keys, Label, Line, Rec, Row, Signed, Table, Under, Unsigned, V, Visit, Word, noop, type Bed, type Pic } from './clinics'

const HC = 'Haematology clinic', OLA = 'Dr. Ola Kandil', OC = 'Oncology clinic', HESHAM = 'Dr. Hesham Abdallah', SAMEH = 'Dr. Sameh Fahim'
const foot = 'text-12 text-faint', head = 'flex flex-wrap items-center gap-2 px-1 text-13'
const nka = <span className={foot}>No known allergies</span>

/** a row of choices in a card: its label, the chips (the chosen ones on), a word beside */
function Pick({ k, of, on, check, hint }: { k: string; of: string[]; on: string[]; check?: boolean; hint?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><Label className="w-28 shrink-0">{k}</Label>
    {of.map((c) => <Chip key={c} onClick={noop} on={on.includes(c)} variant={check ? 'check' : 'solid'}>{c}</Chip>)}
    {hint && <span className="text-12 text-faint">{hint}</span>}</div>
}
/** a small boxed part of a card: facts from the record, a check, the patient's copy */
const Box = ({ children, tone }: { children: ReactNode; tone?: 'danger' }) =>
  <div className={`grid gap-1.5 rounded-lg border bg-surface p-2.5 text-13 ${tone === 'danger' ? 'border-danger-line' : 'border-line'}`}>{children}</div>
/** the card's title line: what it is, and a word on where it stands */
const Title = ({ t, children }: { t: ReactNode; children?: ReactNode }) => <p className={head}><b className="text-14 font-semibold text-fg">{t}</b>{children}</p>
const Drafts = ({ n, sign, lines }: { n: number; sign?: string; lines: ReactNode[] }) =>
  <Unsigned n={n} sign={sign}>{lines.map((l, i) => <p key={i} className="text-fg">{l}</p>)}</Unsigned>
const booking = <span className="text-12 text-faint">the booking</span>

// ── 1 · ordering blood (and the thalassaemia programme, folded in) ──
export function HaemBlood() {
  const ferritin = ([['2026-01-15', 3850], ['2026-04-09', 3420], ['2026-07-02', 2960], ['2026-10-08', 2610]] as const).map(([at, value]) => ({ at, value }))
  const record = <>
    <Chips on="Transfusions" lead={[['Summary'], ['Transfusions', '3-weekly']]} base={[['Problems', '1']]} more={5} />
    <Rec title="Summary" folded="β-thalassaemia major · Hb 8.9 ↓ today · ferritin 2 610 ↑ · deferasirox 1 260 mg" />
    <Rec title="Transfusions" right={<span className={foot}>17 in 12 months</span>}>
      <Row k="Blood group">O Rh positive · R1r (C+ c+ E− e+) · Kell negative</Row><Row k="Antibodies">screen negative · 17 Sep</Row><Row k="Reactions">none</Row>
      <Row k="Programme">every 3 weeks · Hb before 9.5–10.5 · red cells leucodepleted, Rh and Kell matched</Row>
      <Label className="pt-2">The last four</Label>
      <Table head={['Date', 'Hb before', 'Units', 'mL/kg']} rows={[['6 Aug', '9.8', '2', '12'], ['27 Aug', '9.6', '2', '12'], ['17 Sep', '9.3', '2', '12'],
        ['8 Oct', <span key="h" className="font-medium text-warn">8.9 · under her 9.5</span>, 'asked', '']]} />
      <Label className="pt-2">Iron</Label>
      <Row k="Ferritin"><span className="inline-flex flex-wrap items-center gap-2"><V f="high">2 610</V><span className={foot}>ng/mL</span>
        <Sparkline points={ferritin} label="Ferritin 3 850 in January, 3 420, 2 960, 2 610 today" /><span className={foot}>3 850 in Jan</span></span></Row>
      <Row k="MRI T2*">heart 24 ms (no iron) · liver 9 mg/g · March</Row>
      <Row k="Chelation">deferasirox film-coated 1 260 mg once a day · <b className="whitespace-nowrap font-semibold">26 mg/kg</b> at 48 kg</Row>
      <Row k="Its checks">creatinine 0.6 · ALT 31 · urine protein nil · 17 Sep</Row><Row k="Next">Thu 29 Oct · in 3 weeks {booking}</Row>
    </Rec>
    <Rec title="Problems" count={1} folded="β-thalassaemia major (D56.1) · since 2008" />
  </>
  return <Visit dept={HC} user={OLA} who={['Mariam Tawfik', '19 y · F · #10713']} where="In consult · day care · 6 min" safety={nka}
    words={<><Word>O Rh+ · Kell neg</Word><Word tone="warn">Ferritin 2 610</Word></>} record={record}>
    <Line>/blood rbc 2 ? thalassaemia programme</Line>
    <Under>
      <Title t="Blood · to the Blood bank"><span className="text-muted">offered here because the Blood bank works for this clinic</span></Title>
      <Pick k="Product" of={['Red cells', 'Platelets', 'Plasma (FFP)', 'Cryoprecipitate']} on={['Red cells']} />
      <Pick k="Needs" check of={['Leucodepleted', 'Rh and Kell matched', 'Irradiated', 'Washed']} on={['Leucodepleted', 'Rh and Kell matched']} />
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><Label className="w-28 shrink-0">Units</Label><Input readOnly value="2" className="h-7 w-14 text-center tnum" />
        <span className="text-fg">≈ 580 mL · 12 mL/kg</span><span className={foot}>at 48 kg, weighed today</span></div>
      <Pick k="Why" of={['Thalassaemia programme', 'Hb under 7', 'Bleeding', 'Before surgery', 'Other']} on={['Thalassaemia programme']} />
      <Box><Label>From her record</Label>
        <p className="flex flex-wrap items-center gap-1.5"><Tag tone="warn">Hb 8.9 ↓ · 08:40 today</Tag><span className="text-muted">under her 9.5–10.5 · platelets 312</span><Tag>no reactions</Tag><Tag>antibodies none · 17 Sep</Tag></p>
        <p className="flex flex-wrap items-center gap-1.5"><span className="w-20 text-muted">Consent</span><Tag tone="ok">on file</Tag><span className="text-muted">signed 14 Jan, for the programme, a year</span>
          <span className="ms-auto flex gap-1"><Chip onClick={noop} on>On file</Chip><Chip onClick={noop}>Signed today</Chip><Chip onClick={noop}>Emergency, no time</Chip></span></p>
        <p className="flex flex-wrap items-center gap-1.5"><span className="w-20 text-muted">Sample</span><Tag tone="warn">a new one</Tag><span className="text-muted">transfused since 17 Sep, so a sample is good for 3 days</span></p>
        <p className="flex flex-wrap items-center gap-1.5 ps-[5.4rem]"><Tube c="purple" /><span className="text-fg">1 purple EDTA 6 mL, labelled by hand at her side</span>
          <span className="ms-auto flex gap-1"><Chip onClick={noop} on>Taken here</Chip><Chip onClick={noop}>The lab collects</Chip></span></p>
      </Box>
      <Pick k="How soon" of={['Routine', 'Urgent · within the hour', 'Emergency · O negative now']} on={['Routine']} />
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the order · on the line: <span className="font-mono">rbc plt ffp cryo · a number · urgent · ? why</span></Keys>
    </Under>
    <Drafts n={3} lines={['Red cells, leucodepleted, Rh and Kell matched · 2 units · thalassaemia programme · Hb 8.9 · routine · Blood bank', 'Crossmatch sample · 1 purple tube · taken here',
      <>Next transfusion · Thu 29 Oct · Haematology clinic {booking}</>]} />
    <Card className="grid gap-2 p-3"><Label>The Blood bank's list, once signed</Label>
      <ul className="-mx-3"><ListRow number="10713" name="Mariam Tawfik" age="19 F" status={<span className="truncate">Red cells × 2 · routine</span>} who={HC} minutes={null} /></ul>
      <Steps dense steps={[{ key: 'a', label: 'Asked', state: 'done' }, { key: 'r', label: 'Sample received', state: 'current' }, { key: 'g', label: 'Grouped and screened', state: 'todo' },
        { key: 'x', label: 'Crossmatched 2 of 2', state: 'todo' }, { key: 'i', label: 'Issued, unit by unit', state: 'todo' }]} />
      <p className={foot}>Each step is the base's step on her order; Issued brings each unit's number to her chart, ready for the bedside check.</p></Card>
    <p className={foot}>/blood is the Blood bank's order: a pack type extending the base's order (product, needs, units, why, consent, sample), as radiology's (core change (a), approved 2026-10-08); what it shows from her record is what the chart already has (core change (b)). The Transfusions section reads the blood bank's results (group, screen), each unit given (the base's given), the ferritin (a result) and deferasirox (the base's medication); the programme line is the pack's own.</p>
    <Ask n={35}>The Blood bank as a department that uses the laboratory pack, its own section (drawn): its sample collected and its group, screen and crossmatch typed as the lab's are, plus what is its own (issuing a unit, the bedside record, a reaction to look into), and /blood its word as /xr is radiology's. Or the haematology pack's own bench with all of it; or later, with /order to the Blood bank and the unit typed by hand at the bedside on day one?</Ask>
  </Visit>
}

// ── 2 · blood at the bedside ──
export function HaemBedside() {
  const checks = ['Name and birth date: wristband = label', 'Record number 10388 = the label', 'Unit number on the bag = the label',
    'A Rh positive unit, A Rh positive patient', 'In date · the bag whole, no clots', 'Started 12 min after issue (within 30)']
  const record = <>
    <Chips on="Transfusions" lead={[['Summary']]} base={[['Problems', '2'], ['Medicines', '4'], ['Transfusions', 'stopped', 'danger']]} more={3} />
    <Rec title="Summary" folded="Melaena · Hb 6.8 ↓ · omeprazole IV · endoscopy tomorrow" />
    <Rec title="Transfusions" tone="attention">
      <Row k="Blood group">A Rh positive · antibodies none · 07:40 today</Row><Row k="Asked">red cells × 2 · urgent · 07:15 · Hb 6.8</Row>
      <Table head={['Unit', 'Started', 'Ended', 'mL', '']} rows={[['26-118437', '09:10', '11:05', '290', <span key="o" className="text-ok">no reaction</span>],
        ['26-118452', '11:32', '11:51', '≈ 60', <span key="s" className="font-medium text-danger">stopped · hives</span>]]} />
    </Rec>
    <Rec title="Results" count={6} folded="Hb 6.8 ↓ at 22:10 yesterday · urea 64 ↑ · INR 1.1" />
    <Rec title="Medicines" count={4} folded="omeprazole 40 mg IV twice a day · ibuprofen stopped · …" />
    <Rec title="Problems" count={2} folded="Upper GI bleeding (K92.1) · osteoarthritis" />
  </>
  return <Visit dept="Medical Ward" user="Basma Khalifa" who={['Soad Mahrous', '66 y · F · #10388']} where="Admitted · Bed 4 · day 2" safety={nka} record={record}
    words={<><Word>NEWS2 1</Word><Word tone="danger">blood stopped</Word></>} actions={<><Button size="sm">Sign<Kbd className="ms-1">⌘↵</Kbd></Button><Button size="sm" variant="outline">Discharge</Button></>}>
    <Line>/transfuse 26-118452</Line>
    <Under tone="danger">
      <Title t="Unit 2 of 2 · 26-118452"><span className="text-muted">red cells · A Rh+ · 290 mL · use by 30 Oct · issued 11:20</span><Tag tone="danger" className="ms-auto">stopped 11:51</Tag></Title>
      <Box><Label>Checked at her side · 11:30 · Basma Khalifa and Marwa Gaber</Label>
        <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">{checks.map((c) => <li key={c} className="flex items-center gap-1.5 text-fg"><Check className="size-3.5 shrink-0 text-ok" />{c}</li>)}</ul></Box>
      <Table head={['Signs', 'Temp', 'BP', 'Pulse', 'Breaths', 'SpO₂']} first="9rem" rows={[['Before · 11:25', '36.8', '128/76', '88', '16', '97 %'],
        ['15 min · 11:47', '36.9', '130/78', '90', '16', '97 %'], [<b key="r" className="font-medium text-danger">Reaction · 11:51</b>, '36.9', '132/78', '94', '18', '97 %'],
        [<span key="e" className="text-faint">At the end</span>, '', '', '', '', '']]} />
      <Box tone="danger">
        <p className="flex flex-wrap items-center gap-2"><Tag tone="danger">Reaction · 11:51</Tag><span className="text-fg">hives on the chest and arms, itching · no fever, no wheeze, BP steady</span></p>
        <Pick k="What" of={['Hives, itch', 'Fever, rigors', 'Breathless', 'BP fell', 'Back pain, dark urine']} on={['Hives, itch']} />
        <Pick k="How bad" of={['Mild', 'Moderate', 'Severe']} on={['Mild']} />
        <p className="text-12 text-muted">Shown when Stop is pressed, each a tick: the line kept open with saline · the label checked against her again · the doctor told · the bag and its set kept for the Blood bank.</p>
        <Pick k="The doctor" of={['Restart slowly when settled', 'Do not restart · return the unit']} on={['Do not restart · return the unit']} hint={`${SAMEH} · 11:58 · chlorphenamine 10 mg IV on his /rx`} />
      </Box>
      <Keys><Kbd>tab</Kbd> the next field · <Kbd>S</Kbd> Stop · the next signs due: at the end, then within the hour after</Keys>
    </Under>
    <Drafts n={3} sign="Sign" lines={['Red cells · unit 26-118452 · 11:32 to 11:51 · about 60 mL · stopped: hives, mild · not restarted, returned to the Blood bank',
      'Vitals 11:51 · 36.9 °C · 132/78 · 94 · 18 · 97 %', <>Checked by Basma Khalifa and Marwa Gaber <span className={foot}>on the unit's record</span></>]} />
    <p className={foot}>Each unit is the base's given (the unit number its lot, the volume its dose), extended with the two who checked, the start, the end and the reaction; each set of signs is the base's vitals. Signs before, at 15 minutes and at the end are the Blood bank's setting. The reaction stays on the unit's record and reaches the Blood bank's list (to look into the bag and a new sample) and the doctor's To review, where one click writes it to the base's allergies as "blood products" (category biologic), so the safety zone and every later /blood show it.</p>
    <Ask n={36}>A core change: /transfuse, the bedside record, offered wherever the Blood bank works for the department, as /blood is, and from the unit's line in the section (drawn; rule 1 offers a pack's words that way only for orders). Or every department that gives blood ticks the Blood bank's pack; or the ward pack's drug round carries each issued unit as a dose due, with its second checker, and the day units tick the ward pack too?</Ask>
  </Visit>
}

// ── 3 · the INR clinic ──
const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
/** the INRs over time in the target band: a dot each (hollow and amber outside the band), its value above, the date below */
function InrChart({ inr }: { inr: [string, number, number][] }) {
  const W = 420, H = 140, L = 24, R = 16, T = 18, B = 20, x = (d: number) => L + 14 + d / 182 * (W - L - R - 14), y = (v: number) => T + (4 - v) / 2.8 * (H - T - B)
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`INR, the last 6 months, target 2 to 3: ${inr.map(([d, , v]) => `${d} ${v}`).join(', ')}`}>
    <rect x={L} width={W - L - R} y={y(3)} height={y(2) - y(3)} className="fill-band" />
    {[2, 3, 4].map((v) => <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-faint text-11">{v}</text>)}
    <text x={x(140)} y={y(2) - 5} textAnchor="middle" className="fill-muted text-11">target 2–3</text>
    <polyline points={inr.map(([, d, v]) => `${x(d)},${y(v)}`).join(' ')} className="fill-none stroke-accent" strokeWidth={2} />
    {inr.map(([t, d, v], i) => { const out = v < 2 || v > 3, below = i > 0 && v < inr[i - 1][2]
      return <g key={t}><circle cx={x(d)} cy={y(v)} r={4} strokeWidth={2} className={out ? 'fill-surface stroke-warn' : 'fill-accent stroke-accent'} />
        <text x={x(d)} y={below ? y(v) + 16 : y(v) - 8} textAnchor="middle" className={out ? 'fill-warn text-11 font-semibold' : 'fill-fg text-11'}>{v}</text>
        <text x={x(d)} y={H - 4} textAnchor="middle" className="fill-faint text-11">{t}</text></g> })}
  </svg>
}
export function HaemInr() {
  const now = ['5', '5', '2.5', '5', '5', '2.5', '5'], next = ['5', '5', '5', '5', '5', '2.5', '5']
  const ar = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
  const record = <>
    <Chips on="Anticoagulation" lead={[['Summary'], ['Anticoagulation', 'INR 1.7', 'warn']]} base={[['Problems', '2']]} more={4} />
    <Rec title="Summary" folded="Rheumatic mitral stenosis, AF · warfarin 30 mg a week · INR 1.7 ↓ today" />
    <Rec title="Anticoagulation" right={<span className={foot}>since March 2021</span>}>
      <Row k="For">AF with rheumatic mitral stenosis (moderate): warfarin, not a DOAC</Row>
      <Row k="Target"><b className="font-semibold">INR 2.0–3.0</b> <span className={foot}>the clinic's table for this reason</span></Row>
      <Row k="Medicine">warfarin (Marevan) 5 mg tablets · 30 mg a week</Row>
      <Row k="In range" tone="ok">78 % of the last 6 months <span className={foot}>Rosendaal, from the INRs</span></Row>
      <InrChart inr={[['9 Apr', 0, 2.3], ['7 May', 28, 1.9], ['4 Jun', 56, 2.4], ['2 Jul', 84, 2.6], ['6 Aug', 119, 2.2], ['17 Sep', 161, 3.6], ['8 Oct', 182, 1.7]]} />
      <Label className="pt-1">The week now · mg</Label>
      <Table head={days} rows={[now]} />
      <Row k="Last change">17 Sep · INR 3.6 ↑ on azithromycin · 32.5 → 30 mg a week</Row>
    </Rec>
    <Rec title="Problems" count={2} folded="Rheumatic mitral stenosis (I05.0) · atrial fibrillation (I48.2)" />
  </>
  return <Visit dept={HC} user={OLA} who={['Ensaf Rizk', '52 y · F · #10297']} where="In consult · INR clinic · 4 min" safety={nka}
    words={<><Word>Warfarin · 2–3</Word><Word tone="warn">INR 1.7</Word></>} record={record}>
    <Line>/inr 1.7</Line>
    <Under tone="warn">
      <Title t={<>INR <V f="low">1.7</V></>}><span className="text-muted">target 2.0–3.0 · finger prick 09:20 · 3 weeks since the last</span></Title>
      <Pick k="Missed doses" of={['None', 'One', 'Two or more']} on={['None']} />
      <Pick k="Food" of={['As usual', 'More greens', 'Fewer greens']} on={['More greens']} hint="molokhia most days this week" />
      <Pick k="Bleeding" of={['None', 'Minor', 'Major']} on={['None']} />
      <Box><Label>Her medicines and INR · from her list</Label>
        <p className="flex flex-wrap items-center gap-2"><Tag tone="info">raises INR</Tag><span className="text-fg">Azithromycin 500 mg · 12–14 Sep · the GP</span><span className="text-muted">finished</span></p>
        <p className="text-muted">Digoxin · bisoprolol · benzathine penicillin monthly: none changes INR</p></Box>
      <Box><p className="flex flex-wrap items-center gap-2"><Label>The clinic's table</Label><span className="text-fg">INR 1.5–1.9: the week up 5–10 % · the next INR in 1–2 weeks</span>
        <Chip onClick={noop} className="ms-auto">Use · 32.5 mg</Chip></p></Box>
      <div className="grid gap-1 px-1"><Label>The new week · mg</Label>
        <div className="flex flex-wrap items-end gap-1.5">{days.map((d, i) => <label key={d} className="grid gap-0.5 text-center"><span className="text-11 text-faint">{d}</span>
          <Input readOnly value={next[i]} className={`h-8 w-14 text-center tnum ${next[i] !== now[i] ? 'font-semibold text-accent' : ''}`} /></label>)}
          <span className="ms-2 pb-1.5 text-13 text-fg">= <b className="font-semibold">32.5 mg</b> a week <span className="text-muted">· was 30 · +8 % · Mon up to 5</span></span></div>
        <p className="text-12 text-muted">5 mg tablets: one a day, half on Thursday</p></div>
      <div className="flex flex-wrap items-center gap-2 px-1 text-13"><Label className="w-28 shrink-0">Next INR</Label><Input readOnly value="Thu 15 Oct" className="h-7 w-32" />
        <span className="text-muted">in 1 week</span>{booking}</div>
      <Box><p className="flex items-center gap-2"><Label>Her table, in Arabic</Label><Button size="xs" variant="outline" className="ms-auto"><Printer className="size-3.5" />Print</Button></p>
        <div dir="rtl" className="grid grid-cols-7 overflow-hidden rounded-md ring-1 ring-line">{ar.map((d, i) => <div key={d} className="grid border-s border-line text-center first:border-s-0">
          <Arabic className="bg-sunken py-1 text-12">{d}</Arabic><Arabic className="py-1 text-13">{next[i] === '5' ? 'قرص' : 'نصف قرص'}</Arabic></div>)}</div>
        <Arabic className="text-13">وارفارين (ماريفان) ٥ مجم · مرة واحدة يومياً الساعة ٦ مساءً · تحليل السيولة القادم: الخميس ١٥ أكتوبر</Arabic>
        <Arabic className="text-13">لا تغيّري الجرعة ولا تبدئي دواءً جديداً قبل سؤال العيادة · كُلي الملوخية والخضار الورقية بكمية ثابتة كل أسبوع</Arabic></Box>
    </Under>
    <Drafts n={3} lines={['INR 1.7 · finger prick · target 2.0–3.0', 'Warfarin · 32.5 mg a week, was 30 · Sat–Wed and Fri 5 mg, Thu 2.5 mg', <>Next INR · Thu 15 Oct · Haematology clinic {booking}</>]} />
    <p className={foot}>The INR is the base's result; warfarin stays the base's medication, its dose "by the week's table" (the base holds one dose, not one a day). The reason, the target and the week's table are the pack's own; the time in range is worked out from the INRs, never typed. Her table prints through the browser.</p>
    <Ask n={37}>The INR clinic in the haematology pack (drawn), in cardiology's, or a small pack of its own ("Anticoagulation") that the haematology and cardiology clinics both tick?</Ask>
    <Ask n={38}>The clinic's dosing table suggests the new week (shown, never applied: the doctor uses it or writes another, drawn)? Or no suggestion, the doctor writes the week each time?</Ask>
  </Visit>
}

// ── 4 · the cancer's record ──
const cancerChips = <Chips on="Cancer" lead={[['Summary'], ['Cancer', 'IIB · AC 3']]} base={[['Problems', '2'], ['Medicines', '3']]} more={3} />
const wafaa = { dept: OC, user: HESHAM, who: ['Wafaa Shaker', '47 y · F · #10356'] as [string, string], safety: nka, words: <><Word>Breast · IIB</Word><Word>AC 3 of 4</Word></> }
const nb = (s: string) => <span className="whitespace-nowrap">{s}</span>
export function OncPlan() {
  const plan: [string, string, 'done' | 'now' | 'todo'][] = [['Surgery', 'left mastectomy and axillary clearance · 5 Aug · Dr. Ayman Sobhi', 'done'],
    ['Chemotherapy', 'AC × 4 every 21 days, then paclitaxel weekly × 12', 'now'], ['Radiotherapy', 'chest wall and nodes · 4 weeks after the last paclitaxel', 'todo'], ['Endocrine', 'tamoxifen · 5 years at least', 'todo']]
  const record = <>
    {cancerChips}
    <Rec title="Summary" folded="Left breast cancer IIB · AC 3 today · ANC 2.1 · EF 64 %" />
    <Rec title="Cancer" right={<span className={foot}>curative</span>}>
      <Row k="Diagnosis">left breast, upper outer · <span className="font-mono text-12">C50.4</span> · invasive carcinoma of no special type <span className="font-mono text-12">8500/3</span> · grade 3</Row>
      <Row k="Stage"><b className="font-semibold">IIB</b> · pT2 (3.2 cm) pN1a (2 of 14 nodes) M0 · {nb('AJCC 8th')}</Row>
      <Row k="Markers">ER {nb('90 %')} · PR {nb('60 %')} · HER2 1+ (negative) · Ki-67 {nb('35 %')}</Row>
      <Row k="ECOG">0 · 26 Aug</Row><Row k="Intent">curative · after surgery</Row>
      <Label className="pt-2">The plan</Label>
      {plan.map(([s, d, st]) => <Row key={s} k={<span className={st === 'done' ? 'text-ok' : st === 'now' ? 'font-semibold text-accent' : ''}>{s}{st === 'done' ? ' ✓' : ''}</span>}>
        <span className={st === 'todo' ? 'text-muted' : ''}>{st === 'now' && <Tag tone="accent" className="me-1">now</Tag>}{d}</span></Row>)}
      <Label className="pt-2">Cycles · from the clinic's list</Label>
      <Table head={['Cycle', 'Date', 'Dose', 'After it']} rows={[['AC 1', '27 Aug', nb('100 %'), 'nausea G2'], ['AC 2', '17 Sep', nb('100 %'), <span key="f" className="font-medium text-danger">febrile neutropenia G3</span>],
        ['AC 3', 'today', '', ''], ['AC 4', '29 Oct', '', ''], ['Paclitaxel', nb('weekly × 12 from 19 Nov'), '', '']]} />
      <Row k="Doxorubicin">215 mg so far · 120 mg/m²</Row><Row k="Heart">EF 64 % · echo 20 Aug, before the first cycle</Row>
    </Rec>
    <Rec title="Problems" count={2} folded="Breast cancer, left (C50.4) · febrile neutropenia after AC 2 (D70.1)" />
  </>
  return <Visit {...wafaa} where="In consult · 9 min" record={record}>
    <Signed at="20 Aug" title="Tumour board · the decision" by="Dr. Ayman Sobhi · Dr. Hesham Abdallah · Dr. Hanan Bayoumi · Dr. Mostafa Ragheb · Dr. Rehab Anwar">
      <p>Left breast, invasive carcinoma NST, grade 3 · pT2 pN1a (2 of 14) M0 · ER 90 % PR 60 % HER2 negative · Ki-67 35 %. CT and bone scan clear.</p>
      <p>Adjuvant AC × 4 then weekly paclitaxel × 12, then chest wall and nodal radiotherapy, then tamoxifen. Echo before the first cycle.</p>
    </Signed>
    <Line>/cancer ecog 1</Line>
    <Under>
      <Title t="The cancer · left breast"><span className="text-muted">the card that wrote the section on 26 Aug; today only ECOG changes</span></Title>
      <Pick k="ECOG" of={['0', '1', '2', '3', '4']} on={['1']} hint="was 0 on 26 Aug · tired after cycles, does light work" />
      <Pick k="Intent" of={['Curative', 'Palliative']} on={['Curative']} />
      <Pick k="Stage" of={['IA', 'IB', 'IIA', 'IIB', 'IIIA', 'IIIB', 'IIIC', 'IV']} on={['IIB']} hint="pT2 pN1a M0" />
      <Pick k="Plan now" of={['Surgery ✓', 'Chemotherapy', 'Radiotherapy', 'Endocrine']} on={['Chemotherapy']} />
      <Pick k="Regimen" of={['AC → paclitaxel weekly', 'Dose-dense AC → paclitaxel', 'TC × 4', 'AC → paclitaxel + trastuzumab']} on={['AC → paclitaxel weekly']} hint="the clinic's list · breast" />
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds what changed · the TNM and markers as pathology reported them</Keys>
    </Under>
    <Drafts n={1} lines={['ECOG 1 · was 0 on 26 Aug']} />
    <p className={foot}>The cancer is the base's problem (C50.4) extended by the pack: morphology (ICD-O-3), grade, side, the TNM with its edition, the markers, the intent, the plan and the regimen chosen. ECOG is the base's observation (LOINC 89247-1); the tumour board's decision the base's note (kind plan); each cycle is the pack's own entry (the next picture). The stage group is the oncologist's choice, the TNM beside it.</p>
  </Visit>
}

// ── 5 · today's cycle ──
export function OncCycle() {
  const checks = ['ANC 2.1 · 1.5 or more', 'Platelets 168 · 100 or more', 'Creatinine 0.8 · eGFR 91', 'Bilirubin 0.6 · under 1.2', 'EF 64 % · 20 Aug · 50 or more']
  const tox: [string, string[], string, string?][] = [['Febrile neutropenia', ['none', '3', '4'], '3', 'admitted 23–26 Sep · ANC 0.3 · 38.6 °C'],
    ['Nausea', ['0', '1', '2', '3'], '2', 'ate less for 4 days'], ['Mucositis', ['0', '1', '2', '3', '4'], '1'], ['Neuropathy', ['0', '1', '2', '3', '4'], '0']]
  const record = <>
    {cancerChips}
    <Rec title="Summary" folded="Left breast cancer IIB · AC 3 today · ANC 2.1 · EF 64 %" />
    <Rec title="Cancer" folded="Left breast IIB · curative · AC → paclitaxel · AC 3 of 4 today" />
    <Rec title="Vitals" right={<span className={foot}>today 11:20</span>}><Row k="Height · weight">158 cm · 72 kg <span className={foot}>74 at AC 1 · 73 at AC 2</span></Row>
      <Row k="BP · pulse · temp">118/72 · 84 · 36.7</Row></Rec>
    <Rec title="Results" count={14} right={<span className={foot}>today 08:10</span>}><Row k="Blood count">WBC 4.6 · ANC 2.1 · Hb 11.2 · platelets 168</Row>
      <Row k="Chemistry">creatinine 0.8 · eGFR 91 · bilirubin 0.6 · ALT 24</Row></Rec>
    <Rec title="Problems" count={2} folded="Breast cancer, left (C50.4) · febrile neutropenia after AC 2 (D70.1)" />
  </>
  return <Visit {...wafaa} where="In consult · 14 min" record={record}>
    <Line>/chemo ac 3</Line>
    <Under>
      <Title t="AC · cycle 3 of 4 · day 1"><span className="text-muted">every 21 days · AC 2 on 17 Sep, 21 days ago · from the clinic's list</span></Title>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 text-13"><span className="text-muted">158 cm · 72 kg today</span>
        <span className="text-fg">BSA <b className="text-16 font-semibold tnum">1.78 m²</b></span><span className={foot}>Mosteller: √(158 × 72 ÷ 3600)</span></p>
      <Table head={['Drug', 'Per m²', '× 1.78', 'Dose', 'How']} rows={[['Doxorubicin', '60 mg', '106.8', <b key="d" className="font-semibold">107 mg</b>, 'IV push over 10 min, into running saline'],
        ['Cyclophosphamide', '600 mg', '1 068', <b key="c" className="font-semibold">1 070 mg</b>, 'IV in 500 mL saline over 60 min']]} />
      <p className="px-1 text-12 text-muted">Rounded as the regimen says (doxorubicin to 1 mg, cyclophosphamide to 10 mg) · doxorubicin so far 120 mg/m², 180 after today</p>
      <Box><Label>Before the cycle · the regimen's checks · today 08:10</Label>
        <p className="flex flex-wrap gap-1.5">{checks.map((w) => <Tag key={w} tone="ok">{w}</Tag>)}</p>
        <p className={foot}>Shown, never a stop: a number past its limit turns amber; the oncologist decides.</p></Box>
      <Box><Label>Since AC 2 · CTCAE v5 grades</Label>
        {tox.map(([t, of, on, note]) => <div key={t} className="flex flex-wrap items-center gap-1.5"><span className="w-40 shrink-0 text-fg">{t}</span>
          {of.map((g) => <Chip key={g} onClick={noop} on={g === on}>{g}</Chip>)}{note && <span className="text-12 text-muted">{note}</span>}</div>)}</Box>
      <Pick k="Decision" of={['Give', 'Delay a week', 'Reduce by…']} on={['Give']} hint="Reduce opens 10 · 20 · 25 %" />
      <p className={head}><Tag tone="info">added this cycle</Tag><span className="text-fg">Pegfilgrastim 6 mg SC · Sat 10 Oct</span><span className="text-muted">24–72 h after · for AC 2's febrile neutropenia</span></p>
      <p className="px-1 text-13 text-muted">Before it, the regimen's: aprepitant 125 mg oral · granisetron 1 mg IV · dexamethasone 12 mg IV · aprepitant 80 mg days 2–3 to take home</p>
      <p className={head}><Label>Goes to</Label><span className="text-fg"><b className="font-medium">Pharmacy</b> prepares it (its list, To prepare) → <b className="font-medium">Chemotherapy day unit</b> gives it today</span></p>
    </Under>
    <Drafts n={5} lines={['AC · cycle 3 day 1 · BSA 1.78 (158 cm, 72 kg) · 100 % · Give · Chemotherapy day unit', 'Doxorubicin 107 mg IV · cyclophosphamide 1 070 mg IV · Pharmacy, to prepare',
      'Aprepitant, granisetron, dexamethasone before · pegfilgrastim 6 mg SC on Sat 10 Oct', 'After AC 2 · febrile neutropenia G3 · nausea G2 · mucositis G1', <>Next · AC 4 · Thu 29 Oct · Oncology clinic {booking}</>]} />
    <p className={foot}>Each drug is the base's medication, prescribed and sent to the Pharmacy, its dose worked out and kept with the BSA it used; the cycle is the pack's own order to the day unit (it extends order, core change (a)); height and weight are the base's vitals; each toxicity is the base's observation coded with CTCAE v5 (a code system the pack brings). The numbers checked are what the chart already has (core change (b)).</p>
    <Ask n={39}>The regimens as a clinic setting (each: its drugs, mg/m² or AUC with Calvert's formula, days, cycle length, pre-medicines, the checks with their limits, the rounding): changed by any oncologist, with who and when kept in its history (drawn)? Or only by the head of oncology; or by an oncologist and then checked by a pharmacist before the first patient gets it?</Ask>
  </Visit>
}

// ── 6 · the chemotherapy day unit ──
export function OncUnit() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All chairs', count: 8 }, { id: 'in', label: 'In', count: 6 }, { id: 'free', label: 'Free', count: 2 }, { id: 'due', label: 'Not in a chair yet', count: 3, needs: 'warn' }]
  const who = (name: string, sexAge: string, reason: string, clinician = HESHAM) => ({ name, sexAge, day: 1, clinician, reason, urgent: false })
  const b = ['Give', 'Obs']
  const chairs: Bed[] = [
    { name: 'Chair 1', who: who('Wafaa Shaker', 'F 47', 'breast cancer'), line: ['AC C3 D1', { text: 'pharmacy preparing', tone: 'info' }, 'premedicines 12:30'], buttons: b },
    { name: 'Chair 2', who: who('Samir Tolba', 'M 61', 'colon cancer'), line: ['FOLFOX C5 D1', 'oxaliplatin · ends 13:10', 'pump 46 h after'], buttons: b },
    { name: 'Chair 3', who: who('Heba Nassar', 'F 44', 'breast cancer'), line: ['Paclitaxel W7', 'ends 13:40'], buttons: b },
    { name: 'Chair 4', who: who('Sherif Allam', 'M 55', 'lymphoma', OLA), line: ['R-CHOP C1 D1', { text: 'reaction watch', tone: 'warn' }, 'rituximab 150 mg/h'], buttons: b },
    { name: 'Chair 5', who: who('Laila Ghoneim', 'F 59', 'ovarian cancer'), line: ['Carbo-paclitaxel C2', { text: 'stopped 12:20 · flushing', tone: 'danger' }], buttons: b },
    { name: 'Chair 6' },
    { name: 'Chair 7', who: who('Dalia Sharaf', 'F 41', 'breast cancer, HER2+'), line: ['Trastuzumab C9', 'ends 12:50'], buttons: b },
    { name: 'Chair 8' },
  ]
  const due: [string, string, string, ReactNode, number | null][] = [
    ['10711', 'Mahmoud Eissa', '58 M', <><span className="font-medium">FOLFIRI C2 D1</span><Tag tone="warn">ANC 1.2 · waiting for Dr. Hesham</Tag></>, 35],
    ['10712', 'Nesma Sabry', '39 F', <><span className="font-medium">Paclitaxel W3</span><span className="text-muted">here 12:30 · weighed 64 kg · bloods fine</span></>, 15],
    ['10251', 'Fathy Shalaby', '66 M', <><span className="font-medium">Gemcitabine C1 D8</span><Tag tone="warn">not here · due 12:00</Tag></>, null],
  ]
  return <App dept="Chemotherapy day unit" user="Asmaa Farid" tabs={['Chairs', 'Drug round', 'Handover']} tab="Chairs">
    <ScreenFrame views={views} view="all" onView={noop} date={<span className="text-13 text-muted">Thu 8 Oct · 12:45</span>}>
      <Board beds={chairs} />
      <p className="text-12 font-medium text-faint">Today's cycles not in a chair yet · from the cycles signed for today</p>
      <Card><ul>{due.map(([n, name, age, said, min]) => <ListRow key={n} number={n} name={name} age={age} minutes={min} status={said}
        actions={<><Button size="xs" variant="outline">Start</Button><Button size="xs" variant="ghost">Not today</Button></>} />)}</ul></Card>
      <p className={foot}>The base's board with chairs for beds, as dialysis's: Start is the base's Admit here into a free chair, the base's Discharge ends the day (a cycle a short stay in a chair, §5.6 Q2). The oncology pack says the regimen and cycle, then where it is: the pharmacy preparing (the base's steps on the drugs sent to it), the drug running and when it ends, a reaction watch for the first 30 minutes of a drug that can react (the regimen says which), a reaction in red. Give and Obs are the ward pack's: the drug round for this chair, chemotherapy checked by a second nurse (§5.6 Q4). The rows not in a chair yet are the pack's own, from today's cycles: the same small base change dialysis asks (§5.6 Q2). /chemo is offered wherever the day unit works for the department: here the Oncology and Haematology clinics.</p>
      <Ask n={40}>The day unit ticks the ward nursing pack (the drug round with its second checker for chemotherapy, obs, handover) and the oncology pack (drawn)? Or the oncology pack alone, carrying its own giving of each bag, its own obs and its own second checker?</Ask>
    </ScreenFrame>
  </App>
}

export const HAEMONC: Pic[] = [
  { id: 'haem-blood', title: 'Haematology · ordering blood', note: '/blood for a young woman with thalassaemia: product, needs, units, why, her Hb, consent, the sample, how soon; the Transfusions section holds her programme, iron and chelation; the Blood bank answers. Q35.', Page: HaemBlood },
  { id: 'haem-bedside', title: 'Haematology · blood at the bedside', note: 'On the ward: two people check the unit against the patient; signs before, at 15 minutes and at the end; a reaction stops it and is recorded. Q36.', Page: HaemBedside },
  { id: 'haem-inr', title: 'Haematology · the INR clinic', note: 'Warfarin: the reason and target, the INRs in their band, time in range; today\'s INR, what changed, the clinic\'s table, the new week, the next INR, her table in Arabic. Q37, Q38.', Page: HaemInr },
  { id: 'onc-plan', title: 'Oncology · the cancer\'s record', note: 'One section: diagnosis, stage, markers, ECOG, intent, the plan, the regimen from the clinic\'s list and the cycles given; the tumour board\'s decision as a note.', Page: OncPlan },
  { id: 'onc-cycle', title: 'Oncology · today\'s cycle', note: '/chemo: BSA from today\'s height and weight, each dose worked out, the checks shown, the toxicity graded, Give, Delay or Reduce; the pharmacy prepares, the day unit gives. Q39.', Page: OncCycle },
  { id: 'onc-unit', title: 'Chemotherapy day unit · the chairs', note: 'The base\'s board with chairs: the regimen and where the cycle is on each tile, two buttons; today\'s cycles not in a chair yet below. Q40.', Page: OncUnit },
]
