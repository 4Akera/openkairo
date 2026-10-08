// ObGyn's labour ward, drawn now (2026-10-08, proposed by Claude, awaiting the owner); the antenatal clinic and gynaecology come with
// the next group. The board's line (G/P, weeks, cervix, hours, the alert line), the partograph, and the birth: the baby gets a record
// of her own, "mother of" her mother, and a cot beside her. Postnatal beds use the shared ward pack; ObGyn's MEOWS in place of NEWS2.
import type { ReactNode } from 'react'
import { Baby } from 'lucide-react'
import { Badge, Button, Callout, Card, Chip, Input, Kbd, ScreenFrame, Tag, type ScreenView } from '@core/ui'
import { App, Label } from './kit'
import { Keys, Line, Under } from './order'
import { Ask, Board, Grid, Stay, noop, type Bed, type GridRow } from './stays'

const LW = 'Labour ward'
const lwTabs = ['Beds', 'Drug round', 'Handover']
const salma = <><Tag tone="warn">past alert line</Tag><Tag>G2 P1</Tag></>
const salmaSafety = <><span className="text-muted">No known allergies</span><Badge tone="info">Pregnant · 39 wk</Badge></>

// ── 1 · the labour ward's board ──
export function LabourBoard() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All beds', count: 8 }, { id: 'labour', label: 'In labour', count: 3 }, { id: 'after', label: 'After birth', count: 3 }, { id: 'free', label: 'Free', count: 2 }]
  const beds: Bed[] = [
    { name: 'Delivery 1', who: { name: 'Salma Ahmed', sexAge: 'F 27', day: 1, clinician: 'Dr. Nermeen Fathy', reason: 'labour', urgent: false },
      line: ['G2 P1', '39+2 w', '6 cm · 4 h', { text: 'past alert line', tone: 'warn' }], buttons: ['Partograph', 'Birth'] },
    { name: 'Delivery 2', who: { name: 'Doaa Hassan', sexAge: 'F 22', day: 1, clinician: 'Dr. Nermeen Fathy', reason: 'labour', urgent: false },
      line: ['G1 P0', '40+5 w', '4 cm · 1 h', 'oxytocin 4 mU/min'], buttons: ['Partograph', 'Birth'] },
    { name: 'Delivery 3', who: { name: 'Nesma Galal', sexAge: 'F 33', day: 1, clinician: 'Dr. Ahmed Zaki', reason: 'labour, previous CS', urgent: true },
      line: ['G3 P2', '38+1 w', '8 cm · 3 h', { text: 'FHR 100 at 11:55', tone: 'danger' }], buttons: ['Partograph', 'Birth'] },
    { name: 'Delivery 4' },
    { name: 'Post 1', who: { name: 'Heba Mostafa', sexAge: 'F 30', day: 1, clinician: 'Dr. Ahmed Zaki', reason: 'after birth', urgent: false },
      line: ['born 06:40 · normal', 'girl 3.1 kg', 'MEOWS no triggers', 'feeding'], buttons: ['Give', 'Obs'] },
    { name: 'Cot · Post 1', who: { name: 'Baby of Heba Mostafa', sexAge: 'F 0 d', day: 1, clinician: 'Dr. Laila Sabry', reason: 'well baby', urgent: false },
      line: ['3.1 kg', 'Apgar 8 · 9', 'vitamin K given', 'hepatitis B due'], buttons: ['Give', 'Obs'] },
    { name: 'Post 2', who: { name: 'Marwa Adel', sexAge: 'F 35', day: 2, clinician: 'Dr. Nermeen Fathy', reason: 'after caesarean', urgent: false },
      line: ['CS day 1', { text: 'MEOWS 2 yellow · BP 150/100', tone: 'warn' }, 'catheter out 06:00'], buttons: ['Give', 'Obs'] },
    { name: 'Post 3' },
  ]
  return <App dept={LW} user="Asmaa Fouad" tabs={lwTabs} tab="Beds">
    <ScreenFrame views={views} view="all" onView={noop}>
      <Board beds={beds} />
      <p className="text-12 text-faint">The base's board again: delivery beds, postnatal beds and cots are places. In labour the line is ObGyn's (gravida and para, weeks, cervix and hours since active
        labour, the alert line, the last heart rate when it is off); after birth ObGyn's MEOWS stands where the ward pack's NEWS2 would, and the ward pack's Give and Obs take the buttons. A baby has her own tile, record and stay, “Baby of …” until named.
        A midwife (her own role, built on the base's Nurse) holds the labour actions.</p>
    </ScreenFrame>
  </App>
}

