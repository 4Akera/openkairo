// Family medicine, and the map of the last group (2026-10-08, proposed by Claude, awaiting the owner). Family medicine sees everyone:
// pregnant women, babies, the old man with diabetes. It does not copy the specialties' packs; it ticks them (ObGyn's antenatal care,
// paediatrics' growth, vaccines, chronic care) and adds only its own small pack: the family file (a household and what each member
// is due) and the checks due by age and sex. clinics.tsx holds the shared parts.
import { Button, Card, Chip, Input, Kbd, ListRow, ListSection, ScreenFrame, Switch, Tag, Fieldset, FormRow, cn, type ScreenView } from '@core/ui'
import { App } from './kit'
import { Ask, Chips, Keys, Label, Line, Page, Rec, Row, Table, Under, Unsigned, Visit, Word, noop, type Pic } from './clinics'

const FM = 'Family medicine'
const HAZEM = 'Dr. Hazem Ouda'

// ── 0 · who ticks what ──
type P = 'ObGyn' | 'Paediatrics' | 'Vaccines' | 'Chronic care' | 'Cardiology' | 'Nephrology' | 'Respiratory' | 'Haematology' | 'Oncology'
  | 'Surgery' | 'Theatre' | 'Anaesthesia' | 'Family' | 'Ward nursing' | 'Laboratory'
const SHARED: P[] = ['Vaccines', 'Chronic care', 'Ward nursing']
function ClinicsMap() {
  const rows: [string, string, P[], string?][] = [
    ['ObGyn clinic', 'queue', ['ObGyn', 'Vaccines'], 'tetanus in pregnancy'],
    ['Paediatrics clinic', 'queue', ['Paediatrics', 'Vaccines']],
    ['Children\'s ward', 'beds', ['Ward nursing', 'Paediatrics'], 'doses by weight on the drug round'],
    ['Vaccination room', 'its own list', ['Vaccines']],
    ['Internal medicine · Diabetes clinic', 'queue', ['Chronic care']],
    ['Cardiology clinic', 'queue', ['Chronic care', 'Cardiology']],
    ['Echo room', 'bench', ['Cardiology'], 'answers /echo'],
    ['Nephrology clinic', 'queue', ['Chronic care', 'Nephrology'], 'dialysis is its own unit (§5.6)'],
    ['Chest clinic', 'queue', ['Chronic care', 'Respiratory']],
    ['Haematology clinic', 'queue', ['Haematology']],
    ['Blood bank', 'bench', ['Laboratory'], 'or haematology: a question on its picture'],
    ['Oncology clinic', 'queue', ['Oncology']],
    ['Chemotherapy day unit', 'chairs', ['Oncology', 'Ward nursing']],
    ['Surgery clinic', 'queue', ['Surgery']],
    ['Pre-op clinic', 'queue', ['Anaesthesia']],
    ['Theatre', 'its own list', ['Theatre', 'Anaesthesia', 'Surgery']],
    ['Recovery', 'bays', ['Anaesthesia', 'Ward nursing']],
    ['Surgical ward', 'beds', ['Ward nursing', 'Surgery', 'Anaesthesia'], 'the day after the operation, the drains; the pre-op on the ward'],
    ['Family medicine', 'queue', ['Family', 'Chronic care', 'Vaccines', 'Paediatrics', 'ObGyn']],
  ]
  const brings: [string, string][] = [
    ['ObGyn', 'Its labour ward part is drawn (§5.6). The clinic part: the antenatal visit and the pregnancy\'s record, the scan in the clinic, gynaecology (periods, contraception, cervical screening), the visit after the birth.'],
    ['Paediatrics', 'Growth on the WHO charts from the base\'s weight, length and head · doses by weight beside /rx · development · the newborn checks.'],
    ['Vaccines', 'Shared. The schedule (Egypt\'s national one and the optional vaccines, a setting) · /vax (the base\'s given) · due and overdue · the vaccination room\'s list · the child\'s card.'],
    ['Chronic care', 'Shared. Registers worked out from the problem list (diabetes, hypertension, CKD, asthma, COPD, heart failure) · each one\'s targets and checks due · its section · /review.'],
    ['Cardiology · Nephrology · Respiratory', 'Small, on top of chronic care: ECG and echo, heart failure · CKD stages, renal doses · spirometry, asthma and COPD control.'],
    ['Haematology', 'Transfusion (the request and the bedside record) · the INR clinic · thalassaemia day care.'],
    ['Oncology', 'The cancer\'s record (diagnosis, stage, plan, regimen) · /chemo (BSA, doses, the checks shown) · the day unit\'s chairs on the base\'s board.'],
    ['Surgery · Theatre · Anaesthesia', 'The decision to operate (/op) and the operation note · the theatre list and the WHO checklist · the pre-op assessment, the anaesthetic record, recovery.'],
    ['Family', 'Family medicine\'s own: the family file (a household, what each member is due) · the checks due by age and sex.'],
  ]
  return <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6">
    <p className="text-14 text-muted">The last group, drawn as the beds were: <b className="font-medium text-fg">shared packs</b> for what many departments do (vaccines, chronic care,
      and ward nursing from §5.6), <b className="font-medium text-fg">small packs</b> for what is a specialty's own. A department ticks the packs it uses (§5.1 rule 1), in its order:
      the first speaks first on the banner, the tile and the row.</p>
    <Card className="overflow-x-auto"><table className="w-full text-13">
      <thead><tr className="border-b border-line">{['Department', 'Works on', 'Ticks, in its order', ''].map((h) => <th key={h} className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{h}</th>)}</tr></thead>
      <tbody>{rows.map(([d, w, ps, n]) => <tr key={d} className="border-t border-line">
        <td className="px-3 py-1.5 font-medium text-fg">{d}</td><td className="px-3 py-1.5 text-muted">{w}</td>
        <td className="px-3 py-1.5"><span className="flex flex-wrap gap-1">{ps.map((p) => <Tag key={p} tone={SHARED.includes(p) ? 'info' : p === 'Laboratory' ? 'neutral' : 'accent'}>{p}</Tag>)}</span></td>
        <td className="px-3 py-1.5 text-12 text-faint">{n}</td></tr>)}</tbody>
    </table></Card>
    <p className="text-12 text-faint"><Tag tone="info">shared</Tag> ticked by many departments · <Tag tone="accent">a specialty's own</Tag> · <Tag>built</Tag> the laboratory pack (§5.3).
      Booking a time is the bookings pack's everywhere, paying is billing's row button, the pharmacy's dispensing and the laboratory's tests answer every one of them.</p>
    <div className="grid gap-2 md:grid-cols-2">{brings.map(([p, w]) => <Card key={p} className="grid content-start gap-1 p-3"><span className="text-14 font-semibold text-fg">{p}</span><span className="text-13 text-muted">{w}</span></Card>)}</div>
    <Card className="grid gap-1 p-3"><span className="text-14 font-semibold text-fg">What stays the base's</span>
      <span className="text-13 text-muted">The chart (banner, record, composer, Done), the queue and the bench, the board and its tiles, /v /rx /dx /order /score, the base's vitals, results,
        procedures, the given, the pregnancy and breastfeeding facts. Every pack writes these wherever the base has the idea; its own types only for what the base lacks.</span></Card>
    <Ask n={15}>Shared packs for vaccines and chronic care, ticked by every department that needs them, and small specialty packs on top (drawn)? The other way is each specialty's
      pack carrying its own vaccines and its own diabetes follow-up: copies that drift apart.</Ask>
    <Ask n={16}>Family medicine as a department that ticks five packs (its own small one, chronic care, vaccines, paediatrics, ObGyn; drawn), or one large family medicine pack
      that holds a simpler copy of each?</Ask>
  </div>
}

