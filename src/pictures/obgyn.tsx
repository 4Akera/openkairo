// ObGyn's clinic, drawn with the last group (2026-10-08, proposed by Claude, awaiting the owner): the obgyn pack's labour ward part is
// in labour.tsx; this file draws its clinic part — the antenatal visit and the pregnancy's record, the scan in the clinic, gynaecology
// (periods, contraception, cervical screening) and the visit after the birth. The base already knows a pregnancy (the banner's
// "Pregnant · n wk"), vitals, results, scores and the given; the pack adds what the base lacks and the pregnancy's own section.
import type { ReactNode } from 'react'
import { History, Plus, X } from 'lucide-react'
import { Badge, Button, Callout, Card, Chip, FormRow, IconButton, Input, Kbd, ListRow, ListSection, ScreenFrame, Select, Tag, cn, type RowMark, type ScreenView, type Tone } from '@core/ui'
import { Arabic } from './kit'
import { Ask, Chips, Keys, Label, Line, Page, Rec, Row, Table, Under, Unsigned, V, Visit, Word, noop, type Pic } from './clinics'

const OBC = 'ObGyn clinic'
const NERMEEN = 'Dr. Nermeen Fathy'

// ── 1 · the antenatal visit ──
export function AncVisit() {
  const record = <>
    <Chips on="Pregnancy" lead={[['Summary'], ['Pregnancy', '28+3 w']]} base={[['Problems', '1'], ['Medicines', '2'], ['Allergies', 'none known'], ['Results', '6']]} more={4} />
    <Rec title="Summary" folded="BP 118/74 · Hb 10.4 ↓ · ferrous sulphate, folic acid · next visit 32 w" />
    <Rec title="Pregnancy" right={<span className="text-12 text-faint">booked at 8+2 w</span>}>
      <Row k="Dates">LMP 23 Mar · EDD <b className="font-semibold">28 Dec</b> by the scan at 8+2 w (the LMP agreed)</Row>
      <Row k="Before">G3 P1+1 · caesarean 2023 (breech) · miscarriage 2024 at 9 w</Row>
      <Row k="Blood group" tone="warn">O Rh negative · antibodies none at 12 w</Row>
      <Row k="Risks">previous caesarean: the plan for the birth at 36 w · Rh negative</Row>
      <Label className="pt-2">Visits</Label>
      <Table head={['Weeks', 'BP', 'kg', 'Fundus', 'FHR', 'Urine', 'Lie']} rows={[
        ['12+1', '112/70', '62', '—', '158', 'nil', '—'], ['16+0', '110/68', '64', '—', '150', 'nil', '—'],
        ['20+2', '114/72', '66', '20', '148', 'nil', '—'], ['24+4', '116/74', '68.5', '25', '146', 'trace', 'ceph'],
      ]} />
      <Label className="pt-2">Tests</Label>
      <Row k="Hb">10.4 g/dL <V f="low">at 24 w</V></Row>
      <Row k="Sugar">OGTT 75 g <span className="text-warn">due 24–28 w, not done</span></Row>
      <Row k="Infections">HBsAg, syphilis, HIV negative · urine culture no growth</Row>
      <Row k="Scans">8+2 dating · 20+5 anomaly normal, placenta posterior high</Row>
    </Rec>
    <Rec title="Problems" count={1} folded="Anaemia in pregnancy (O99.0)" />
  </>
  return <Visit dept={OBC} user={NERMEEN} who={['Rania Saad', '29 y · F · #10593']} where="In consult · antenatal · 7 min"
    safety={<><span className="text-12 text-faint">No known allergies</span><Badge tone="info">Pregnant · 28 wk</Badge></>}
    words={<><Word>G3 P1+1</Word><Word tone="warn">Rh negative</Word></>} plus={1} record={record}>
    <Line>/anc bp 118/74 wt 71 sfh 29 fhr 144 ceph</Line>
    <Under>
      <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Antenatal visit · 28+3 w</b>
        <span className="text-muted">the weeks from the EDD, never typed</span></p>
      <div className="grid gap-x-6 gap-y-1.5 px-1 sm:grid-cols-2">
        <Row k="BP">118/74</Row><Row k="Weight">71 kg <span className="text-12 text-faint">+9 since booking</span></Row>
        <Row k="Fundus" tone="ok">29 cm · fits 28 w (±2)</Row><Row k="Baby's heart">144 /min</Row>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><Label>Lie</Label>{['Cephalic', 'Breech', 'Transverse', 'Not sure'].map((c, i) => <Chip onClick={noop} key={c} on={i === 0}>{c}</Chip>)}
        <Label className="ms-3">Moves</Label><Chip onClick={noop} on>felt</Chip><Chip onClick={noop}>less</Chip></div>
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><Label>Urine protein</Label>{['nil', 'trace', '+', '++', '+++'].map((c, i) => <Chip onClick={noop} key={c} on={i === 0}>{c}</Chip>)}
        <Label className="ms-3">Oedema</Label><Chip onClick={noop} on>none</Chip><Chip onClick={noop}>feet</Chip><Chip onClick={noop}>face, hands</Chip></div>
      <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5">
        <Label>Due at 28 weeks · the clinic's schedule</Label>
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="warn">Rh negative</Tag><span className="text-fg">Anti-D 1500 IU IM</span>
          <span className="text-muted">antibodies none at 12 w</span><Chip onClick={noop} className="ms-auto" on>Give now</Chip></p>
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="warn">not done</Tag><span className="text-fg">OGTT 75 g</span>
          <span className="text-muted">fasting, at 24–28 w</span><Chip onClick={noop} className="ms-auto" on>Order</Chip></p>
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag>dose 2</Tag><span className="text-fg">Tetanus toxoid</span>
          <span className="text-muted">dose 1 at 20 w</span><Chip onClick={noop} className="ms-auto">Give now</Chip></p>
        <p className="text-12 text-faint">Each is a chip to take or leave; nothing waits for it. The schedule is the clinic's (a setting: weeks, what, for whom).</p>
      </div>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the visit and the chips taken <Input readOnly value="next 32 w" className="ms-auto h-7 w-28 text-12" /></Keys>
    </Under>
    <Unsigned n={4}>
      <p className="text-fg">Antenatal visit · 28+3 w · BP 118/74 · 71 kg · fundus 29 · FHR 144 · cephalic · urine nil</p>
      <p className="text-fg">Anti-D immunoglobulin 1500 IU IM · given now</p>
      <p className="text-fg">OGTT 75 g · Laboratory</p>
      <p className="text-fg">Next visit · 32 w · Mon 2 Nov · ObGyn clinic <span className="text-12 text-faint">the booking</span></p>
    </Unsigned>
    <p className="text-12 text-faint">BP and weight go into the base's vitals in the same set; the fundus, the baby's heart, the lie, moves, urine and oedema are the pack's
      antenatal check. The weeks, the fundus against the weeks and what is due are worked out, never typed.</p>
    <Ask n={17}>The pregnancy's record as one section of the chart (dates, before, blood group, risks, every visit as a row, the tests and scans), filled from the
      base's pregnancy, vitals and results plus the pack's antenatal check (drawn)? Or the paper card's layout, a printed-looking page of its own?</Ask>
  </Visit>
}

