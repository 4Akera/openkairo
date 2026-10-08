// Paediatrics and the shared vaccines pack, drawn with the last group (2026-10-08, proposed by Claude, awaiting the owner). clinics.tsx holds the shared parts.
// Paediatrics: growth on the WHO charts from the base's weight, length and head, a dose by weight under the base's /rx, development and the newborn checks,
// its words on the children's ward board. Vaccines (shared): the doses in a child's chart (/vax, the base's given extended), the vaccination room's own list,
// the schedule as a setting, the child's card. Values are worked out from the WHO 2006 tables (boys, LMS) and the MOHP schedule as published in Dec 2024.
import type { ReactNode } from 'react'
import { Plus, Printer, TriangleAlert } from 'lucide-react'
import { Badge, Button, Card, Chip, FormRow, Input, Kbd, ListRow, ListSection, ScreenFrame, Segmented, Select, Tag, cn, type ScreenView } from '@core/ui'
import { App } from './kit'
import { WalkInSteps } from './bench'
import { Ask, Board, Chips, Keys, Label, Line, Rec, Row, Table, Under, Unsigned, V, Visit, Word, noop, type Bed, type Pic } from './clinics'

const PC = 'Paediatrics clinic'
const REHAB = 'Dr. Rehab Shaker'
const nka = <span className="text-12 text-faint">No known allergies</span>
const f7 = 'h-7 text-13'
const Faint = ({ children }: { children: ReactNode }) => <p className="text-12 text-faint">{children}</p>

/** a pack's one line under a base card (the core change asked in Q23 a): the pack's name, its words, a second line if it needs one; shown, never a stop */
const PackSays = ({ pack, children, more }: { pack: string; children: ReactNode; more?: ReactNode }) =>
  <div className="grid gap-0.5 border-t border-dashed border-accent-line bg-accent-soft/40 px-3 py-2 text-13">
    <p><span className="me-2 text-11 font-semibold uppercase tracking-[0.06em] text-accent">{pack}</span>{children}</p>{more && <div className="text-12 text-muted">{more}</div>}</div>
/** a base card under the line, as the composer draws it: its kind, its line, its fields; a pack's line may follow */
const BaseCard = ({ kind, tone, line, children, after }: { kind: string; tone: 'info' | 'accent'; line: string; children: ReactNode; after?: ReactNode }) =>
  <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-line"><div className="grid gap-1.5 px-3 py-2.5">
    <p className="mb-0.5 flex items-start gap-2 text-13"><Badge tone={tone} className="mt-0.5 w-20 justify-center">{kind}</Badge><span className="font-medium text-fg">{line}</span></p>{children}</div>{after}</div>
/** a notice in the card (drawn without the kit's pop-in, so the picture shows it): words, then chips to take or leave */
const Notice = ({ title, children, chips }: { title: string; children: ReactNode; chips: ReactNode }) =>
  <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3 py-2 text-14 text-warn ring-1 ring-inset ring-warn-line"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
    <div className="grid gap-1"><p className="font-medium">{title}</p><p className="text-13 text-fg">{children}</p><div className="flex flex-wrap gap-1.5 pt-1">{chips}</div></div></div>

// ── 1 · growth ──
// WHO 2006 weight-for-age, boys, birth to 12 months: L, M, S by month (the reference list the server reads; here only to draw the lines)
const WFA_BOYS: [number, number, number][] = [[0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.197, 5.5675, 0.12385], [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316],
  [0.1395, 7.5105, 0.1108], [0.1257, 7.934, 0.10958], [0.1134, 8.297, 0.10902], [0.1021, 8.6151, 0.10882], [0.0917, 8.9014, 0.10881], [0.082, 9.1649, 0.10891], [0.073, 9.4122, 0.10906], [0.0644, 9.6479, 0.10925]]
const kgAt = ([L, M, S]: [number, number, number], z: number) => M * (1 + L * S * z) ** (1 / L)
const CENTILES: [string, number][] = [['97th', 1.881], ['85th', 1.036], ['50th', 0], ['15th', -1.036], ['3rd', -1.881]]
const MALEK: [number, number][] = [[0, 3.3], [2, 5.4], [4, 6.5], [6, 7.0], [9, 7.3], [11, 7.5]]   // birth … today (11 mo), kg

function WeightForAge() {
  const W = 440, H = 250, L = 28, R = 38, T = 8, B = 26
  const x = (m: number) => L + m * ((W - L - R) / 12), y = (kg: number) => T + (12 - kg) * ((H - T - B) / 10)
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight-for-age, boys, birth to 1 year: Malek from the 46th centile at birth to the 2nd at 11 months, below the 3rd centile line">
    {[2, 4, 6, 8, 10, 12].map((kg) => <g key={kg}><line x1={L} x2={W - R} y1={y(kg)} y2={y(kg)} className="stroke-line" /><text x={L - 6} y={y(kg) + 4} textAnchor="end" className="fill-faint text-11">{kg}</text></g>)}
    {[0, 2, 4, 6, 8, 10, 12].map((m) => <g key={m}><line x1={x(m)} x2={x(m)} y1={T} y2={H - B} className="stroke-line" />
      <text x={x(m)} y={H - 10} textAnchor="middle" className="fill-faint text-11">{m === 0 ? 'birth' : `${m} mo`}</text></g>)}
    {CENTILES.map(([c, z]) => <g key={c}><polyline points={WFA_BOYS.map((lms, m) => `${x(m)},${y(kgAt(lms, z))}`).join(' ')} strokeWidth={z === 0 ? 1.75 : 1.25}
      className={cn('fill-none', z === 0 ? 'stroke-ok' : Math.abs(z) > 1.5 ? 'stroke-warn' : 'stroke-line-strong')} /><text x={W - R + 4} y={y(kgAt(WFA_BOYS[12], z)) + 4} className="fill-muted text-11">{c}</text></g>)}
    <polyline points={MALEK.map(([m, kg]) => `${x(m)},${y(kg)}`).join(' ')} className="fill-none stroke-accent" strokeWidth={2} />
    {MALEK.map(([m, kg], i) => <circle key={m} cx={x(m)} cy={y(kg)} r={i === 5 ? 4.5 : 3.5} className={cn('stroke-surface', i === 5 ? 'fill-warn' : 'fill-accent')} strokeWidth={1.5} />)}
    <text x={L + 4} y={T + 12} className="fill-faint text-11">kg</text>
  </svg>
}