// ── 2 · the partograph ──
function Partograph() {
  // x: hours of active labour (0 = 4 cm at 08:00); y: cervix 0–10 cm, and the head in fifths above the brim (5/5 at the 10 line, a fifth = 2 cm);
  // the alert line at 1 cm an hour from 4 cm, the action line 4 h after it
  const W = 560, H = 300, L = 34, R = 30, B = 22, T = 8
  const x = (h: number) => L + h * ((W - L - R) / 12)
  const ys = (cm: number) => T + (10 - cm) * ((H - T - B) / 10)
  const cervix: [number, number][] = [[0, 4], [2, 5], [4, 6]]
  const head: [number, number][] = [[0, 5], [2, 4], [4, 3]]
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Partograph: cervix 4 cm at 08:00, 5 cm at 10:00, 6 cm at 12:00, right of the alert line; head 5/5, 4/5, 3/5">
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cm) => <g key={cm}><line x1={L} x2={W - R} y1={ys(cm)} y2={ys(cm)} className="stroke-line" />
      <text x={L - 8} y={ys(cm) + 4} textAnchor="end" className="fill-faint text-11">{cm}</text>
      {cm % 2 === 0 && <text x={W - R + 4} y={ys(cm) + 4} className="fill-faint text-11">{cm / 2}/5</text>}</g>)}
    {Array.from({ length: 13 }, (_, h) => <g key={h}><line x1={x(h)} x2={x(h)} y1={T} y2={H - B} className="stroke-line" />
      {h % 2 === 0 && <text x={x(h)} y={H - 6} textAnchor="middle" className="fill-faint text-11">{String(8 + h).padStart(2, '0')}</text>}</g>)}
    <line x1={x(0)} y1={ys(4)} x2={x(6)} y2={ys(10)} className="stroke-warn" strokeWidth={2} />
    <text x={x(6) + 4} y={ys(10) + 12} className="fill-warn text-11">alert</text>
    <line x1={x(4)} y1={ys(4)} x2={x(10)} y2={ys(10)} className="stroke-danger" strokeWidth={2} strokeDasharray="6 4" />
    <text x={x(10) + 4} y={ys(10) + 12} className="fill-danger text-11">action</text>
    <polyline points={cervix.map(([h, cm]) => `${x(h)},${ys(cm)}`).join(' ')} className="fill-none stroke-accent" strokeWidth={2} />
    {cervix.map(([h, cm]) => <text key={h} x={x(h)} y={ys(cm) + 5} textAnchor="middle" className="fill-accent text-14 font-bold">×</text>)}
    <polyline points={head.map(([h, f]) => `${x(h)},${ys(f * 2)}`).join(' ')} className="fill-none stroke-fg" strokeWidth={1.5} />
    {head.map(([h, f]) => <circle key={h} cx={x(h)} cy={ys(f * 2)} r={4} className="fill-surface stroke-fg" strokeWidth={1.5} />)}
  </svg>
}
export function LabourPartograph() {
  const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00']
  const rows: GridRow[] = [
    { group: 'Baby', label: 'Heart rate', cells: ['140', '138', '144', '142', '136', '140', '148', '146', '142'] },
    { label: 'Liquor', cells: ['intact', '', '', '', 'clear', '', '', '', 'clear'] },
    { label: 'Moulding', cells: ['0', '', '', '', '0', '', '', '', '+'] },
    { group: 'Contractions', label: 'per 10 min', cells: ['3', '', '3', '', '3', '', '3', '', '3'] },
    { label: 'lasting', unit: 's', cells: ['30', '', '35', '', '35', '', '40', '', '40'] },
    { group: 'Mother', label: 'Pulse', cells: ['88', '', '90', '', '92', '', '90', '', '94'] },
    { label: 'BP', cells: ['118/76', '', '', '', '122/78', '', '', '', '124/80'] },
    { label: 'Temperature', cells: ['37.1', '', '', '', '37.2', '', '', '', '37.4'] },
    { label: 'Urine', unit: 'mL · protein · acetone', cells: ['200 · – · –', '', '', '', '', '', '', '', '150 · – · –'] },
    { group: 'Drugs', label: 'Oxytocin', unit: 'mU/min', cells: [] },
    { label: 'Drugs, IV fluids', cells: [] },
  ]
  return <Stay dept={LW} user="Asmaa Fouad" who={['Salma Ahmed', '27 y · F · #10318']} where="In labour · Delivery 1 · 4 h" safety={salmaSafety} words={salma} wide>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="grid content-start gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2"><Label>Partograph · active labour from 08:00</Label><span className="text-12 text-muted">× cervix in cm · ○ head, fifths above the brim (right scale)</span></div>
        <Partograph />
      </Card>
      <Card className="grid content-start gap-2 p-3">
        <Label>Examined at 12:00</Label>
        <Line>/ve 6 · 3/5 · OA · clear</Line>
        <Under tone="warn"><p className="text-13 text-fg">Cervix 6 cm · head 3/5 · OA · liquor clear · membranes ruptured 10:00</p>
          <div className="flex flex-wrap items-center gap-1 text-12"><span className="w-16 text-muted">Moulding</span>{['0', '+', '++', '+++'].map((w) => <Chip key={w} on={w === '+'} onClick={noop}>{w}</Chip>)}</div>
          <div className="flex flex-wrap items-center gap-1 text-12"><span className="w-16 text-muted">Caput</span>{['none', '+', '++'].map((w) => <Chip key={w} on={w === 'none'} onClick={noop}>{w}</Chip>)}</div>
          <Keys><span className="font-mono">/fhr 142 · /ctx 3 in 10 40s · /v the mother's signs · /oxy the rate, when the doctor orders it</span></Keys></Under>
        <Callout tone="warn" title="Past the alert line">2 cm in 4 hours. Tell Dr. Nermeen Fathy; the action line is at 14:00. Only a notice, as everywhere: the doctor decides.</Callout>
      </Card>
    </div>
    <Grid times={times} rows={rows} now={8} first="10rem" />
    <Ask n={9}>Which partograph? Drawn: the WHO's modified partograph (active labour from 4 cm, the alert line at 1 cm an hour, the action line 4 hours after), as most Egyptian labour wards keep it.
      The other is the WHO Labour Care Guide (2020: from 5 cm, a time limit per centimetre, no lines). One of them, the clinic's setting, never both on one woman.
      The same woman under the Guide: her active labour starts at 5 cm at 10:00, and 5 → 6 cm in 2 hours is inside its 6-hour limit at 5 cm, so no notice today; the
      partograph drawn says “past the alert line” at 12:00.</Ask>
  </Stay>
}