// The pictures after the model share these: a second obstetrician (he works the labour ward too, labour.tsx), a line of choices in a card,
// a box inside a card, a record section's rows, the drafts' lines
const ZAKI = 'Dr. Ahmed Zaki'
const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
/** a line of choices inside a card: its label, then chips (the one `on` taken) and whatever follows */
const Choose = ({ label, of = [], on, children }: { label: string; of?: string[]; on?: string; children?: ReactNode }) =>
  <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><span className="w-24 shrink-0 text-12 text-faint">{label}</span>
    {of.map((c) => <Chip onClick={noop} key={c} on={c === on}>{c}</Chip>)}{children}</div>
const Box = ({ title, tone, children }: { title: string; tone?: 'warn'; children: ReactNode }) =>
  <div className={cn('grid gap-1.5 rounded-lg border bg-surface p-2.5', tone === 'warn' ? 'border-warn-line' : 'border-line')}><Label>{title}</Label>{children}</div>
const Rows = ({ rows }: { rows: [string, ReactNode, Tone?][] }) => <>{rows.map(([k, v, t]) => <Row key={k} k={k} tone={t}>{v}</Row>)}</>
const Drafts = ({ lines }: { lines: [ReactNode, string?][] }) =>
  <Unsigned n={lines.length}>{lines.map(([t, f], i) => <p key={i} className="text-fg">{t}{f && <> <Faint>{f}</Faint></>}</p>)}</Unsigned>
const Head = ({ title, sub }: { title: string; sub: string }) =>
  <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">{title}</b><span className="text-muted">{sub}</span></p>
const pregnant = (wk: number) => <><span className="text-12 text-faint">No known allergies</span>{wk > 44 ? <Badge tone="warn">Pregnancy · check ({wk} wk)</Badge> : <Badge tone="info">Pregnant · {wk} wk</Badge>}</>

