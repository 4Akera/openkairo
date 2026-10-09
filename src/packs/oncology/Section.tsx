// The Cancer section of the chart's record panel (spec/openCare.md §5.8; the picture #onc-plan): the diagnosis (where, ICD-10, the
// morphology and grade), the stage with the TNM and its edition, the markers, ECOG (the base's observation), the intent, the plan (done,
// now, to come), the cycles from the clinic's list (date, dose, what came after), the anthracycline so far and the heart. Read-only: a
// line opens its entry in the center.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, Tag, shortDate } from '@core/ui'
import { anthracycline, cancersOf, cyclesOf, latestOf, type Entry, type Value } from './model'

const ECOG = '89247-1'
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <p className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-0.5 text-13"><span className="text-12 text-faint">{k}</span><span className="text-fg">{children}</span></p>
const STEP: Record<string, string> = { operation: 'Operation', chemotherapy: 'Chemotherapy', radiotherapy: 'Radiotherapy', endocrine: 'Endocrine', targeted: 'Targeted', immunotherapy: 'Immunotherapy' }

export const entriesOf = (own: SectionBody['own']): Entry[] => own.shown.map((e) => ({ id: e.id, item: e.item, type: e.type, occurred_at: e.occurred_at, recorded_at: e.recorded_at, data: e.data }))
export const valuesIn = (rec: SectionBody['p']['rec']): Value[] => (rec.tables['base.values']?.rows ?? []).map((v) => ({ key: v.key, code: v.code, value: Number(v.value), at: v.at }))

export function CancerSection({ p, own }: SectionBody) {
  const entries = entriesOf(own); const cancer = cancersOf(entries)[0]; const cycles = cyclesOf(entries)
  if (!cancer && own.hidden.length) return <ul className="text-13 text-muted">{own.hidden.map((e) => <li key={e.id}>{e.line}</li>)}</ul>
  if (!cancer) return <Empty size="sm">No cancer on record</Empty>
  const w = cancer.words; const vals = valuesIn(p.rec)
  const ecog = vals.filter((v) => v.code?.replace(/^loinc:/, '') === ECOG).sort((a, b) => b.at.localeCompare(a.at))[0]
  const ef = latestOf(vals, 'ef')
  const today = new Date().toISOString().slice(0, 10)
  const after = (i: number) => (cycles[i + 1]?.words.toxicity ?? []).filter((t) => t.grade > 0).map((t) => ({ t: `${t.term.toLowerCase()} G${t.grade}`, bad: t.grade >= 3 }))
  const anth = anthracycline(cycles.filter((c) => c.status === 'completed' || c.due.slice(0, 10) < today))
  const doxo = cycles.filter((c) => c.status === 'completed').reduce((s, c) => s + (c.words.doses ?? []).filter((d) => /doxorubicin/i.test(d.drug)).reduce((a, d) => a + d.dose, 0), 0)
  return <div className="grid gap-0.5">
    <Row k="Diagnosis"><button type="button" onClick={() => p.open(cancer.entry.id)} className="rounded-sm text-start hover:underline focus-ring">{cancer.name}</button>
      {cancer.code && <span className="ms-1 font-mono text-12 text-muted">{cancer.code}</span>}
      {w.morphology?.text && <> · {w.morphology.text.toLowerCase()}{w.morphology.codings?.[0] && <span className="ms-1 font-mono text-12 text-muted">{w.morphology.codings[0].code}</span>}</>}
      {w.grade && <> · grade {w.grade}</>}</Row>
    {(w.stage || w.tnm) && <Row k="Stage"><b className="font-semibold">{w.stage}</b>{w.tnm && <> · {[w.tnm.t, w.tnm.n, w.tnm.m].filter(Boolean).join(' ')}{w.tnm.edition && <> · <span className="whitespace-nowrap">{w.tnm.edition}</span></>}</>}</Row>}
    {(w.markers?.length ?? 0) > 0 && <Row k="Markers">{w.markers!.map((m) => `${m.name} ${m.value}`).join(' · ')}</Row>}
    {ecog && <Row k="ECOG">{ecog.value} · {shortDate(ecog.at)}</Row>}
    {w.intent && <Row k="Intent">{w.intent}</Row>}
    {(w.plan?.length ?? 0) > 0 && <><p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">The plan</p>
      {w.plan!.map((s) => <p key={s.step} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-0.5 text-13">
        <span className={s.status === 'done' ? 'text-ok' : s.status === 'now' ? 'font-semibold text-accent' : 'text-muted'}>{STEP[s.step] ?? s.step}{s.status === 'done' ? ' ✓' : ''}</span>
        <span className={s.status === 'todo' ? 'text-muted' : 'text-fg'}>{s.status === 'now' && <Tag tone="accent" className="me-1">now</Tag>}{s.text}</span></p>)}</>}
    {w.regimen && <Row k="Regimen">{w.regimen}</Row>}
    {cycles.length > 0 && <><p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">Cycles · from the clinic's list</p>
      <table className="w-full text-13"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['Cycle', 'Date', 'Dose', 'After it'].map((h) => <th key={h} className="py-1 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody>{cycles.map((c, i) => { const isToday = c.due.slice(0, 10) === today
          return <tr key={c.entry.id} className="border-t border-line"><td className="py-1"><button type="button" onClick={() => p.open(c.entry.id)} className="rounded-sm hover:underline focus-ring">{c.words.name ?? c.words.regimen} {c.words.cycle}</button></td>
            <td className="py-1 tnum text-muted">{isToday ? 'today' : shortDate(c.due)}</td>
            <td className="py-1 tnum">{c.status === 'completed' ? `${c.words.percent ?? 100} %` : c.words.decision === 'delay' ? 'delayed' : isToday ? '' : c.status === 'active' ? 'to come' : ''}</td>
            <td className="py-1">{after(i).map((x, j) => <span key={j} className={x.bad ? 'font-medium text-danger' : 'text-muted'}>{j ? ' · ' : ''}{x.t}</span>)}</td></tr> })}</tbody></table></>}
    {doxo > 0 && <Row k="Doxorubicin">{doxo} mg so far · {anth} mg/m²</Row>}
    {ef && <Row k="Heart">EF {ef.value} % · {shortDate(ef.at)}</Row>}
  </div>
}
