// Cardiology's cards under the line (spec/openCare.md §5.7; the pictures #cardio-ecg, #cardio-hf): the ECG's (rhythm, the measures,
// ST and T, the conclusion; the last ECG beside it) and the heart failure visit's (NYHA, oedema, lying flat). Under the /hf card: the
// weight against the dry weight and, beside the four medicine groups, BP, pulse, K, creatinine and eGFR — shown, never a stop.
import type { ReactNode } from 'react'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Chip, NumberInput, Tag, Textarea, cn, shortDate } from '@core/ui'
import { useDepartment } from '@core/hooks/organization'
import { MEASURES, RHYTHMS, ST_T, conclusionOf, ecgData, ecgOf, isEcg, type EcgParams } from './ecg'
import { FLAT, OEDEMA, hfOf, isNyha, nyhaData } from './hf'
import { besideOf, groupsLine, groupsOf, weightOf } from './heart'
import { targetsOf } from './targets'

const K = ({ children }: { children: ReactNode }) => <span className="w-24 shrink-0 text-12 text-faint">{children}</span>
const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex flex-wrap items-center gap-1.5 text-13"><K>{k}</K>{children}</div>
function Pick<T extends string>({ k, of, on, set, many }: { k: string; of: readonly T[]; on: T[]; set: (v: T[]) => void; many?: boolean }) {
  return <Row k={k}>{of.map((o) => <Chip key={o} on={on.includes(o)} variant={many ? 'check' : 'solid'}
    onClick={() => set(many ? on.includes(o) ? on.filter((x) => x !== o) : [...on, o] : on.includes(o) ? [] : [o])}>{o}</Chip>)}</Row>
}

/** the ECG's card: the fields of the result it writes, edited and written back as that result */
export function EcgCard({ q, set, ctx }: CardEditorProps) {
  const female = ctx.record?.patient?.sex === 'female'; const e = ecgOf(q, female)
  const auto = !e.conclusion || e.conclusion === conclusionOf({ ...e, conclusion: null })
  const put = (patch: Partial<EcgParams>) => { const n = { ...e, ...patch }; const d = ecgData({ ...n, conclusion: auto && !('conclusion' in patch) ? null : n.conclusion })
    set({ analytes: d.analytes, conclusion: d.conclusion }) }
  const last = (ctx.record?.values ?? []).filter((v) => v.code === 'loinc:8633-0' || v.code === 'loinc:8636-3').sort((a, b) => b.at.localeCompare(a.at))[0]
  const prev = last ? (ctx.record?.values ?? []).filter((v) => v.entry_id === last.entry_id) : []
  const said = (code: string) => prev.find((v) => v.code === code)?.value
  return <div className="grid gap-1.5">
    <Pick k="Rhythm" of={RHYTHMS} on={e.rhythm ? [e.rhythm] : []} set={([r]) => put({ rhythm: r ?? null, ...(r === 'AF' || r === 'flutter' ? { pr: null } : {}) })} />
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">{MEASURES.map((m) => <label key={m.key} className="flex items-center gap-1.5 text-13"><K>{m.name}</K>
      <NumberInput dense label={m.name} value={e[m.key]} integer onValue={(v) => put({ [m.key]: v })} className="w-16" /><span className="text-12 text-faint">{m.unit}</span></label>)}</div>
    {(e.rhythm === 'AF' || e.rhythm === 'flutter') && <p className="text-12 text-faint">No PR in {e.rhythm}; the rate is the ventricular rate.</p>}
    <Pick k="ST and T" of={ST_T} on={e.st as typeof ST_T[number][]} set={(st) => put({ st })} many />
    <label className="grid gap-1"><span className="text-12 text-faint">Conclusion</span>
      <Textarea minRows={2} value={e.conclusion ?? conclusionOf(e)} onChange={(x) => put({ conclusion: x.target.value })} /></label>
    {last && <p className="text-12 text-muted">The last ECG · {shortDate(last.at)}{said('loinc:8867-4') != null ? ` · rate ${said('loinc:8867-4')}` : ''}{said('loinc:8625-6') != null ? ` · PR ${said('loinc:8625-6')}` : ''}
      {said('loinc:8633-0') != null ? ` · QRS ${said('loinc:8633-0')}` : ''}{said('loinc:8636-3') != null ? ` · QTc ${said('loinc:8636-3')}` : ''}</p>}
    <p className="text-12 text-faint">Read by the cardiologist: a result with no order. A tracing cannot be attached yet (no file uploads in openCare).</p>
  </div>
}