export function PaedsGrowth() {
  const record = <>
    <Chips on="Growth" lead={[['Summary'], ['Growth', 'z −2.1', 'warn'], ['Vaccines', '9 mo']]} base={[['Problems']]} more={5} /><Rec title="Summary" folded="breastfed, porridge twice a day · diarrhoea twice since 6 mo · vaccines to 9 mo" />
    <Rec title="Growth" tone="attention" right={<span className="text-12 text-faint">WHO 2006 · boys</span>}>
      <Table first="9rem" head={['', 'Today', 'z', 'Centile']} rows={[['Weight-for-age', '7.5 kg', <V key="w" f="low">−2.1</V>, '2nd'], ['Length-for-age', '72.4 cm', '−0.9', '18th'],
        ['Head-for-age', '45.4 cm', '−0.3', '39th'], ['Weight-for-length', '7.5 kg at 72.4 cm', <V key="wl" f="low">−2.2</V>, '1st']]} />
      <div className="flex flex-wrap items-center gap-2 pt-3"><Segmented size="sm" aria-label="Chart" value="wfa" onChange={noop} options={[['wfa', 'Weight'], ['lfa', 'Length'], ['hc', 'Head'], ['wfl', 'Weight-for-length']]} />
        <span className="ms-auto text-11 text-faint">birth to 1 y · 0–2 y · 0–5 y</span></div>
      <WeightForAge />
      <p className="text-12 font-medium text-warn">Crossed two centile lines down since 4 months (26th → 2nd).</p>
      <Label className="pt-2">Measured</Label>
      <Table head={['Age', 'kg', 'cm', 'Head', 'Weight z']} rows={[['birth', '3.3', '50.0', '34.5', '−0.1'], ['2 mo', '5.4', '57.5', '39.0', '−0.2'], ['4 mo', '6.5', '62.6', '41.4', '−0.7'],
        ['6 mo', '7.0', '66.0', '43.0', '−1.1'], ['9 mo', '7.3', '70.0', '44.6', <V key="9" f="low">−1.8</V>], ['11 mo · today', '7.5', '72.4', '45.4', <V key="11" f="low">−2.1</V>]]} />
    </Rec>
    <Rec title="Problems" folded="none" />
  </>
  return <Visit dept={PC} user={REHAB} who={['Malek Shoukry', '11 mo · M · #20417']} where="In consult · 6 min" safety={nka}
    words={<><Word>11 mo · 7.5 kg</Word><Word tone="warn">weight z −2.1</Word></>} plus={1} record={record}>
    <Line>/v wt 7.5 len 72.4 hc 45.4</Line>
    <Under>
      <BaseCard kind="vitals" tone="info" line="Wt 7.5 kg · length 72.4 cm (lying) · head 45.4 cm"
        after={<PackSays pack="Paediatrics" more={<><span>WHO 2006, boys, 11 months · the server&apos;s, from the loaded tables</span>
          <p className="pt-1 text-13 font-medium text-warn">Weight-for-length below −2: moderate wasting (WHO). The weight has crossed two centile lines since 4 months.</p></>}>
          weight <V f="low">z −2.07</V> (2nd) · length z −0.92 (18th) · head z −0.28 (39th) · <span className="whitespace-nowrap">for length <V f="low">z −2.22</V> (1st)</span></PackSays>}>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">{([['Wt', 'kg', '7.5'], ['Length', 'cm', '72.4'], ['Head', 'cm', '45.4'], ['Temp', '°C', ''], ['Pulse', 'bpm', ''], ['RR', '/min', ''], ['SpO₂', '%', '']] as const).map(([l, u, v]) =>
          <label key={l} className="text-11 text-muted">{l} <span className="text-faint">{u}</span><Input readOnly value={v} className={cn(f7, 'mt-0.5 text-end')} /></label>)}</div>
      </BaseCard>
      <div className="flex flex-wrap items-center gap-1.5 px-1"><span className="text-12 text-faint">Take or leave:</span>
        <Chip onClick={noop} on>Problem · moderate wasting (E44.0)</Chip><Chip onClick={noop}>Lab · CBC, urine, stool</Chip><Chip onClick={noop}>Feeding history · note</Chip></div>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the set · the z-scores come back as you type <Input readOnly value="next weight 2 wk" className="ms-auto h-7 w-36 text-12" /></Keys>
    </Under>
    <Unsigned n={3}><p className="text-fg">Vitals · Wt 7.5 kg · length 72.4 cm (lying) · head 45.4 cm</p><p className="text-fg">Problem · Moderate wasting (E44.0)</p>
      <p className="text-fg">Next visit · 2 weeks · Thu 22 Oct · Paediatrics clinic <span className="text-12 text-faint">the booking</span></p>
    </Unsigned>
    <Faint>Weight, length and head are the base&apos;s vitals (length is the height key, method lying). The z-scores and centiles are worked out by the server from the loaded WHO
      tables for the age on the day and the sex, kept with the table&apos;s version, never typed. The Growth section fits under 19 (§5.1 rule 2); after 2 years it charts height and BMI-for-age.</Faint>
    <Faint>The line under the /v card is the paediatrics pack&apos;s: the same core change as the dose line on the next picture (Q23 a).</Faint>
    <Ask n={22}>(a) The growth tables: WHO 2006 (birth to 5) and WHO 2007 (5 to 19), loaded as a reference list with their version (drawn)? Or the Egyptian growth charts (2002), or both
      with each clinic choosing one? (b) A base change: the base&apos;s /v reads <span className="font-mono">len</span> and <span className="font-mono">hc</span>, and its card shows Length and Head for a child.
      The keys exist (height, head); today /v reads only wt and ht. The other way: the pack&apos;s own /v for the paediatrics clinic, which family medicine would not get.</Ask>
  </Visit>
}