// ── 1 · the family file, in a visit ──
const members: [string, string, string, string, 'warn' | 'danger' | 'ok' | undefined, boolean?][] = [
  ['Basma Hegazy', '34 F', 'here now', 'cervical screening · sugar check due', 'warn', true],
  ['Ayman Abdelrahman', '39 M', 'husband', 'BP 148/94 in March · recheck due', 'warn'],
  ['Zeinab Hamouda', '68 F', 'his mother', 'diabetes: HbA1c 5 months late · flu vaccine due', 'danger'],
  ['Yassin Ayman', '6 y M', 'son', 'vaccines up to date · growth normal', 'ok'],
  ['Malak Ayman', '14 mo F', 'daughter', 'MMR 2 at 18 mo (in 4 months) · weight z −0.4', undefined],
]
function FamilyFolder() {
  const record = <>
    <Chips on="Family" lead={[['Summary'], ['Family', '5'], ['Checks', '2 due', 'warn']]} base={[['Problems']]} more={7} />
    <Rec title="Family" count={5} right={<span className="text-12 text-faint">file 1182</span>}>
      <p className="pb-1.5 text-12 text-faint">Al-Gomhoria St, Mit Ghamr · 010 2214 7781 (Ayman)</p>
      <ul className="grid">{members.map(([n, a, rel, due, tone, me]) => <li key={n} className={cn('grid gap-0.5 border-t border-line py-1.5 first:border-t-0', me && 'rail ps-2')}>
        <p className="flex items-baseline gap-2 text-13"><span className={cn('font-medium', me ? 'text-fg' : 'text-accent')}>{n}</span><span className="text-12 text-muted tnum">{a}</span><span className="text-12 text-faint">{rel}</span></p>
        <p className={cn('text-12', tone === 'danger' ? 'font-medium text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-muted')}>{due}</p></li>)}</ul>
      <p className="pt-1 text-12 text-faint">A name opens that member's chart. What each is due comes from the packs this department ticks.</p>
    </Rec>
    <Rec title="Checks" count="2 due">
      <Row k="Blood pressure" tone="ok">124/80 today</Row>
      <Row k="Sugar" tone="warn">BMI 31 · fasting sugar 2022 · due</Row>
      <Row k="Cervical" tone="warn">25–65 · never done · due</Row>
      <Row k="Hepatitis C">antibody negative 2019 (once)</Row>
    </Rec>
    <Rec title="Gynaecology" folded="Copper IUD since May 2022 · change 2032" />
  </>
  return <Visit dept={FM} user={HAZEM} who={['Basma Hegazy', '34 y · F · #10601']} where="In consult · 6 min"
    safety={<span className="text-12 text-faint">No known allergies</span>} words={<><Word>file 1182</Word><Word tone="warn">2 checks due</Word></>} record={record}>
    <Line>/checks</Line>
    <Under>
      <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Due for Basma</b><span className="text-muted">34, woman, BMI 31 · the clinic's list of checks</span></p>
      <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5">
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="warn">due</Tag><span className="text-fg">Fasting blood sugar</span><span className="text-muted">BMI 25 or more, every 3 years · last 2022</span><Chip className="ms-auto" on onClick={noop}>Order</Chip></p>
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="warn">due</Tag><span className="text-fg">Cervical screening</span><span className="text-muted">women 25–65, every 3 years · never</span>
          <span className="ms-auto flex gap-1"><Chip on onClick={noop}>Order · ObGyn clinic</Chip><Chip onClick={noop}>Done here</Chip></span></p>
        <p className="flex flex-wrap items-center gap-2 text-13"><Tag tone="ok">met</Tag><span className="text-fg">Blood pressure</span><span className="text-muted">every year · 124/80 today</span></p>
      </div>
      <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5">
        <Label>Also due in her family</Label>
        <p className="flex flex-wrap items-center gap-2 text-13"><span className="w-36 font-medium text-fg">Zeinab Hamouda</span><span className="text-danger">HbA1c 5 months late</span><span className="text-muted">· flu vaccine</span><Chip className="ms-auto" onClick={noop}>Book</Chip></p>
        <p className="flex flex-wrap items-center gap-2 text-13"><span className="w-36 font-medium text-fg">Ayman Abdelrahman</span><span className="text-warn">BP recheck</span><Chip className="ms-auto" onClick={noop}>Book</Chip></p>
        <p className="text-12 text-faint">Book opens that member's booking card (the bookings pack); nothing is written in Basma's chart for them.</p>
      </div>
      <Keys><Kbd>tab</Kbd> the next check <Kbd>↵</Kbd> takes it <Kbd>esc</Kbd> leaves them all</Keys>
    </Under>
    <Unsigned n={2}>
      <p className="text-fg">Fasting blood sugar · Laboratory</p>
      <p className="text-fg">Cervical smear · ObGyn clinic <span className="text-12 text-faint">? never screened</span></p>
    </Unsigned>
    <p className="text-12 text-faint">The family file is the family pack's own table (the household, its address, who belongs to it), not record entries. The checks are worked out from
      age, sex, the problem list and the last result of each kind; a check is met by a base entry (a BP in vitals, a result with its code), never ticked by hand.</p>
    <Ask n={49}>A household as the family pack's own table, each member still their own patient (drawn, no core change)? Or a core link between patients (a family, "mother of"),
      which the labour ward's baby (beds Q10) would use too.</Ask>
  </Visit>
}