// ── 3 · the birth, and the baby's own record ──
export function LabourBirth() {
  const row = (label: string, children: ReactNode) => <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-32 shrink-0 text-muted">{label}</span>{children}</div>
  return <Stay dept={LW} user="Asmaa Fouad" who={['Salma Ahmed', '27 y · F · #10318']} where="In labour · Delivery 1 · 9 h" safety={salmaSafety} words={salma}
    actions={<Button size="sm" variant="outline" className="ring-2 ring-accent"><Baby />Birth</Button>}>
    <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
      <Label>The birth</Label>
      {row('Born at', <Input readOnly value="16:52" className="h-8 w-20 tnum" />)}
      {row('Delivered by', <><Chip on onClick={noop}>Asmaa Fouad (me)</Chip><Chip onClick={noop}>Dr. Nermeen Fathy</Chip></>)}
      {row('How', ['Normal', 'Vacuum', 'Forceps', 'Breech, vaginal', 'Caesarean (from theatre)'].map((w, i) => <Chip key={w} on={i === 0} onClick={noop}>{w}</Chip>))}
      {row('Perineum', <>{['No tear', '1st degree', '2nd degree', '3rd degree', '4th degree'].map((w, i) => <Chip key={w} on={i === 0} onClick={noop}>{w}</Chip>)}
        <Chip variant="check" on onClick={noop}>Episiotomy</Chip><Chip variant="check" on onClick={noop}>Repaired</Chip></>)}
      {row('Third stage', <><Chip on onClick={noop}>Oxytocin 10 units IM</Chip><span className="text-12 text-faint">the base's given</span><Chip on onClick={noop}>Placenta complete</Chip></>)}
      {row('Blood loss', <><Input readOnly value="350" className="h-8 w-20 tnum" /><span className="text-muted">mL</span><span className="text-12 text-faint">500 mL or more (1000 after a caesarean) says “PPH” and tells the doctor; only a notice</span></>)}
      <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
        <Label>The baby</Label>
        {row('Sex', ['Girl', 'Boy', 'Not sure'].map((w, i) => <Chip key={w} on={i === 1} onClick={noop}>{w}</Chip>))}
        {row('Weight', <><Input readOnly value="3 350" className="h-8 w-20 tnum" /><span className="text-muted">g</span></>)}
        {row('Apgar', <><span className="text-fg tnum">1 min <b>8</b> · 5 min <b>9</b></span>
          <span className="text-12 text-faint">tap the five signs at 1 and at 5 minutes; the server adds them up</span></>)}
        {row('Breathing', ['Cried at once', 'Needed rubbing', 'Bag and mask'].map((w, i) => <Chip key={w} on={i === 0} onClick={noop}>{w}</Chip>))}
        {row('Given', <><Chip on variant="check" onClick={noop}>Vitamin K 1 mg IM</Chip><Chip on variant="check" onClick={noop}>Eye ointment</Chip><Chip variant="check" onClick={noop}>Hepatitis B · first 24 h</Chip></>)}
        {row('Where', <><Chip on onClick={noop}>Cot beside her · Delivery 1</Chip><Chip onClick={noop}>Nursery</Chip><Chip onClick={noop}>NICU</Chip></>)}
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline">Another baby (twins)</Button>
        <span className="text-12 text-faint">a second baby card, with a record and a cot of its own, in the same Done</span></div>
      <Callout tone="info" title="A record of his own">“Baby of Salma Ahmed”, boy, born today 16:52, a new record number, her as his mother (the core's relation), his first stay in the cot. The name comes
        later from the desk (the birth certificate). Her labour ends with this birth; she stays in Delivery 1 as “after birth”, his cot beside her, until she is moved to a postnatal bed.</Callout>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button>Sign the birth<Kbd className="ms-1">⌘↵</Kbd></Button>
        <span className="text-12 text-faint">one Done: the birth, the third stage, the baby's record, his scores and doses, his cot</span></div>
    </Card>
    <Ask n={10}>The baby's record is made in the same Done as the birth (a new patient, “mother of”, his first stay): a core change, since today a patient is saved only by the desk's door, apart
      from any set. The other way: the midwife presses “New baby” first (the desk's door), then signs the birth on both records.</Ask>
  </Stay>
}