// ── 2 · a dose by weight, under the base's /rx ──
export function PaedsDose() {
  const record = <>
    <Chips lead={[['Summary'], ['Growth', '14.2 kg'], ['Vaccines', 'done']]} base={[['Problems', '1']]} more={4} /><Rec title="Summary" folded="T 38.6 · left ear red and bulging · amoxicillin 3 months ago" />
    <Rec title="Growth" folded="14.2 kg today z −0.1 · 96 cm z −0.2 · on her lines" /><Rec title="Vaccines" folded="national schedule done to 18 months" />
    <Rec title="Problems" count={1}><Row k="Today">Acute otitis media, left (H66.9)</Row></Rec><Rec title="Medicines" folded="none now · amoxicillin 7 days in July (otitis)" />
  </>
  return <Visit dept={PC} user={REHAB} who={['Jana Moataz', '3 y 2 mo · F · #20352']} where="In consult · 9 min" safety={nka}
    words={<><Word>3 y · 14.2 kg</Word><Word tone="ok">vaccines up to date</Word></>} record={record}>
    <Line>/rx amoxicillin 250/5 7.5ml tds 7d</Line>
    <Under>
      <BaseCard kind="prescription" tone="accent" line="Amoxicillin 250 mg/5 ml · 7.5 ml (375 mg) oral TDS · 7 days"
        after={<PackSays pack="Paediatrics" more={<><Tag tone="ok" className="me-1.5">in the clinic&apos;s range</Tag>usual 40–90 mg/kg a day in 2–3 doses · most 1 g a dose · for 14.2 kg
          that is <b className="font-medium text-fg">3.8–8.5 ml three times a day</b></>}>14.2 kg <span className="text-faint">today 10:05</span> · 375 mg × 3 = 1125 mg a day = <b className="font-semibold">79 mg/kg/day</b></PackSays>}>
        <FormRow inline label="Drug"><Input readOnly value="Amoxicillin 250 mg/5 ml oral suspension" className={cn(f7, 'w-72')} /><span className="text-11 text-faint">Penicillins · penicillin class</span></FormRow>
        <FormRow inline label="Strength">{['125 mg/5 ml', '250 mg/5 ml'].map((s, i) => <Chip key={s} on={i === 1} onClick={noop}>{s}</Chip>)}</FormRow>
        <FormRow inline label="Dose"><Input readOnly value="7.5" className={cn(f7, 'w-20 text-end')} /><Input readOnly value="ml" className={cn(f7, 'w-20')} /><Select value="oral" onChange={noop} className={cn(f7, 'w-28')}><option>oral</option></Select></FormRow>
        <FormRow inline label="How often">{['OD', 'BD', 'TDS', 'QDS', 'q6h', 'q8h', 'once', 'stat', 'PRN'].map((x) => <Chip key={x} on={x === 'TDS'} onClick={noop}>{x}</Chip>)}</FormRow>
        <FormRow inline label="For"><Input readOnly value="7" className={cn(f7, 'w-16 text-end')} />{[3, 5, 7, 14].map((d) => <Chip key={d} on={d === 7} onClick={noop}>{d}d</Chip>)}
          <Select value="aom" onChange={noop} className={cn(f7, 'ms-2 w-52')}><option value="aom">Acute otitis media, left</option></Select></FormRow>
        <FormRow inline label="Instructions"><Input readOnly dir="rtl" value="بعد الأكل · رجّ الزجاجة جيدًا قبل الاستعمال" className={cn(f7, 'max-w-md flex-1')} /></FormRow>
      </BaseCard>
      <Keys><Kbd>↵</Kbd> adds it as it stands; the line stays on the draft. Nothing waits for it.</Keys>
    </Under>
    <Unsigned n={3}><p className="text-fg">Problem · Acute otitis media, left (H66.9)</p><p className="text-fg">Amoxicillin 250 mg/5 ml · 7.5 ml (375 mg) oral TDS · 7 days · for acute otitis media <span className="text-12 text-ok">79 mg/kg/day</span></p>
      <p className="text-fg">Paracetamol 120 mg/5 ml · 5 ml (120 mg) oral every 6 h as needed for fever <span className="text-12 font-medium text-warn">8.5 mg/kg a dose · the clinic&apos;s usual 10–15 (5.9–8.9 ml)</span></p>
    </Unsigned>
    <Faint>The card is the base&apos;s /rx, unchanged; the line under it is the paediatrics pack&apos;s, worked out from the latest weight and the clinic&apos;s dose list. With no weight in the last
      30 days it says the last one and its date, and &ldquo;weigh her&rdquo;; it never guesses a weight from the age. The same words stay on the draft.</Faint>
    <Faint>Shown, never a stop: a dose outside the usual range is a word in amber; Done writes what the doctor chose. The medication is the base&apos;s; nothing new is stored.</Faint>
    <Ask n={23}>(a) <b className="font-semibold">A core change:</b> a pack may add one line under the base&apos;s /rx card and its draft, in the departments that tick it (drawn; nephrology&apos;s renal doses and
      the z-scores under /v use the same line)? Without it, the existing door: the pack&apos;s own whole /rx card for the paediatrics clinic&apos;s department type, which writes the same medication,
      but family medicine would not get it and nephrology would copy it. (b) The doses per kg: the clinic&apos;s own dose list, a setting (drug, route, mg/kg a day from–to, doses a day, most a
      dose), since the EDA list carries no children&apos;s doses (drawn)? Or wait for a licensed reference (BNF for Children, Lexicomp), later.</Ask>
  </Visit>
}