// ── 2 · the family medicine queue: one department, five packs ──
function FamilyDay() {
  const views: ScreenView<string>[] = [{ id: 'queue', label: 'Queue', count: 7 }, { id: 'review', label: 'To review', count: 2, needs: 'warn' }]
  const rows: [string, string, string, string, { key: string; word: string; tone?: 'warn' | 'danger' | 'info' }[], number, boolean?][] = [
    ['10604', 'Hanaa Selim', '27 F', 'antenatal', [{ key: 'o', word: '32 w · BP 142/92', tone: 'warn' }], 22, true],
    ['10605', 'Judy Mahmoud', '9 mo F', 'cough, fever', [{ key: 'v', word: '9-month vaccines due' }, { key: 'p', word: 'weight z −2.3', tone: 'warn' }], 18],
    ['10606', 'Abdelhamid Zaki', '61 M', 'diabetes follow-up', [{ key: 'c', word: 'HbA1c 9.4', tone: 'warn' }, { key: 'f', word: '1 check due' }], 15],
    ['10602', 'Zeinab Hamouda', '68 F', 'knee pain', [{ key: 'f', word: '1 check due' }, { key: 'c', word: 'HbA1c late', tone: 'danger' }, { key: 'v', word: 'flu due' }], 9],
    ['10607', 'Karima Shaaban', '45 F', 'back pain', [{ key: 'f', word: '2 checks due' }], 4],
    ['10603', 'Yassin Ayman', '6 y M', 'ear pain', [], 2],
  ]
  return <Page dept={FM} user={HAZEM} tabs={['Queue', 'Families', 'Vaccines']} tab="Queue">
    <ScreenFrame views={views} view="queue" onView={noop} search={<Input placeholder="Record number, name or file" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm">Call next<Kbd className="ms-1">↵</Kbd></Button>}>
      <Card className="overflow-hidden"><ul>
        <ListSection title="In consult" count={1} />
        <ListRow number="10601" name="Basma Hegazy" age="34 F" status="In consult · 6 min" marks={[{ key: 'f', word: '2 checks due', tone: 'warn' }]} who={HAZEM} />
        <ListSection title="Waiting" count={rows.length} />
        {rows.map(([n, name, age, why, marks, min, next]) => <ListRow key={n} number={n} name={name} age={age} next={next} status={why} marks={marks} who={next ? 'next' : undefined} minutes={min} />)}
      </ul></Card>
      <p className="text-12 text-faint">The department ticks family, chronic care, vaccines, paediatrics and ObGyn, in that order; each pack may put one word on a row (§5.1 rule 4), so a
        busy row carries three. <b className="font-medium text-muted">Families</b> is the family pack's own screen (find a file by its number, its members, who is due);
        <b className="font-medium text-muted"> Vaccines</b> is the vaccines pack's list, as the vaccination room's.</p>
      <Ask n={50}>A row can carry a word from each pack the department ticks (today's rule: one each, no limit). Keep it, or at most two a row then +n, as the banner?</Ask>
    </ScreenFrame>
  </Page>
}

// ── 3 · the family pack's settings: the checks due by age and sex ──
function FamilyChecks() {
  const checks: [string, string, string, string][] = [
    ['Blood pressure', 'everyone 18 and over', '1 year', 'a BP in the vitals'],
    ['Sugar', '35 and over; younger with BMI 25+', '3 years', 'HbA1c or fasting glucose'],
    ['Lipids', 'men 40+, women 50+', '5 years', 'an LDL result'],
    ['Cervical screening', 'women 25–65', '3 years', 'a cervical smear or HPV result'],
    ['Breast', 'women 40–74', '2 years', 'a mammogram'],
    ['Bowel', '45–75', '1 year', 'a stool blood test'],
    ['Hepatitis C', 'everyone 18 and over', 'once', 'an HCV antibody result'],
  ]
  return <App dept="Settings" user="Dr. Nabil Farouk · admin">
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4">
      <p className="text-18 font-semibold text-fg">Settings · Packs · Family</p>
      <Fieldset title="Checks due by age and sex">
        <Table head={['Check', 'Who', 'Every', 'Met by']} rows={checks.map(([c, w, e, m]) => [<span className="font-medium">{c}</span>, w, e, <span className="text-muted">{m}</span>])} />
        <button type="button" className="justify-self-start text-13 text-accent">+ Add a check</button>
        <p className="text-12 text-faint">The clinic's own list, drawn by the platform from its shape (a small table). Who is a sex, an age from and to, and optionally a problem or a
          value (BMI 25+); met by names the base entries that count (by code), so nothing is ticked by hand. The values here are examples, not advice; Egypt's lists can be loaded
          as they are published.</p>
      </Fieldset>
      <Fieldset title="Family files">
        <FormRow label="File numbers" hint="as the unit's paper files are numbered">by the unit · 1, 2, 3 …</FormRow>
        <FormRow label="New patient asks for a file" hint="the desk's New patient joins a family file or starts one: a step in the base's New patient, part of Q49"><Switch checked onChange={noop} label="New patient asks for a file" /></FormRow>
        <FormRow label="Home visits" hint="later, not day one"><span className="text-13 text-faint">—</span></FormRow>
      </Fieldset>
    </div>
  </App>
}

export const FAMILY: Pic[] = [
  { id: 'clinics-map', title: 'The clinics · who ticks what', note: 'Shared packs (vaccines, chronic care) for what many departments do, small packs for a specialty\'s own; family medicine ticks five. Q15, Q16.', Page: ClinicsMap },
  { id: 'family-folder', title: 'Family medicine · the family file', note: 'The household and what each member is due, from the packs this department ticks; /checks: what is due for her by age and sex. Q49.', Page: FamilyFolder },
  { id: 'family-day', title: 'Family medicine · the queue', note: 'One department, five packs: each may put one word on a row. Q50.', Page: FamilyDay },
  { id: 'family-checks', title: 'Family medicine · settings', note: 'The checks due by age and sex as a small table, each met by a base entry; family files.', Page: FamilyChecks },
]
