// The Kidneys section (spec/openCare.md §5.1 rule 2, §5.8; the picture #renal-ckd): the KDIGO grid with the patient's square now and a year
// before, eGFR over time, ACR, BP against its target, the CKD panel with what stands beside each test, and where dialysis stands. Read-only.
import { Fragment, type ReactNode } from 'react'
import type { SectionBody } from '@core/screens/chart/sections'
import { medicinesOf } from '@core/screens/chart/model/record'
import { Empty, LineChart, cn, shortDate } from '@core/ui'
import type { ValueRow } from '@core/db/types'
import { A, ACR, G, RISK, RISK_WORD, egfrSeries, fallOf, panelOf, squaresOf, type Square } from './kidney'

const BG = ['bg-ok-soft', 'bg-warn-soft', 'bg-warn-line', 'bg-danger-line']
const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex items-baseline gap-2 py-0.5 text-13"><span className="w-24 shrink-0 text-12 text-faint">{k}</span><span className="min-w-0 flex-1 text-fg">{children}</span></div>
const Head = ({ k, r, center }: { k: string; r: string; center?: boolean }) => <span className={cn('text-11 text-faint', center && 'text-center')}><b className="font-semibold text-fg">{k}</b> {r}</span>
const Flag = ({ v, hi, lo }: { v: number; hi?: number; lo?: number }) => <span className={cn(((hi != null && v > hi) || (lo != null && v < lo)) && 'font-medium text-warn')}>{v}</span>

/** the grid: eGFR down, ACR (mg/g) across, each square its risk in colour and word; the patient's square now and a year before */
export function Kdigo({ now, before }: { now: Square; before: Square | null }) {
  const at = (s: Square) => shortDate(s.egfr.at)
  return <div className="grid grid-cols-[5rem_repeat(3,minmax(0,1fr))] items-center gap-0.5 text-12" role="img" aria-label={`KDIGO: now ${G[now.g][0]} ${now.a != null ? A[now.a][0] : ''}`}>
    <span className="text-11 text-faint">ACR mg/g →</span>{A.map(([a, r]) => <Head key={a} k={a} r={r} center />)}
    {G.map(([g, r], i) => <Fragment key={g}><Head k={g} r={r} />{A.map(([a], j) => { const here = now.g === i && now.a === j; const was = !here && before?.g === i && before?.a === j
      return <span key={a} className={cn('grid h-7 place-items-center rounded-sm text-11', BG[RISK[i][j]], here ? 'font-semibold text-fg ring-2 ring-fg' : was ? 'font-medium text-fg outline-2 -outline-offset-2 outline-dashed outline-fg' : 'text-muted')}>
        {here ? `now · ${at(now)}` : was ? at(before!) : RISK_WORD[RISK[i][j]]}</span> })}</Fragment>)}</div>
}

export function Kidneys({ p }: SectionBody) {
  const values: ValueRow[] = p.rec.tables['base.values']?.rows ?? []; const pt = p.r.identity
  const egfrs = egfrSeries(values, pt.birth_date ?? null, pt.gender === 'female'); const { now, before } = squaresOf(egfrs, values)
  if (!now) return <Empty size="sm">No eGFR or creatinine on the record yet</Empty>
  const acrs = values.filter((v) => v.code === ACR).sort((a, b) => b.at.localeCompare(a.at)); const fall = fallOf(now, before)
  const sys = values.filter((v) => v.key === 'bp.sys').sort((a, b) => b.at.localeCompare(a.at))[0]; const dia = sys && values.find((v) => v.key === 'bp.dia' && v.entry_id === sys.entry_id)
  const panel = panelOf(values, medicinesOf(p.rec, p.ctx).current); const panelAt = panel.map((r) => r.value?.at).filter(Boolean).sort().at(-1)
  return <div className="grid gap-1">
    {now.a != null ? <Kdigo now={now} before={before} /> : <p className="text-13 text-muted">{G[now.g][0]} · no urine ACR on the record: the square needs one</p>}
    <p className="pb-1 pt-1 text-12 text-faint">Worked out from the latest eGFR and ACR (KDIGO 2012){before ? `; a year before ${G[before.g][0]}${before.a != null ? ` ${A[before.a][0]}` : ''}` : ''}.</p>
    {egfrs.length > 1 && <LineChart height={130} label={`eGFR · mL/min/1.73 m² · CKD-EPI 2021${before ? ` · ${before.egfr.value} a year before` : ''}, ${now.egfr.value} now`}
      points={egfrs.map((v) => ({ at: v.at, value: v.value, flag: v.value < 60 ? 'low' as const : undefined, entryId: v.entry_id }))} onPoint={p.open} />}
    <Row k="eGFR"><Flag v={now.egfr.value} lo={60} /> <Faint>{shortDate(now.egfr.at)}{fall != null && fall > 0 ? ` · falling ${fall} a year` : ''}</Faint></Row>
    {acrs[0] && <Row k="ACR"><Flag v={acrs[0].value} hi={30} /> mg/g <Faint>{acrs[1] ? `${acrs[1].value} on ${shortDate(acrs[1].at)} · ` : ''}{shortDate(acrs[0].at)}</Faint></Row>}
    {sys && <Row k="BP"><Flag v={sys.value} hi={129} />/{dia?.value ?? '?'} <Faint>target &lt; 130/80 · {shortDate(sys.at)}</Faint></Row>}
    <p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">The CKD panel{panelAt ? ` · ${shortDate(panelAt)}` : ''}</p>
    <table className="w-full text-13 tnum"><tbody>{panel.map((r) => <tr key={r.key} className="border-t border-line">
      <td className="w-44 py-1 pe-2">{r.name} {r.value ? <><span className={cn(r.value.interpretation && r.value.interpretation !== 'N' && 'font-medium text-warn')}>{r.value.value}</span> <Faint>{r.value.unit ?? ''}</Faint></> : <Faint>not checked</Faint>}</td>
      <td className="py-1 text-muted">{r.beside}</td></tr>)}</tbody></table>
    <Row k="Dialysis">{now.g >= 5 ? 'near: the talk, the fistula and hepatitis B vaccine now; at the first session the dialysis unit takes over'
      : now.g === 4 ? 'not near yet · the talk, the fistula and hepatitis B vaccine come first; at the first session the dialysis unit takes over' : <span className="text-muted">not near</span>}</Row>
  </div>
}