// ── 3 · development and the newborn checks ──
const MILESTONES: [string, [string, boolean][]][] = [['Movement', [['Sits without support', true], ['Gets to sitting by herself', true]]],
  ['Hands', [['Moves a toy from one hand to the other', true], ['Rakes food towards herself', true]]], ['Talking', [['Babbles “mamama”, “bababa”', false], ['Lifts her arms to be picked up', true]]],
  ['Social', [['Looks when you call her name', false], ['Reacts when you leave', true], ['Laughs at peek-a-boo', true]]]]
export function PaedsDevelop() {
  const ok = <span className="text-ok">✓</span>
  const record = <>
    <Chips lead={[['Summary'], ['Growth', '8.4 kg'], ['Development'], ['Newborn', 'refer', 'warn']]} base={[['Problems']]} more={4} /><Rec title="Summary" folded="first child · coos, smiles · breastfed and porridge · vaccines to 9 mo" />
    <Rec title="Development" right={<span className="text-12 text-faint">the clinic&apos;s list · CDC 2022</span>}>
      <Table head={['', '2 mo', '4 mo', '6 mo', '9 mo']} first="6rem" rows={MILESTONES.map(([a]) => [a, ok, ok, ok, <span key="t" className="text-12 text-accent">today</span>])} />
    </Rec>
    <Rec title="Newborn checks" tone="attention">
      <Row k="Birth">39 wk · 3.1 kg · normal birth at another hospital</Row><Row k="Heel prick">day 4 · thyroid (TSH) normal · the health unit&apos;s slip, 20 Dec</Row>
      <Row k="Hearing" tone="warn">day 2 · OAE refer, both ears · repeat not done</Row><Row k="Hips">Ortolani and Barlow negative · day 1 and 6 wk</Row>
      <Row k="Eyes">red reflex present, both · day 1 and 6 wk</Row><Row k="Jaundice">day 3 · bilirubin 11.6 mg/dL · no phototherapy</Row>
    </Rec>
  </>
  return <Visit dept={PC} user={REHAB} who={['Kenzy Hafez', '10 mo · F · #20502']} where="In consult · 11 min" safety={nka}
    words={<><Word>10 mo · 8.4 kg</Word><Word tone="warn">hearing: refer, not repeated</Word></>} record={record}>
    <Line>/dev</Line>
    <Under>
      <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Development · the 9-month list</b>
        <span className="text-muted">she is 10 months · each milestone is what 3 in 4 children do by this age</span></p>
      <div className="grid gap-x-6 gap-y-2 px-1 sm:grid-cols-2">{MILESTONES.map(([area, items]) => <div key={area} className="grid content-start gap-1"><Label>{area}</Label>
        {items.map(([t, yes]) => <p key={t} className="flex items-center gap-1.5 text-13"><span className={cn('min-w-0 flex-1', yes ? 'text-fg' : 'font-medium text-warn')}>{t}</span>
          <Chip onClick={noop} on={yes}>yes</Chip><Chip onClick={noop} on={!yes}>not yet</Chip></p>)}</div>)}</div>
      <Notice title="Not yet at 10 months: babbling, and looking when her name is called"
        chips={<><Chip on onClick={noop}>Order · hearing test (ABR)</Chip><Chip onClick={noop}>Refer · development clinic</Chip><Chip onClick={noop}>Look again at 12 months</Chip></>}>
        Most children do both by 9 months. The newborn hearing screen said refer in both ears on day 2 and was never repeated.</Notice>
      <Keys><Kbd>←→</Kbd> yes or not yet <Kbd>↵</Kbd> adds the check and the chips taken</Keys>
    </Under>
    <Unsigned n={3}><p className="text-fg">Development · the 9-month list at 10 mo · 7 yes · not yet: babbles, looks to her name</p><p className="text-fg">Order · Hearing test (ABR), both ears · ENT clinic <span className="text-12 text-muted">? newborn OAE refer both ears, not repeated · no babbling at 10 mo</span></p>
      <p className="text-fg">Next visit · 12 months · Tue 8 Dec · Paediatrics clinic <span className="text-12 text-faint">the booking</span></p>
    </Unsigned>
    <Faint>A check is one entry of the pack&apos;s development type, which extends the base&apos;s observation (the age, the list&apos;s version, each milestone yes or not yet). &ldquo;Not yet&rdquo; past
      the list&apos;s age is a notice with the referral as a chip, never a stop. The newborn section reads base entries only: results (the heel prick, the bilirubin), a procedure (the hearing
      test), observations (hips, eyes); the heel prick&apos;s result is typed from the health unit&apos;s slip.</Faint>
    <Ask n={24}>The milestones: a short list by age in four areas, the clinic&apos;s setting, started from the CDC&apos;s 2022 list, where each milestone is what 3 in 4 children do by that age, so
      &ldquo;not yet&rdquo; past it is worth acting on (drawn)? Or a scored screening tool (ASQ-3, a parents&apos; questionnaire, or the Denver II; both licensed)? And the newborn checks as the
      paediatrics pack&apos;s own section (drawn), or kept in obgyn&apos;s record of the baby from the labour ward?</Ask>
  </Visit>
}