// ── 2 · the scan in the clinic ──
/** Hadlock 1991's fetal weight from 20 to 40 weeks, the 50th centile in grams; its 10th and 90th are three and five quarters of it */
const HADLOCK = [331, 399, 478, 568, 670, 785, 913, 1055, 1210, 1379, 1559, 1751, 1953, 2162, 2377, 2595, 2813, 3028, 3236, 3435, 3619]
function GrowthChart() {
  const W = 340, H = 206, L = 36, R = 34, T = 8, B = 22, scans: [number, number][] = [[20 + 4 / 7, 360], [28 + 1 / 7, 1090], [32, 1419]]
  const x = (w: number) => L + (w - 20) * ((W - L - R) / 20), y = (g: number) => T + (4600 - g) * ((H - T - B) / 4600)
  const at = (k: number) => HADLOCK.map((g, i) => `${x(20 + i)},${y(g * k)}`)
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Estimated fetal weight against the weeks: 360 g at 20+4 (44th centile), 1 090 g at 28+1 (27th), 1 419 g at 32+0 (8th, under the 10th)">
    {[1000, 2000, 3000, 4000].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="stroke-line" /><text x={L - 6} y={y(g) + 4} textAnchor="end" className="fill-faint text-11">{g / 1000} kg</text></g>)}
    {[20, 24, 28, 32, 36, 40].map((w) => <g key={w}><line x1={x(w)} x2={x(w)} y1={T} y2={H - B} className="stroke-line" /><text x={x(w)} y={H - 6} textAnchor="middle" className="fill-faint text-11">{w} w</text></g>)}
    <polygon points={[...at(1.25), ...at(0.75).reverse()].join(' ')} className="fill-accent-soft" /><polyline points={at(1).join(' ')} className="fill-none stroke-accent" strokeWidth={1.5} />
    {[0.75, 1.25].map((k) => <polyline key={k} points={at(k).join(' ')} className="fill-none stroke-accent" strokeWidth={1} strokeDasharray="4 3" />)}
    {([[1.25, '90th'], [1, '50th'], [0.75, '10th']] as const).map(([k, t]) => <text key={t} x={x(40) + 4} y={y(3619 * k) + 4} className="fill-muted text-11">{t}</text>)}
    <polyline points={scans.map(([w, g]) => `${x(w)},${y(g)}`).join(' ')} className="fill-none stroke-fg" strokeWidth={1.5} />
    {scans.map(([w, g], i) => <circle key={w} cx={x(w)} cy={y(g)} r={i === 2 ? 4.5 : 3.5} className={i === 2 ? 'fill-warn stroke-surface' : 'fill-surface stroke-fg'} strokeWidth={1.5} />)}
    <text x={x(32) + 8} y={y(1419) + 14} className="fill-warn text-11 font-medium">1 419 g · 8th</text>
  </svg>
}
export function ObScan() {
  const record = <>
    <Chips on="Pregnancy" lead={[['Summary'], ['Pregnancy', '32+0 w']]} base={[['Problems'], ['Medicines', '2']]} more={6} />
    <Rec title="Summary" folded="BP 110/70 at 28 w · OGTT normal · folic acid, ferrous sulphate · next visit 32 w" />
    <Rec title="Pregnancy" right={<Faint>booked at 12+3 w</Faint>}>
      <Rows rows={[['Dates', <>LMP 26 Feb · EDD <b className="font-semibold">3 Dec</b> by the LMP (the scan at 12+3 w agreed)</>], ['Before', 'G1 P0 · her first pregnancy'],
        ['Blood group', 'A Rh positive · antibodies none'], ['Risks', 'none at booking'], ['Anomaly scan', '20+4 w, Radiology · normal']]} />
      <Label className="pt-2">Visits</Label><Table head={['Weeks', 'BP', 'kg', 'Fundus', 'FHR', 'Lie']} rows={[['16+1', '106/66', '61', '—', '152', '—'],
        ['20+4', '108/66', '62', '20', '150', '—'], ['24+2', '108/68', '63', '24', '148', '—'], ['28+1', '110/70', '65', '27', '146', 'ceph']]} />
      <Label className="pt-2">Scans</Label><Table head={['Weeks', 'EFW', 'Centile', 'Pool', 'By']} rows={[['12+3', 'CRL 62', '—', '—', 'here'],
        ['20+4', '360 g', '44th', 'normal', 'Radiology'], ['28+1', '1 090 g', '27th', '4.1 cm', 'here']]} />
      <Label className="pt-2">Tests</Label><Rows rows={[['Hb', '11.2 g/dL at 28 w'], ['Sugar', 'OGTT 75 g at 26 w · 82 · 150 · 128 mg/dL, normal'], ['Infections', 'HBsAg, HCV, HIV, syphilis negative']]} />
    </Rec>
  </>
  return <Visit dept={OBC} user={ZAKI} who={['Nahla Gaber', '26 y · F · #10342']} where="In consult · antenatal · 12 min" safety={pregnant(32)} words={<Word>G1 P0</Word>} record={record}>
    <Line>/obus bpd 78 hc 288 ac 245 fl 57 dvp 1.8 post ceph fhr 146</Line>
    <Under tone="warn">
      <Head title="Scan in the clinic · 32+0 w" sub="the doctor's own scan, no order · the weeks from the EDD" />
      <div className="grid gap-3 px-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><div className="grid content-start gap-1">
        <Table head={['Measure', 'mm', 'Fits']} rows={[['BPD', '78', '30+4 w'], ['HC', '288', '31+2 w'], ['AC', <V f="low">245</V>, <span className="text-warn">28+5 w</span>], ['FL', '57', '29+4 w']]} />
        <p className="px-2 text-12 text-muted">HC/AC 1.18: the head large for the belly</p>
        <p className="flex flex-wrap items-baseline gap-2 px-2 pt-1"><b className="text-18 font-semibold text-warn tnum">EFW 1 419 g</b><V f="low">8th centile</V></p>
        <p className="px-2 text-12 text-faint">Hadlock's formula from the four; the centile for 32+0 w on the clinic's chart (Hadlock 1991). Worked out, never typed.</p>
      </div><div className="rounded-md bg-surface p-2 ring-1 ring-line"><Label>Fetal weight · the 10th to the 90th centile</Label><GrowthChart /></div></div>
      <Choose label="Liquor"><span className="text-muted">deepest pool</span><Input readOnly dense value="1.8" className="w-14 tnum" /><span className="text-muted">cm</span><Tag tone="warn">reduced · under 2 cm</Tag><Chip onClick={noop}>AFI instead</Chip></Choose>
      <Choose label="Placenta" of={['Anterior', 'Posterior', 'Fundal', 'Low-lying']} on="Posterior"><Faint>clear of the cervix</Faint></Choose>
      <Choose label="Presentation" of={['Cephalic', 'Breech', 'Transverse']} on="Cephalic"><span className="ms-3 text-12 text-faint">Heart</span><span className="text-fg tnum">146 /min · regular</span><span className="ms-3 text-12 text-faint">Moves</span><Chip onClick={noop} on>seen</Chip></Choose>
      <Callout tone="warn" className="animate-none!" title="Small for the weeks">EFW on the 8th centile (the 27th at 28 w), the AC fits 28+5 w, the liquor reduced. A notice only: the doctor decides (the cord's Doppler, the next scan, when and where she gives birth).</Callout>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the scan · <span className="font-mono">doppler</span> adds the cord's and the brain's PI when done</Keys>
    </Under>
    <Drafts lines={[[<>Antenatal visit · 32+0 w · BP 112/70 · 66 kg · fundus 28 <span className="text-warn">under 30–34</span> · FHR 146 · cephalic</>],
      ['Scan in the clinic · 32+0 w · EFW 1 419 g, 8th centile · AC 245 mm · deepest pool 1.8 cm · posterior · cephalic · FHR 146', 'a result, no order'], ['Small for the weeks · O36.5', 'problem'], ['Next visit · 34 w · Thu 22 Oct · ObGyn clinic', 'the booking']]} />
    <p className="text-12 text-faint">The scan is the base's result: each measure, the fetal weight and its centile, the liquor, placenta, presentation and heart an analyte, written by the doctor with no order, as an outside result already is (no core change). The pack brings the card, the numbers worked out and the chart; the fundus stays the antenatal check's.</p>
    <Ask n={18}>The clinic's own scan as a result the doctor writes in the visit, with no order (drawn: /obus, kept in the pregnancy's Scans with who scanned)? Or always an order to Radiology's ultrasound, answered on its bench even when the obstetrician scans in his own room? Or both: the clinic's own for the look at each visit, Radiology's for the anomaly scan and a second opinion, as at 20+4 w here.</Ask>
  </Visit>
}

