// ObGyn's sections in the chart (spec/openCare.md §5.8, the pictures #anc-visit … #ob-postnatal). Pregnancy (women 10–55): the dates
// (the LMP, the EDD), what came before, the blood group and risks from the booking, every antenatal visit as a row (BP and weight
// from the base's vitals of the same visit), the tests (Hb), the scans (the clinic's results), the birth or "not written". Gynaecology
// (women 10 and over): the periods, the method and when it is due again by the clinic's intervals, cervical screening. Read-only: a
// row opens its entry.
import type { SectionBody } from '@core/screens/chart/sections'
import type { ServerEntry, ValueRow } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { pregnancyOf } from '@core/screens/chart/model/facts'
import { Empty, cn, shortDate } from '@core/ui'
import { ANC, PN, PERIODS, type AncO, type PeriodsO, type PnO } from './lines'
import { bookingOf, centileWord, dayMonth, eddOf, efwCentile, gestOf, gestText, gpOf, methodDue, type Gest } from './pregnancy'
import { gynOf, SCREENING } from './settings'
import { methodNow, screeningNow } from './gyn'

const th = 'py-1 pe-2 text-start text-11 font-medium uppercase tracking-[0.04em] text-faint'
const td = 'py-1 pe-2 text-13 tnum'
const Label = ({ children }: { children: string }) => <p className="pt-2 text-11 font-medium uppercase tracking-[0.06em] text-faint">{children}</p>
const Row = ({ k, tone, children }: { k: string; tone?: 'warn' | 'ok'; children: React.ReactNode }) =>
  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-0.5 text-13"><span className={cn('text-muted', tone === 'warn' && 'text-warn')}>{k}</span>
    <span className={cn(tone === 'warn' && 'font-medium text-warn', tone === 'ok' && 'text-ok')}>{children}</span></div>
const today = () => new Date().toISOString().slice(0, 10)
const valuesOf = (p: SectionBody['p']) => ((p.rec.tables as Record<string, { rows: ValueRow[] } | undefined>)['base.values']?.rows ?? [])