/** the heart failure visit's card: NYHA, oedema, lying flat; the dry weight's own card is its number */
export function HfCard({ q, set }: CardEditorProps) {
  if (!isNyha(q)) { const kg = Number((q.value as { quantity?: { value: string } } | undefined)?.quantity?.value ?? '') || null
    return <Row k="Dry weight"><NumberInput dense label="Dry weight" value={kg} onValue={(v) => v != null && set({ value: { quantity: { value: String(v), unit: 'kg', ucum: 'kg' } } })} className="w-20" /><span className="text-12 text-faint">kg · stands until the next</span></Row> }
  const h = hfOf(q); const put = (patch: Partial<typeof h>) => { const d = nyhaData({ ...h, ...patch }); set({ value: d.value, note: 'note' in d ? d.note : undefined }) }
  const WORD = ['no limit', 'ordinary activity: breathless', 'less than ordinary: breathless', 'at rest']
  return <div className="grid gap-1.5">
    <Row k="NYHA">{[1, 2, 3, 4].map((n) => <Chip key={n} on={h.nyha === n} onClick={() => put({ nyha: n })}>{['I', 'II', 'III', 'IV'][n - 1]}</Chip>)}
      {h.nyha && <span className="text-12 text-muted">{WORD[h.nyha - 1]}</span>}</Row>
    <Pick k="Oedema" of={OEDEMA} on={h.oedema ? [h.oedema as typeof OEDEMA[number]] : []} set={([o]) => put({ oedema: o ?? null })} />
    <Pick k="Lying flat" of={FLAT} on={h.flat ? [h.flat as typeof FLAT[number]] : []} set={([o]) => put({ flat: o ?? null })} />
  </div>
}

/** under the /hf card: the weight typed against the dry weight, and what stands beside the four medicines (shown, never a stop) */
export function HfNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org } = useDepartment()
  const values = ctx.record?.values ?? []; const w = weightOf(values); const b = besideOf(values)
  const typed = items.find((p) => p.function === 'vitals')?.params.weight as number | undefined
  const dry = (items.find((p) => p.function === 'observation' && !isNyha(p.params))?.params.value as { quantity?: { value: string } } | undefined)?.quantity?.value
  const dryKg = dry ? Number(dry) : w.dry?.value ?? null; const kg = typed ?? w.now?.value ?? null
  const over = kg != null && dryKg != null ? Math.round((kg - dryKg) * 10) / 10 : null
  const groups = groupsOf(ctx.record?.medications ?? [], targetsOf(org))
  return <span className="grid gap-1.5">
    {kg != null && <span className="text-13"><span className="text-faint">Weight </span><span className={cn('font-medium', over != null && over >= 1 ? 'text-warn' : 'text-fg')}>{kg} kg</span>
      {dryKg != null ? <span className="text-muted"> · {over! > 0 ? `${over} over` : over! < 0 ? `${-over!} under` : 'at'} the dry weight {dryKg} kg{w.dry && !dry ? ` (${shortDate(w.dry.at)})` : ''}</span>
        : <span className="text-muted"> · no dry weight set: type dry 70</span>}
      {w.now && typed != null && <span className="text-muted"> · {typed - w.now.value >= 0 ? '+' : ''}{Math.round((typed - w.now.value) * 10) / 10} since {shortDate(w.now.at)}</span>}</span>}
    <span className="grid gap-1 rounded-md bg-surface p-2 ring-1 ring-line"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Beside the four medicines · shown, never a stop</span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-13 text-fg tnum">
        {b.sys && <span>BP {b.sys.value}/{b.dia?.value ?? '?'}</span>}{b.pulse && <span>pulse {b.pulse.value}</span>}
        {b.k && <Tag tone={b.k.value > 5 ? 'warn' : 'neutral'}>K {b.k.value}</Tag>}{b.creat && <span>creatinine {b.creat.value}</span>}
        {b.egfr && <span>eGFR {b.egfr.value}</span>}{(b.k ?? b.creat) && <span className="text-12 text-faint">{shortDate((b.k ?? b.creat)!.at)}</span>}
        {!b.k && !b.creat && <span className="text-muted">no K or creatinine on the record</span>}</span>
      <span className="text-13 text-muted">{groupsLine(groups)}</span></span>
  </span>
}

/** is this card's result an ECG, or this observation the heart failure visit's (the cards register for the base's types) */
export const ecgCardFor = (q: Record<string, unknown>) => isEcg(q)