// ── 3 · a gynaecology visit ──
export function GynVisit() {
  const record = <>
    <Chips on="Gynaecology" lead={[['Summary'], ['Gynaecology', 'IUD due', 'warn'], ['Pregnancy', 'P3']]} base={[]} more={7} />
    <Rec title="Summary" folded="heavy periods · fibroid 3.2 cm · Hb 9.8 ↓ · copper IUD since 2016" />
    <Rec title="Gynaecology" tone="attention" right={<Faint>last seen Nov 2023</Faint>}>
      <Label>Periods</Label><Rows rows={[['Last', '21 Sep · day 18 today'], ['Cycle', 'every 26–28 days · bleeds 8–9 days'],
        ['Flow', 'heavy · clots · floods at night · 8 pads a day on days 1–3', 'warn'], ['Pain', 'moderate · days 1–2']]} />
      <Label className="pt-2">Contraception</Label><Rows rows={[['Method', 'copper IUD (T380A) · since Mar 2016'], ['Change', 'due Mar 2026 · 7 months past', 'warn']]} />
      <Label className="pt-2">Cervical screening</Label><Rows rows={[['Last', 'Pap smear Nov 2023 · normal (NILM)'], ['Next', 'Nov 2026 · every 3 years, the clinic\'s']]} />
      <Label className="pt-2">Scans</Label><Rows rows={[['2 Oct', 'transvaginal, Radiology · a fibroid 3.2 cm in the back wall, intramural, the cavity not distorted (FIGO 4) · lining 8 mm · the IUD in place · ovaries normal']]} />
    </Rec>
    <Rec title="Problems" count={3}>{([['Heavy periods', 'N92.0 · since 2025'], ['Fibroid, intramural', 'D25.1 · 2 Oct'], ['Iron deficiency anaemia', 'D50.0 · 2 Oct']]).map(([p, w]) =>
      <p key={p} className="text-13 text-fg">{p} <Faint>{w}</Faint></p>)}</Rec>
    <Rec title="Results" count={4} folded="2 Oct · Hb 9.8 ↓ · MCV 71 ↓ · ferritin 6 ↓ · TSH 1.9" />
  </>
  return <Visit dept={OBC} user={NERMEEN} who={['Eman Abdelaal', '42 y · F · #10471']} where="In consult · gynaecology · 14 min"
    safety={<span className="text-12 text-faint">No known allergies</span>} words={<><Word>P3</Word><Word tone="warn">IUD change due</Word></>} record={record}>
    <Line>/fp hormonal iud</Line>
    <Under>
      <Head title="Contraception · from today" sub="now a copper IUD since Mar 2016, its change 7 months past" />
      <Choose label="Method" of={['Pills', 'Mini-pill', 'Injection', 'Implant', 'Copper IUD', 'Hormonal IUD', 'Condoms', 'Tubes tied', 'None']} on="Hormonal IUD" />
      <div className="grid gap-x-6 gap-y-1 px-1 sm:grid-cols-2"><Rows rows={[['Device', 'Mirena · levonorgestrel 52 mg'], ['Lot', <Input readOnly dense value="TU02FHM" className="w-28 font-mono" />],
        ['Change by', 'Oct 2031 · 5 years for heavy periods', 'ok'], ['The old one', 'copper IUD ends today']]} /></div>
      <Box title="Beside the choice"><p className="text-13 text-fg">Not pregnant: LMP 21 Sep with a copper IUD in place · the fibroid does not distort the cavity (scan 2 Oct) · Hb <V f="low">9.8</V> · day 18 of her cycle: condoms for 7 days</p><Faint>Facts shown, never a stop: the doctor decides.</Faint></Box>
      <Box title="The change · the base's procedure">
        <Choose label="Copper IUD out" of={['intact', 'broken', 'threads not seen']} on="intact" />
        <Choose label="Sounds"><Input readOnly dense value="8" className="w-12 tnum" /><span className="text-muted">cm</span><span className="ms-3 text-12 text-faint">threads cut at</span><Input readOnly dense value="3" className="w-12 tnum" /><span className="text-muted">cm</span></Choose>
        <Choose label="How it went" of={['no problems', 'pain', 'fainted', 'hard to pass']} on="no problems" />
        <Choose label="Tell her"><Arabic>استعملي الواقي ٧ أيام. ممكن ينزل دم خفيف أول ٣ شهور، ده طبيعي. ارجعي بعد ٦ أسابيع.</Arabic></Choose>
      </Box>
      <Box title="Due · the clinic's intervals"><p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="info">due Nov</Tag><span className="text-fg">Pap smear</span>
        <span className="text-muted">last Nov 2023, normal · every 3 years</span><Chip onClick={noop} className="ms-auto" on>Take today</Chip></p></Box>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the method, the change and the chips taken</Keys>
    </Under>
    <Drafts lines={[['Periods · LMP 21 Sep · every 26–28 days · 8–9 days · heavy, clots · pain moderate'],
      ['Contraception · hormonal IUD (Mirena 52 mg) from today · change by Oct 2031 · the copper IUD ended after 10 years'],
      ['Copper IUD removed, intact · Mirena inserted, lot TU02FHM · sounds 8 cm · threads 3 cm · no problems', 'procedure'], ['Pap smear · Laboratory'], ['Ferrous sulphate 200 mg · once a day · 3 months'], ['Next visit · 6 w · Thu 19 Nov · the threads and Hb · ObGyn clinic', 'the booking']]} />
    <p className="text-12 text-faint">Base entries: the LMP an observation (LOINC 8665-2), the method another (8659-5, birth control method), the IUD's change a procedure, the smear an order and later a result, the iron a medication. The pack's own: the periods' pattern (cycle, days, flow, pain). The section fits women 10 and over.</p>
    <Ask n={19}>What is due in gynaecology (an IUD's change, the next injection, the pills running out, a smear) worked out from what was written and the clinic's intervals, and said in amber on the section's chip, the banner and the queue (drawn)? Or a “next due” date the doctor types each time, shown only in the section.</Ask>
  </Visit>
}

// ── 4 · the visit after the birth ──
const EPDS: [string, number][] = [['Laughing', 1], ['Looking forward', 1], ['Blaming herself', 2], ['Anxious, worried', 2], ['Scared, panicky', 2], ['On top of her', 2], ['Too unhappy to sleep', 1], ['Sad, miserable', 2], ['Crying', 1], ['Harming herself', 0]]
export function PostnatalVisit() {
  const ziad = <span className="text-accent underline decoration-accent-line underline-offset-2">Ziad Hossam Elsayed · #10477 ›</span>
  const record = <>
    <Chips on="Pregnancy" lead={[['Summary'], ['Pregnancy', 'not ended', 'warn'], ['Gynaecology']]} base={[['Problems']]} more={6} />
    <Rec title="Summary" folded="last seen at 38+2 w · BP 118/76 · ferrous sulphate, folic acid" />
    <Rec title="Pregnancy" tone="attention" right={<Faint>booked at 9+1 w</Faint>}>
      <Rows rows={[['Dates', <>LMP 27 Nov · EDD <b className="font-semibold">3 Sep</b> (the scan at 9+1 w agreed)</>], ['Before', 'G2 P1 · normal birth 2023, a girl 3.1 kg'], ['Blood group', 'B Rh positive']]} />
      <Label className="pt-2">Last visits</Label><Table head={['Weeks', 'BP', 'kg', 'Fundus', 'FHR', 'Lie']} rows={[['34+1', '116/74', '72', '33', '144', 'ceph'],
        ['36+2', '118/76', '73', '35', '140', 'ceph'], ['38+2', '118/76', '74', '37', '138', 'ceph']]} />
      <Rows rows={[['The birth', 'not written · last seen at 38+2 w (22 Aug); the record still counts 45 w', 'warn'], ['Her baby', <>{ziad} <Faint>boy · 6 w · his own record</Faint></>]]} />
    </Rec>
    <Rec title="Gynaecology" folded="no contraception since the pregnancy · Pap Mar 2024 normal" />
  </>
  return <Visit dept={OBC} user={ZAKI} who={['Aya Ramadan', '27 y · F · #10266']} where="In consult · after the birth · 9 min" safety={pregnant(45)} words={<Word>G2 P1</Word>} record={record}>
    <Line>/pn bp 122/78 bleeding none wound healed breast</Line>
    <Under>
      <Head title="The visit after the birth · 6 w" sub="day 42 since the birth" />
      <Box title="The birth · not in her record: she gave birth elsewhere" tone="warn">
        <Choose label="Born"><Input readOnly dense value="27 Aug" className="w-20" /><span className="text-muted">39+0 w</span></Choose>
        <Choose label="Where" of={['Our labour ward', 'Another hospital']} on="Another hospital"><Input readOnly dense value="Heliopolis, private" className="w-40" /></Choose>
        <Choose label="How" of={['Normal', 'Vacuum', 'Forceps', 'Caesarean']} on="Caesarean"><Input readOnly dense value="labour stopped at 6 cm" className="w-44" /></Choose>
        <Choose label="Baby" of={['Boy', 'Girl']} on="Boy"><span className="text-fg tnum">3 400 g · well</span><span className="ms-2 text-13">{ziad}</span></Choose>
        <p className="px-1 text-12 text-muted">Writes the birth (the labour ward's own type, where: another hospital) and ends her pregnancy: the base's pregnancy, ended, reason birth, 27 Aug. Once: a birth signed on our labour ward ends it there, and this box does not show.</p>
      </Box>
      <Choose label="BP"><span className="text-fg tnum">122/78</span><span className="ms-4 text-12 text-faint">Bleeding</span>{['none', 'light', 'heavy'].map((c) => <Chip onClick={noop} key={c} on={c === 'none'}>{c}</Chip>)}</Choose>
      <Choose label="Wound" of={['healed', 'red', 'oozing', 'opened']} on="healed"><Faint>a caesarean; after a normal birth, the perineum</Faint></Choose>
      <Choose label="Feeding" of={['breast only', 'breast and formula', 'formula only']} on="breast only"><Faint>the base's breastfeeding</Faint></Choose>
      <Box title="Mood · EPDS, the base's score card" tone="warn">
        <div className="grid gap-x-4 sm:grid-cols-2">{EPDS.map(([q, p], i) => <p key={q} className="flex justify-between gap-2 px-1 text-13 tnum"><span className="text-muted">{i + 1} · {q}{i === 9 && <span className="text-fg"> · never</span>}</span><span className={p ? 'font-medium text-warn' : 'text-faint'}>{p}</span></p>)}</div>
        <p className="flex flex-wrap items-baseline gap-2 px-1 pt-1"><b className="text-18 font-semibold text-warn tnum">EPDS 14</b><span className="text-warn">13 or more · possible depression</span><Faint>worked out by the server · EPDS, 1987</Faint></p>
      </Box>
      <Choose label="Contraception" of={['Mini-pill', 'Injection', 'Implant', 'Copper IUD', 'Hormonal IUD', 'Condoms', 'Not yet']} on="Mini-pill" />
      <p className="ps-[6.75rem] text-12 text-faint">Breastfeeding at 6 weeks: combined pills wait to 6 months (WHO MEC 3). Shown, never a stop.</p>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the visit, the birth, the score and the method</Keys>
    </Under>
    <Callout tone="warn" className="animate-none!" title="EPDS 14 · possible depression">Talk with her today; see her again in 2 weeks or refer her (Psychiatry). Question 10, harming herself: never. A notice only, the doctor decides.</Callout>
    <Drafts lines={[['Visit after the birth · 6 w · BP 122/78 · no bleeding · wound healed'],
      [<>The birth · 27 Aug · 39+0 w · another hospital · caesarean, labour stopped at 6 cm · boy 3.4 kg · <b className="font-medium">ends the pregnancy</b></>],
      ['Breastfeeding · breast only'], ['EPDS 14 · possible depression', 'score'], ['Contraception · mini-pill from today'],
      [<>Exluton (lynestrenol 0.5 mg) · one a day at the same hour · 3 packs <Arabic className="ms-2 text-13">حباية كل يوم في نفس الميعاد</Arabic></>], ['Next visit · 2 w · Thu 22 Oct · her mood · ObGyn clinic', 'the booking']]} />
    <p className="text-12 text-faint">Base entries: BP in the vitals; breastfeeding the base's fact (at Done the banner's “Pregnancy · check (45 wk)”, the base's word for a pregnancy past 44 weeks never ended, gives way to “Breastfeeding”, G2 P1 to G2 P2); EPDS the base's score, a declared table the server adds up; the mini-pill a medication. The pack's own: the visit after the birth (bleeding, the wound) and the birth.</p>
    <p className="text-12 text-faint">His record opens from hers. How the two were linked (the desk, or the birth's own Done) is the labour ward's Q10.</p>
    <Ask n={20}>A birth elsewhere written at the first visit after it, as the same birth entry the labour ward signs (where: another hospital; drawn), so it ends the pregnancy once and her next pregnancy's “Before” counts it? Or only a note and /preg end delivered, with the next “Before” typed by hand.</Ask>
  </Visit>
}

// ── 5 · the clinic's queue, the pack's one word a row ──
export function ObQueue() {
  const views: ScreenView<string>[] = [{ id: 'queue', label: 'Queue', count: 7 }, { id: 'review', label: 'To review', count: 2, needs: 'warn' }]
  const rows: [string, string, string, string, string, RowMark['tone'] | undefined, number][] = [['10471', 'Eman Abdelaal', '42 F', 'vitals taken', 'IUD change due', 'info', 19],
    ['10266', 'Aya Ramadan', '27 F', 'vitals taken', 'birth not written', 'info', 12], ['10489', 'Yara Helmy', '24 F', '1st visit', '8 w', undefined, 7], ['10214', 'Manal Badawy', '38 F', 'vitals taken', '37 w', undefined, 3]]
  const row = ([n, name, age, status, word, tone, min]: (typeof rows)[number], who?: string, next?: boolean) =>
    <ListRow key={n} next={next} number={n} name={name} age={age} status={status} who={who} marks={[{ key: 'obgyn', word, tone }]} minutes={min} />
  return <Page dept={OBC} user={ZAKI} tabs={['Queue', 'Diary']} tab="Queue">
    <ScreenFrame views={views} view="queue" onView={noop} search={<Input readOnly placeholder="Type a name or number — ↵ takes the next patient" className="w-full sm:w-80" />}>
      <Card className="overflow-hidden"><ul>
        <ListSection title="Next" />{row(['10483', 'Reham Nassar', '35 F', 'vitals taken', 'BP 150/100', 'warn', 24], undefined, true)}
        <ListSection title="Waiting" count={4} />{rows.map((r) => row(r))}
        <ListSection title="With a doctor" count={2} />{row(['10593', 'Rania Saad', '29 F', `with ${NERMEEN}`, 'anti-D due', 'info', 7], NERMEEN)}{row(['10342', 'Nahla Gaber', '26 F', `with ${ZAKI}`, '32 w', undefined, 12], ZAKI)}
        <ListSection title="Waiting for results" count={1} folded onToggle={noop} /><ListSection title="Done today" count={6} />
      </ul></Card>
      <p className="text-12 text-faint">One word a row, the ObGyn pack's mark (rule 4), read from the record and today's vitals: a warning first (BP 140/90 or more, urine protein ++), then what is due (the schedule's anti-D or OGTT, an IUD's change, a smear), then the weeks. A woman not pregnant gets a word only when something is due. Aya's pregnancy still stands at 45 weeks, so “birth not written” until her visit after the birth writes it.</p>
      <p className="text-12 text-faint">The order of the words is asked with the schedule's settings: Q21.</p>
    </ScreenFrame>
  </Page>
}

// ── 6 · the pack's settings, as the platform draws them ──
/** a setting's card as the platform draws it (rule 7): its name and History, the automatic form, who changed it, Save */
const SetCard = ({ title, children }: { title: string; children: ReactNode }) => <Card className="overflow-hidden">
  <div className="flex items-center gap-2 border-b border-line px-4 py-2.5"><span className="text-14 font-semibold text-fg">{title}</span><Button size="xs" variant="ghost" className="ms-auto"><History />History</Button></div>
  <div className="grid gap-4 p-4">{children}<div className="flex items-center gap-2 border-t border-line pt-3"><Faint>Changed by {NERMEEN} · 2 Oct 09:14</Faint><Button size="sm" className="ms-auto" disabled>Save</Button></div></div>
</Card>
/** the automatic form's small table: a column a field, a row an item, each removable, then + Row */
const FormTable = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => <div className="grid gap-2"><div className="overflow-x-auto"><table className="w-full text-13">
  <thead><tr className="border-b border-line text-11 uppercase tracking-[0.08em] text-faint">{head.map((h) => <th key={h} className="py-1.5 pe-2 text-start font-medium">{h}</th>)}<th className="w-8" /></tr></thead>
  <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line align-top last:border-0">{r.map((c, j) => <td key={j} className="py-1 pe-2">{c}</td>)}
    <td className="py-1"><IconButton title={`Remove row ${i + 1}`} tone="danger" onClick={noop}><X /></IconButton></td></tr>)}</tbody>
</table></div><div><Button size="sm" variant="outline"><Plus />Row</Button></div></div>
const num = (v: string) => <Input readOnly dense value={v} className="w-14 tnum" />
const text = (v: string, w = 'min-w-48') => <Input readOnly dense value={v} className={cn('w-full', w)} />
const pick = (v: string, of: string[]) => <Select dense value={v} onChange={noop} className="w-full min-w-36">{of.map((o) => <option key={o}>{o}</option>)}</Select>
const chips = (of: string[], on: string) => <span className="flex flex-wrap gap-1.5">{of.map((c) => <Chip onClick={noop} key={c} on={c === on}>{c}</Chip>)}</span>
const half = 'md:grid-cols-[8.5rem_1fr] md:gap-4'
const nums = (...parts: ReactNode[]) => <span className="flex flex-wrap items-center gap-1.5 text-13 text-muted">{parts}</span>
export function ObSettings() {
  const whom = ['Everyone', 'Rh negative', 'Previous caesarean', '35 or older', 'Pre-eclampsia risk', 'Diabetes']
  const schedule: [string, string, string, string][] = [
    ['6', '13', 'Booking bloods (the lab preset) · Laboratory', 'Everyone'], ['11', '14', 'Dating and nuchal scan · here', 'Everyone'], ['11', '14', 'Combined screening (NT, PAPP-A, hCG) · Laboratory', '35 or older'], ['12', '16', 'Aspirin 150 mg at night, to 36 w · a prescription', 'Pre-eclampsia risk'],
    ['20', '22', 'Anomaly scan · Radiology', 'Everyone'], ['20', '32', 'Tetanus toxoid, 2 doses 4 weeks apart · given here', 'Everyone'], ['24', '28', 'OGTT 75 g · Laboratory', 'Everyone'], ['28', '28', 'CBC · Laboratory', 'Everyone'], ['28', '28', 'Anti-D 1500 IU IM · given here', 'Rh negative'],
    ['32', '34', 'Growth scan · here', 'Everyone'], ['36', '37', 'Plan for the birth · a check', 'Previous caesarean'], ]
  const methods = [['Copper IUD', '10', 'years'], ['Hormonal IUD', '8', 'years'], ['Hormonal IUD, heavy periods', '5', 'years'], ['Implant', '3', 'years'], ['Injection (DMPA 150 mg)', '12', 'weeks']]
  return <Page dept="Settings" user={NERMEEN}>
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4">
      <div><p className="text-18 font-semibold text-fg">Settings · Packs · ObGyn</p><p className="text-13 text-muted">The clinic's, for every department that uses the pack: ObGyn clinic · Labour ward · Family medicine</p></div>
      <SetCard title="Antenatal schedule">
        <p className="-mt-1 text-12 text-faint">What is due at which weeks, and for whom. The antenatal card offers each as a chip to take or leave (Order, Give now, a check) and the queue says it.</p>
        <FormTable head={['From (w)', 'To (w)', 'What', 'For whom']} rows={schedule.map(([f, t, w, p]) => [num(f), num(t), text(w, 'min-w-64'), pick(p, whom)])} />
      </SetCard>
      <div className="grid gap-4 md:grid-cols-2">
        <SetCard title="Visits and the fundus">
          <FormRow className={half} label="How often" hint="the antenatal card's next visit"><FormTable head={['Until (w)', 'Every (w)']} rows={[[num('28'), num('4')], [num('36'), num('2')], [num('42'), num('1')]]} /></FormRow>
          <FormRow className={half} label="The fundus fits the weeks" hint="cm against the weeks; outside the band the card says so in amber">{nums('±', num('2'), 'cm · from', num('24'), 'w')}</FormRow>
        </SetCard>
        <SetCard title="Notices on the cards">
          <FormRow className={half} label="BP from">{nums(num('140'), '/', num('90'), 'mmHg')}</FormRow>
          <FormRow className={half} label="Urine protein from">{chips(['+', '++', '+++'], '++')}</FormRow>
          <FormRow className={half} label="Baby's weight" hint="its centile on the chart below">{nums('under', num('10'), 'over', num('90'))}</FormRow>
          <FormRow className={half} label="Liquor, deepest pool">{nums('under', num('2'), 'over', num('8'), 'cm')}</FormRow>
          <FormRow className={half} label="Fetal weight chart" hint="a reference list, imported read-only">{chips(['Hadlock 1991', 'WHO 2017'], 'Hadlock 1991')}</FormRow>
        </SetCard>
      </div>
      <SetCard title="Gynaecology">
        <FormRow label="Cervical screening" hint="the next smear, worked out from the last">{chips(['Pap every 3 years, 21–65', 'HPV every 5 years, 30–65', 'Pap and HPV every 5 years, 30–65'], 'Pap every 3 years, 21–65')}</FormRow>
        <FormRow label="Contraception · when due" hint="pills: when the packs given run out (the prescription's quantity)"><FormTable head={['Method', 'Every', 'Unit']} rows={methods.map(([m, n, u]) => [text(m), num(n), pick(u, ['weeks', 'months', 'years'])])} /></FormRow>
      </SetCard>
      <p className="text-12 text-faint">Drawn by the platform from each setting's shape (rule 7): small tables, numbers with units, choices; a change holds from its saving, the old value in History. For whom is worked out from the record, never ticked per woman: Rh negative from the blood group, previous caesarean from Before, the age from the birth date, the pre-eclampsia risk and diabetes from the problems. EPDS and MEOWS are score tables (Settings → Scores), not here.</p>
      <Ask n={21}>The starter rows: visits as most Egyptian clinics run them (every 4 weeks to 28, every 2 to 36, then weekly; drawn), or WHO 2016's eight contacts (12, 20, 26, 30, 34, 36, 38 and 40 weeks)? And the queue's one ObGyn word a row (the queue picture): a warning first, then what this schedule says is due, then the weeks (drawn); or always the weeks, the warning only in the chart.</Ask>
    </div>
  </Page>
}

export const OBGYN: Pic[] = [
  { id: 'anc-visit', title: 'ObGyn clinic · the antenatal visit', note: '/anc: BP and weight as the base\'s vitals, the rest the pack\'s check; the weeks worked out; what is due at these weeks offered as chips; the pregnancy\'s record as one section. Q17.', Page: AncVisit },
  { id: 'ob-scan', title: 'ObGyn clinic · the scan in the clinic', note: '/obus: the four measures, the fetal weight and its centile worked out and drawn on a chart, the liquor, placenta, presentation and heart; a small baby shown as a notice; written as a result with no order. Q18.', Page: ObScan },
  { id: 'ob-gyn', title: 'ObGyn clinic · a gynaecology visit', note: 'The Gynaecology section (periods, contraception, cervical screening) with what is due; /fp changes a copper IUD for a hormonal one, the change written as the base\'s procedure. Q19.', Page: GynVisit },
  { id: 'ob-postnatal', title: 'ObGyn clinic · the visit after the birth', note: '/pn at six weeks: BP, bleeding, the wound, breastfeeding, EPDS through the base\'s score, contraception; a birth elsewhere written here ends the pregnancy once; his record opens from hers. Q20.', Page: PostnatalVisit },
  { id: 'ob-queue', title: 'ObGyn clinic · the queue', note: 'The base\'s queue with the pack\'s one word a row: a BP in amber, what is due, else the weeks. Q21.', Page: ObQueue },
  { id: 'ob-settings', title: 'ObGyn · settings', note: 'Settings → Packs → ObGyn, drawn by the platform: the antenatal schedule (weeks, what, for whom), the visits, the fundus band, the notices, gynaecology\'s intervals. Q21.', Page: ObSettings },
]