// ── 4 · vaccines in a child's chart ──
const given = (t: string, where: string) => <span><span className="text-ok">✓</span> {t} <span className="text-12 text-faint">{where}</span></span>
const DOSES = [['MMR', 'dose 1 of 2', '4K21M07', '03/2027', 'under the skin', true], ['OPV', 'dose 5', 'B2219', '12/2026', 'by mouth · 2 drops', false]] as const
export function VaxChart() {
  const record = <>
    <Chips on="Vaccines" lead={[['Summary'], ['Growth', '9.0 kg'], ['Vaccines', '2 overdue', 'warn']]} base={[['Problems']]} more={4} /><Rec title="Summary" folded="otitis in Sep · 9.0 kg z −0.2 · walks holding on" />
    <Rec title="Vaccines" tone="attention" right={<span className="text-12 text-faint">MOHP schedule</span>}>
      <Table first="3.5rem" head={['Age', 'National', '']} rows={[['Birth', 'Hepatitis B 0 · OPV 0 · BCG', given('8 Sep 25', 'card')], ['2 mo', 'OPV 1 · Penta 1', given('9 Nov 25', 'card')],
        ['4 mo', 'OPV 2 · IPV · Penta 2', given('10 Jan 26', 'card')], ['6 mo', 'OPV 3 · Penta 3', <span key="6" className="grid"><span className="text-12 text-warn">✕ 9 Mar · fever 39 °C</span>{given('16 Mar 26', 'here')}</span>],
        ['9 mo', 'OPV 4 · Vitamin A', given('8 Jun 26', 'here')], ['12 mo', 'OPV 5 · MMR 1', <span key="12" className="grid"><span className="font-medium text-warn">overdue 4 wk</span><span className="text-12 text-warn">✕ 10 Sep · fever 39.2 °C</span></span>],
        ['18 mo', 'OPV · DTP · MMR 2 · Vit A', <span key="18" className="text-muted">due 8 Mar 27</span>]]} />
      <Label className="pt-3">Optional · the parents&apos; choice</Label>
      <Row k="Pneumococcal">{given('2, 4, 6 mo', 'here')} · <span className="text-accent">booster due now</span></Row><Row k="Rotavirus">{given('2, 4 mo', 'here · complete')}</Row>
      <Row k="Varicella, Hep A"><span className="text-muted">from 12 months · not given</span></Row><Row k="Influenza"><span className="text-muted">each autumn from 6 months · offer now</span></Row>
    </Rec>
    <Rec title="Problems" folded="none" />
  </>
  return <Visit dept={PC} user={REHAB} who={['Farida Bassem', '13 mo · F · #20488']} where="In consult · 5 min" safety={nka}
    words={<><Word>13 mo · 9.0 kg</Word><Word tone="warn">2 vaccines overdue</Word></>} record={record}>
    <Line>/vax mmr 1, opv 5</Line>
    <Under>
      <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Vaccines · 13 months</b><span className="text-muted">due: OPV 5, MMR 1 (4 weeks overdue) · optional: pneumococcal booster</span></p>
      <p className="px-1 text-12 text-muted">Temp 36.9 °C at 10:12 · allergies none known · no live vaccine in the last 4 weeks</p>
      {DOSES.map(([v, d, lot, exp, how, site]) => <div key={v} className="grid gap-1.5 rounded-lg bg-surface p-2.5 ring-1 ring-line">
        <p className="flex flex-wrap items-center gap-2 text-13"><Badge tone="accent" className="w-20 justify-center">vaccine</Badge><b className="font-medium text-fg">{v}</b><span className="text-muted">{d} · {how}</span>
          <span className="ms-auto flex items-center gap-1.5 text-12 text-faint">lot<Input readOnly value={lot} className={cn(f7, 'w-24 font-mono')} />expiry<Input readOnly value={exp} className={cn(f7, 'w-20')} /></span></p>
        {site && <FormRow inline label="Site">{['Right arm', 'Left arm', 'Right thigh', 'Left thigh'].map((s, i) => <Chip key={s} on={i === 0} onClick={noop}>{s}</Chip>)}</FormRow>}
        <FormRow inline label="Given by"><Chip on onClick={noop}>{REHAB}</Chip><Chip onClick={noop}>another…</Chip></FormRow></div>)}
      <div className="flex flex-wrap items-center gap-1.5 px-1"><span className="text-12 text-faint">Optional, not chosen:</span>
        {['Pneumococcal booster', 'Varicella', 'Hepatitis A', 'Influenza'].map((o) => <Chip key={o} variant="check" onClick={noop}>{o}</Chip>)}</div>
      <div className="rounded-lg border border-line bg-surface px-2.5 py-2 text-13"><Label>Next, worked out</Label><span className="text-fg">18 months · Mon 8 Mar 27 · OPV booster, DTP booster, MMR 2,
        Vitamin A 200 000 IU</span><span className="text-12 text-faint"> · MMR 2 not before 5 Nov (4 weeks after dose 1)</span></div>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the doses <Input readOnly value="next 18 mo" className="ms-auto h-7 w-28 text-12" /></Keys>
    </Under>
    <Unsigned n={3}><p className="text-fg">Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/27 · right arm, under the skin · {REHAB}</p><p className="text-fg">Vaccine · OPV dose 5 · lot B2219 · exp 12/26 · 2 drops by mouth · {REHAB}</p>
      <p className="text-fg">Next visit · 18 months · Mon 8 Mar 27 · Vaccination room <span className="text-12 text-faint">the booking</span></p>
    </Unsigned>
    <Faint>Each dose is the base&apos;s given, extended by the vaccines pack&apos;s dose (the vaccine&apos;s CVX code, which dose of which series, lot, expiry, site, who gave it, given here or
      copied from the card, or not given with its reason): FHIR Immunization. Due and overdue are worked out from the birth date, the doses and the schedule, never typed.</Faint>
    <Faint>The national rows follow the MOHP schedule as published in Dec 2024 (birth to 18 months); the clinic loads the schedule as a setting and checks it against the ministry&apos;s
      current one (a second IPV dose, for one, where the ministry adds it).</Faint>
    <Ask n={25}>Vaccines as their own shared pack, ticked by paediatrics, family medicine, the vaccination room, ObGyn (tetanus in pregnancy) and the adult clinics (drawn)? Or inside the
      paediatrics pack, so only children&apos;s departments have it and ObGyn and the adult clinics each need their own.</Ask>
  </Visit>
}