export function PregnancyBody({ p, own }: SectionBody) {
  const { org } = useDepartment()
  const preg = pregnancyOf(p.facts, org?.types, today())
  const ancs = own.shown.filter((e) => e.type === ANC).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const pns = own.shown.filter((e) => e.type === PN)
  const booking = bookingOf(ancs)
  const values = valuesOf(p)
  if (!preg && !ancs.length && !pns.length) return <Empty size="sm">No pregnancy recorded: /preg, then /anc</Empty>
  const lmp = preg?.lmp ?? null; const edd = preg ? eddOf({ lmp, weeks: preg.data.weeks, at: preg.at }) : null
  const g = preg?.pregnant ? gestOf({ lmp, weeks: preg.data.weeks, at: preg.at }, new Date()) : null
  // the BP and weight of the same visit (or, written outside one, of the same moment)
  const bpOf = (e: ServerEntry) => { const vs = values.filter((v) => e.visit_id ? v.visit_id === e.visit_id : Math.abs(new Date(v.at).getTime() - new Date(e.occurred_at).getTime()) < 3_600_000)
    const sys = vs.find((v) => v.key === 'bp.sys' || v.key === 'sys' || v.key === 'systolic')?.value; const dia = vs.find((v) => v.key === 'bp.dia' || v.key === 'dia' || v.key === 'diastolic')?.value
    return { bp: sys && dia ? `${sys}/${dia}` : '—', kg: vs.find((v) => v.key === 'weight')?.value ?? null } }
  const scans = values.filter((v) => v.key === 'efw').sort((a, b) => a.at.localeCompare(b.at))
  const pool = (v: ValueRow) => values.find((x) => x.key === 'dvp' && x.entry_id === v.entry_id)?.value
  const gAt = (at: string): Gest | null => lmp ? gestOf({ lmp }, new Date(at)) : preg ? gestOf({ weeks: preg.data.weeks, at: preg.at }, new Date(at)) : null
  const hb = values.filter((v) => v.key === 'hb').sort((a, b) => b.at.localeCompare(a.at))[0]
  const birth = pns.map((e) => (e.data as { obgyn?: PnO }).obgyn?.birth).find(Boolean)
  return <div className="grid gap-0.5">
    {preg?.pregnant && <Row k="Dates">{lmp ? `LMP ${dayMonth(lmp)} · ` : ''}EDD <b className="font-semibold">{edd ? dayMonth(edd) : '—'}</b>{lmp ? ' by the LMP' : ' by the weeks said'}{g ? ` · ${gestText(g)} today` : ''}</Row>}
    {(preg?.overdue || (g && g.weeks > 44)) && <Row k="The birth" tone="warn">not written · the record still counts {g?.weeks ?? '45'} w</Row>}
    {booking && <Row k="Before">{[gpOf(booking), booking.before].filter(Boolean).join(' · ') || '—'}</Row>}
    {booking?.blood_group && <Row k="Blood group" tone={booking.rh === 'negative' ? 'warn' : undefined}>{booking.blood_group} Rh {booking.rh ?? '?'}{booking.antibodies ? ` · antibodies ${booking.antibodies}` : ''}</Row>}
    {booking?.risks?.length ? <Row k="Risks">{booking.risks.map((r) => r.replace(/_/g, ' ')).join(' · ')}{booking.rh === 'negative' ? ' · Rh negative' : ''}</Row> : null}
    {birth && <Row k="The birth">{dayMonth(birth.on)}{birth.weeks ? ` · ${birth.weeks}+${birth.days ?? 0} w` : ''} · {birth.where === 'here' ? 'here' : birth.place || 'another hospital'} · {birth.how}{birth.baby ? ` · ${birth.baby}${birth.grams ? ` ${birth.grams} g` : ''}` : ''}</Row>}
    {ancs.length > 0 && <><Label>Visits</Label>
      <table className="w-full"><thead><tr>{['Weeks', 'BP', 'kg', 'Fundus', 'FHR', 'Urine', 'Lie'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{ancs.map((e) => { const o = (e.data as { obgyn?: AncO }).obgyn ?? {}; const v = bpOf(e)
          return <tr key={e.id} className="border-t border-line"><td className={td}><button type="button" onClick={() => p.open(e.id)} className="rounded-sm hover:underline focus-ring">{o.weeks !== undefined ? `${o.weeks}+${o.days ?? 0}` : shortDate(e.occurred_at)}</button></td>
            <td className={td}>{v.bp}</td><td className={td}>{v.kg ?? '—'}</td><td className={td}>{o.sfh ?? '—'}</td><td className={td}>{o.fhr ?? '—'}</td>
            <td className={cn(td, o.protein && !['nil', 'trace'].includes(o.protein) && 'text-warn')}>{o.protein ?? '—'}</td><td className={td}>{o.lie === 'cephalic' ? 'ceph' : o.lie ?? '—'}</td></tr> })}</tbody></table></>}
    {scans.length > 0 && <><Label>Scans</Label>
      <table className="w-full"><thead><tr>{['Weeks', 'EFW', 'Centile', 'Pool'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{scans.map((v) => { const ga = gAt(v.at); const c = ga ? efwCentile(v.value, ga) : null
          return <tr key={v.id} className="border-t border-line"><td className={td}><button type="button" onClick={() => p.open(v.entry_id)} className="rounded-sm hover:underline focus-ring">{ga ? gestText(ga).replace(' w', '') : shortDate(v.at)}</button></td>
            <td className={td}>{v.value.toLocaleString('en-GB')} g</td><td className={cn(td, c !== null && (c < 10 || c > 90) && 'font-medium text-warn')}>{c !== null ? centileWord(c) : '—'}</td>
            <td className={td}>{pool(v) !== undefined ? `${pool(v)} cm` : '—'}</td></tr> })}</tbody></table></>}
    {hb && <><Label>Tests</Label><Row k="Hb" tone={hb.interpretation === 'L' ? 'warn' : undefined}>{hb.value} g/dL{lmp ? ` at ${gestOf({ lmp }, new Date(hb.at))?.weeks ?? '?'} w` : ` · ${shortDate(hb.at)}`}</Row></>}
  </div>
}

export function GynaecologyBody({ p, own }: SectionBody) {
  const { org } = useDepartment(); const rules = gynOf(org); const now = new Date()
  const periods = own.shown.filter((e) => e.type === PERIODS).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  const po = (periods?.data as { obgyn?: PeriodsO } | undefined)?.obgyn
  const m = methodNow(p.facts); const due = m && m.method !== 'None' ? methodDue(m.method, m.at, rules.methods, now) : null
  const s = screeningNow(p.facts); const every = SCREENING[rules.screening]
  if (!po && !m && !s) return <Empty size="sm">Nothing yet: /periods, /fp</Empty>
  const nextSmear = s ? new Date(new Date(s.at).setFullYear(new Date(s.at).getFullYear() + every.years)) : null
  return <div className="grid gap-0.5">
    {po && <><Label>Periods</Label>
      {po.lmp && <Row k="Last">{dayMonth(po.lmp)} · day {Math.max(1, Math.floor((now.getTime() - new Date(`${po.lmp}T12:00:00`).getTime()) / 86_400_000) + 1)} today</Row>}
      {po.cycle_from && <Row k="Cycle">every {po.cycle_from}{po.cycle_to && po.cycle_to !== po.cycle_from ? `–${po.cycle_to}` : ''} days{po.days_from ? ` · bleeds ${po.days_from}${po.days_to && po.days_to !== po.days_from ? `–${po.days_to}` : ''} days` : ''}</Row>}
      {po.flow && <Row k="Flow" tone={po.flow === 'heavy' ? 'warn' : undefined}>{[po.flow, po.clots ? 'clots' : null, po.pads ? `${po.pads} pads a day` : null].filter(Boolean).join(' · ')}</Row>}
      {po.pain && <Row k="Pain">{po.pain}</Row>}</>}
    {m && <><Label>Contraception</Label><Row k="Method">{m.method}{m.note ? ` · ${m.note}` : ''} · since {shortDate(m.at)}</Row>
      {due && <Row k="Change" tone={due.past ? 'warn' : 'ok'}>{due.past ? `due ${dayMonth(due.on)} · ${due.months} months past` : `by ${dayMonth(due.on)}`}</Row>}</>}
    {s && <><Label>Cervical screening</Label><Row k="Last">{s.text} · {shortDate(s.at)}</Row>
      {nextSmear && <Row k="Next" tone={nextSmear < now ? 'warn' : undefined}>{nextSmear.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · {every.words}, the clinic&apos;s</Row>}</>}
  </div>
}