// ── 5 · the vaccination room ──
const roomViews: ScreenView<string>[] = [{ id: 'today', label: 'Due today', count: 9 }, { id: 'week', label: 'This week', count: 31 },
  { id: 'late', label: 'Overdue · to call', count: 7, needs: 'warn' }, { id: 'given', label: 'Given today', count: 12 }]
const SCHEDULE: [string, string, string, string, string, boolean][] = [
  ['Birth', 'Hepatitis B 0 · OPV 0 · BCG', 'IM right thigh · 2 drops by mouth · ID left upper arm', 'birth (HepB in 24 h)', '—', true], ['2 mo', 'OPV 1 · Penta 1', 'by mouth · IM right thigh', '6 wk', '—', true],
  ['4 mo', 'OPV 2 · Penta 2 · IPV', 'IPV IM left thigh', '10 wk (IPV 14 wk)', '4 wk', true], ['6 mo', 'OPV 3 · Penta 3', '', '14 wk', '4 wk', true],
  ['9 mo', 'OPV 4 · Vitamin A 100 000 IU', 'by mouth', '9 mo', '4 wk', true], ['12 mo', 'OPV 5 · MMR 1', 'MMR under the skin, right arm', '12 mo', '4 wk', true],
  ['18 mo', 'OPV · DTP booster · MMR 2 · Vitamin A 200 000 IU', 'DTP IM left thigh', '18 mo', 'MMR 4 wk · DTP 6 mo', true],
  ['2, 4, 6 · 12–15 mo', 'Pneumococcal (PCV13) 1–3, booster', 'IM', '6 wk', '4 wk · booster 8 wk', false], ['2, 4 mo', 'Rotavirus (Rotarix) 1–2', 'by mouth', '6 wk · dose 1 by 15 wk', '4 wk · done by 8 mo', false]]
const CARD = [['الولادة', 'الكبدي ب، شلل الأطفال صفرية، الدرن', '٨/٦ *'], ['شهران', 'شلل الأطفال ١، الخماسي ١', '٩/٨ *'], ['٤ شهور', 'شلل الأطفال ٢، السولك، الخماسي ٢', '٨/١٠']]
export function VaxRoom() {
  const due = <div className="grid gap-2">
    <Label>Due today · 4 months · national</Label><div className="flex flex-wrap gap-1.5">{['OPV 2', 'IPV', 'Penta 2'].map((v) => <Chip key={v} on variant="check" onClick={noop}>{v}</Chip>)}</div>
    <Label>Optional · the parents&apos; choice</Label><div className="flex flex-wrap items-center gap-1.5"><Chip variant="check" onClick={noop}>Pneumococcal 1</Chip><Chip variant="check" onClick={noop} disabled>Rotavirus 1</Chip>
      <span className="text-12 text-faint">rotavirus: past the age for dose 1 (15 weeks)</span></div>
    <Label>Earlier doses · from the MOHP card</Label><div className="flex flex-wrap items-center gap-1.5">{['Birth · HepB 0, OPV 0, BCG · 8 Jun', '2 mo · OPV 1, Penta 1 · 9 Aug'].map((v) => <Chip key={v} on variant="check" onClick={noop}>{v}</Chip>)}
      <span className="text-12 text-faint">ticked as the card shows them, with its dates</span></div>
    <p className="text-12 text-muted">Ask first: fever today, a reaction last time.</p>
  </div>
  return <App dept="Vaccination room" user="Rokaya Ghoneim" tabs={['Vaccines']}>
    <ScreenFrame views={roomViews} view="today" onView={noop} search={<Input placeholder="Record number, name or phone" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>}>
      <WalkInSteps query="0109 772" people={[['20533', 'Seif Yehia', '4 mo M', '0109 772 4410', 'never here'], ['20190', 'Seif Yehia Ashour', '6 y M', '0109 772 8812', 'last here 3 Mar']]}
        picked={['Seif Yehia', '4 mo M']} start="Start · 3 vaccines" what={due} />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card><ul>
          <ListSection title="Here" count={3}>
            <ListRow number="20461" name="Talia Nassef" age="2 mo F" status="OPV 1 · Penta 1 · Pneumococcal 1" who="booked 10:30" minutes={12} next /><ListRow number="20398" name="Layan Hegab" age="18 mo F" status="OPV · DTP · MMR 2 · Vitamin A" who="booked 10:45" minutes={6} marks={[{ key: 'l', word: 'overdue 3 wk', tone: 'warn' }]} />
            <ListRow number="20533" name="Seif Yehia" age="4 mo M" status={<><Tag tone="info">walk-in</Tag><span className="truncate">OPV 2 · IPV · Penta 2</span></>} who="with the card" minutes={3} />
          </ListSection>
          <ListSection title="Not here yet" count={6}>
            <ListRow number="20302" name="Habiba Ashour" age="6 mo F" status="OPV 3 · Penta 3" who="booked 12:00" minutes={null} muted /><ListRow number="20277" name="Eyad Darwish" age="9 mo M" status="OPV 4 · Vitamin A" who="booked 12:30" minutes={null} muted />
            <ListRow number="20419" name="Taym Hassouna" age="12 mo M" status="OPV 5 · MMR 1" who="booked 13:00" minutes={null} muted marks={[{ key: 'o', word: 'pneumococcal booster' }]} />
          </ListSection>
          <ListSection title="Overdue · to call" count={7} folded onToggle={noop} />
        </ul></Card>
        <Card className="grid gap-2 p-3">
          <div className="flex items-center gap-2"><Label>The child&apos;s card · printout</Label><Button size="sm" variant="outline" className="ms-auto"><Printer />Print</Button></div>
          <div dir="rtl" lang="ar" className="grid gap-1.5 rounded-md bg-paper p-3 text-13 text-fg ring-1 ring-line">
            <p className="text-center text-14 font-semibold">كارت التطعيمات</p><p className="text-center text-12 text-muted">Demo Clinic · غرفة التطعيمات</p><p>الاسم: <b className="font-semibold">سيف يحيى</b> · الميلاد ٨ يونيو ٢٠٢٦ · ملف ٢٠٥٣٣</p>
            <table className="w-full text-12"><tbody>{CARD.map(([a, v, d]) => <tr key={a} className="border-t border-line align-top"><td className="py-1 pe-1 font-medium">{a}</td><td className="py-1">{v}</td><td className="py-1 ps-1 tnum">{d}</td></tr>)}</tbody></table>
            <p className="border-t border-line pt-1.5 font-medium">الموعد القادم: ٦ شهور · الثلاثاء ٨ ديسمبر</p><p className="text-12 text-muted">شلل الأطفال ٣ · الخماسي ٣</p><p className="text-11 text-faint">* من كارت وزارة الصحة</p>
          </div>
          <Faint>A6, through the browser&apos;s print dialog, after Done; the MOHP card is still stamped by hand.</Faint>
        </Card>
      </div>
      <Card className="grid gap-2 p-3">
        <p className="flex flex-wrap items-center gap-2"><Label>The schedule · a setting</Label><span className="text-12 text-muted">Settings → Packs → Vaccines</span><Tag>national rows: MOHP, Dec 2024 · loaded, read-only</Tag>
          <span className="ms-auto text-12 text-faint">+ 4 optional rows (varicella, hepatitis A, influenza, meningococcal)</span></p>
        <Table head={['Age', 'Vaccines', 'How', 'Earliest', 'After the last', '']} rows={SCHEDULE.map(([a, v, h, e, i, n]) =>
          [a, v, <span key="h" className="text-muted">{h}</span>, e, i, n ? <Tag key="t" tone="info">national</Tag> : <Tag key="t">optional</Tag>])} />
      </Card>
      <Faint>The room&apos;s list is the vaccines pack&apos;s own screen, a list of work that is not places (rule 4): it calls, starts and finishes itself. A walk-in is the bench&apos;s two steps:
        who, then what is due today as chips, with the doses on the mother&apos;s card copied first. Overdue · to call shows the phone number; a call is a note on the child&apos;s record.</Faint>
      <Faint>Due and overdue come from each child&apos;s birth date, doses and the schedule&apos;s earliest age and interval; a dose too early is a notice, never a stop.</Faint>
      <Ask n={26}>(a) The schedule: the MOHP&apos;s national rows loaded as a reference list with their date, read-only, replaced by an import when the ministry changes them, and the optional rows the
        clinic&apos;s own (drawn)? Or the whole schedule one plain setting the clinic types and edits. (b) The child&apos;s card as a new printout in Arabic (drawn; printing is approved for labels,
        receipts and prescriptions only)? Or no printout: the nurse writes in the MOHP card as today and the record keeps the rest.</Ask>
    </ScreenFrame>
  </App>
}

// ── 6 · the children's ward board ──
export function PaedsWard() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All beds', count: 6 }, { id: 'in', label: 'In', count: 5 }, { id: 'free', label: 'Free', count: 1 }]
  const KANDIL = 'Dr. Hassan Kandil', gb = ['Give', 'Obs']
  const beds: Bed[] = [
    { name: 'Bed 1', who: { name: 'Ziad Barakat', sexAge: 'M 2 y', day: 2, clinician: KANDIL, reason: 'pneumonia', urgent: false }, line: ['PEWS 1', 'obs 14:00', '12.4 kg (1 d)', 'maint. 47 mL/h'], buttons: gb },
    { name: 'Bed 2', who: { name: 'Rawan Mekky', sexAge: 'F 6 y', day: 1, clinician: REHAB, reason: 'gastroenteritis, dehydration', urgent: false }, line: [{ text: 'PEWS 3', tone: 'warn' }, 'obs hourly', '20.0 kg today', 'maint. 63 mL/h'], buttons: gb },
    { name: 'Bed 3', who: { name: 'Adam Abdelmoneim', sexAge: 'M 5 mo', day: 3, clinician: KANDIL, reason: 'bronchiolitis', urgent: true }, line: [{ text: 'PEWS 4, Dr. told', tone: 'danger' }, '6.8 kg (2 d)', 'maint. 28 mL/h'], buttons: gb },
    { name: 'Bed 4' },
    { name: 'Bed 5', who: { name: 'Retaj Zidan', sexAge: 'F 9 y', day: 1, clinician: REHAB, reason: 'β-thalassaemia, transfusion', urgent: false }, line: ['PEWS 0', 'blood: hour 2', '24.0 kg today', 'maint. 66 mL/h'], buttons: gb },
    { name: 'Bed 6', who: { name: 'Yehia Sallam', sexAge: 'M 4 y', day: 4, clinician: KANDIL, reason: 'UTI, febrile convulsion', urgent: false }, line: [{ text: '1 dose late', tone: 'danger' }, { text: '16.0 kg, 4 d ago', tone: 'warn' }, 'maint. 54 mL/h'], buttons: gb },
  ]
  return <App dept="Children's ward" user="Doha Wagdy" tabs={['Beds', 'Drug round', 'Handover']} tab="Beds">
    <ScreenFrame views={views} view="all" onView={noop}>
      <Board beds={beds} />
      <Card className="grid gap-1 p-3 text-13"><Label>Maintenance by Holliday–Segar, from the latest weight</Label>
        <p className="text-fg tnum">100 mL/kg a day for the first 10 kg, 50 for the next 10, 20 for each kg above · 12.4 kg → 1120 mL a day (47 mL/h) · 20.0 → 1500 (63) · 6.8 → 680 (28)
          · 24.0 → 1580 (66) · 16.0 → 1300 (54)</p>
        <Faint>Shown, never an order: the doctor writes the fluid (two-thirds in bronchiolitis or pneumonia, say) as a prescription.</Faint></Card>
      <Faint>The tiles are the base&apos;s. The department ticks ward nursing, then paediatrics; each speaks in turn on the one line: ward nursing&apos;s score, obs and late doses, then
        paediatrics&apos; weight with its age and the day&apos;s maintenance. A weight older than 3 days says so in amber (doses by weight hang on it). Paediatrics brings no tile button, so Give
        and Obs are ward nursing&apos;s; on the drug round each dose shows its mg/kg from the same weight.</Faint>
      <Faint>No adult values on a child: NEWS2 is not drawn here, and a child&apos;s heart and breathing rates are flagged by the bands for the age.</Faint>
      <Ask n={27}>On the children&apos;s ward, ward nursing&apos;s obs score is a children&apos;s early warning score in NEWS2&apos;s place (as obgyn&apos;s MEOWS on the labour ward), a declared table the
        server adds up. The Brighton PEWS (drawn: behaviour, heart and circulation, breathing, 0–3 each, plus 2 for nebulisers every 15 minutes or vomiting after an operation)? Or the NHS
        national PEWS (2023: charts by age band, more rows, more to fill)?</Ask>
    </ScreenFrame>
  </App>
}

export const PAEDS: Pic[] = [
  { id: 'paeds-growth', title: 'Paediatrics · growth', note: 'The Growth section: each latest value with its z-score and centile, the WHO curve; /v with weight, length and head, the z-scores worked out by the server and shown under the card. Q22.', Page: PaedsGrowth },
  { id: 'paeds-dose', title: 'Paediatrics · a dose by weight under /rx', note: 'The base\'s /rx card with one line from the paediatrics pack: the weight, the mg/kg it comes to, the clinic\'s range and the ml for the syrup; shown, never a stop. Q23.', Page: PaedsDose },
  { id: 'paeds-develop', title: 'Paediatrics · development and the newborn checks', note: '/dev: milestones in four areas as yes / not yet; not yet past the age is a notice with the referral as a chip; the newborn checks as a section. Q24.', Page: PaedsDevelop },
  { id: 'vax-chart', title: 'Vaccines · in a child\'s chart', note: 'The Vaccines section by the national schedule (given, not given with a reason, overdue, due), the optional ones apart; /vax under the line with the next due worked out. Q25.', Page: VaxChart },
  { id: 'vax-room', title: 'Vaccines · the vaccination room', note: 'The room\'s own list (due today, this week, overdue to call, given today); a walk-in with the mother\'s card; the child\'s card in Arabic; the schedule as a setting. Q26.', Page: VaxRoom },
  { id: 'paeds-ward', title: 'Paediatrics · the children\'s ward board', note: 'The base\'s tiles: ward nursing\'s words, then paediatrics\' weight and maintenance fluid by Holliday–Segar; Give and Obs stay the ward\'s. Q27.', Page: PaedsWard },
]
