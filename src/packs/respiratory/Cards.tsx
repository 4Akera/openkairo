// Respiratory's cards under the line (spec/openCare.md §5.7; the picture #chest-spiro): spirometry's table — before, after, the change,
// predicted, LLN, % predicted and z, the predicted values from the server as the card fills (GLI-2012 for this age, height and sex) — and
// what the numbers say; the action plan's three zones in Arabic; the technique and a flare as their words.
import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { packOp } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { Chip, Input, NumberInput, Tag, Textarea, cn } from '@core/ui'
import { QUALITY, lln, ratio, readingOf, spiroData, spiroOf, zOf, type Lms, type Predicted, type SpiroParams } from './spiro'
import { ZONES, termOf } from './airways'
import type { ServerEntry } from '@core/db/types'

const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
const fix = (n: number | null | undefined, d = 2) => n == null ? '—' : n.toFixed(d)

export function SpiroCard({ q, set, ctx }: CardEditorProps) {
  const { dept } = useDepartment(); const pt = ctx.record?.patient; const s = spiroOf(q)
  const sex = pt?.sex === 'male' || pt?.sex === 'female' ? pt.sex : null; const age = pt?.age ?? null
  const pred = useQuery({ queryKey: ['respiratory.predicted', dept?.id, sex, age, s.height], enabled: !!dept && !!sex && age != null && s.height != null,
    queryFn: () => packOp<Predicted>('respiratory.predicted', dept!.id, { sex, age, height: s.height }) })
  const p = pred.data ?? null; const full: SpiroParams = { ...s, predicted: p }
  const want = JSON.stringify(spiroData(full).analytes)
  useEffect(() => { if (p && want !== JSON.stringify(q.analytes)) { const d = spiroData({ ...spiroOf(q), predicted: p }); set({ analytes: d.analytes, conclusion: d.conclusion }) } }, [p, want])   // eslint-disable-line react-hooks/exhaustive-deps
  const put = (patch: Partial<SpiroParams>) => { const d = spiroData({ ...full, ...patch }); set({ analytes: d.analytes, conclusion: d.conclusion }) }
  const r = readingOf(full)
  const row = (name: string, pre: number | null, post: number | null, l: Lms | undefined, d: number, k?: 'fev1' | 'fvc') => {
    const after = post ?? pre; const ch = pre != null && post != null && k ? `${post - pre >= 0 ? '+' : ''}${(post - pre).toFixed(2)} · ${Math.round((post / pre - 1) * 100)} %` : '—'
    return <tr className="border-t border-line"><td className="py-1 pe-2 text-12 text-faint">{name}</td>
      <td className="py-1 pe-2">{k ? <NumberInput dense label={`${name} before`} value={pre} onValue={(v) => put({ pre: { ...s.pre, [k]: v } })} className="w-16" /> : fix(pre, d)}</td>
      <td className={cn('py-1 pe-2', l && after != null && after < lln(l) && 'font-medium text-warn')}>{k ? <NumberInput dense label={`${name} after`} value={post} onValue={(v) => put({ post: { ...s.post, [k]: v } })} className="w-16" /> : fix(post, d)}</td>
      <td className="py-1 pe-2 text-muted">{ch}</td><td className="py-1 pe-2">{fix(l?.m, d)}</td><td className="py-1 pe-2">{l ? fix(lln(l), d) : '—'}</td>
      <td className="py-1 pe-2">{l && after != null && k ? `${Math.round(after / l.m * 100)} %` : '—'}</td><td className="py-1">{l && after != null ? zOf(after, l).toFixed(1) : '—'}</td></tr>
  }
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 text-13"><Faint>Height</Faint><NumberInput dense label="Height" value={s.height} integer onValue={(v) => put({ height: v })} className="w-16" /><Faint>cm · {age ?? '?'} y · {sex ?? 'sex not known'} · GLI-2012</Faint>
      {p?.missing && <Tag tone="warn">{p.missing}</Tag>}{pred.isFetching && <Faint>asking the server…</Faint>}</p>
    <table className="w-full rounded-md bg-surface text-13 tnum"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['', 'Before', 'After', 'Change', 'Predicted', 'LLN', '% pred.', 'z'].map((h) => <th key={h} className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>{row('FEV1 · L', s.pre.fev1, s.post.fev1, p?.fev1, 2, 'fev1')}{row('FVC · L', s.pre.fvc, s.post.fvc, p?.fvc, 2, 'fvc')}{row('FEV1/FVC', ratio(s.pre), ratio(s.post), p?.ratio, 2)}</tbody></table>
    <div className="grid gap-1 text-13">{r.words.map((w) => <p key={w} className="flex flex-wrap items-center gap-2"><Tag tone={/^obstruction|^GOLD [2-4]/.test(w) ? 'warn' : 'neutral'}>{w.split(':')[0]}</Tag><span className="text-fg">{w.split(':').slice(1).join(':').trim()}</span></p>)}
      {r.reversible === false && <Faint>reversible: 200 mL and 12 %</Faint>}</div>
    <p className="flex flex-wrap items-center gap-1.5 text-13"><Faint>Quality</Faint>{QUALITY.map((g) => <Chip key={g} on={s.quality === g} onClick={() => put({ quality: s.quality === g ? null : g })}>{g}</Chip>)}</p>
    <Faint>Spirometry is the base's result with no order. The printout cannot be attached yet (no file uploads in openCare).</Faint>
  </div>
}

/** the pack's observations: the plan's three zones (Arabic), the technique's or a flare's words */
export function ObsCard({ q, set }: CardEditorProps) {
  const kind = termOf({ data: q } as unknown as ServerEntry); const text = String((q.value as { text?: string } | undefined)?.text ?? '')
  if (kind === 'action_plan') { const lines = text.split('\n'); const zone = (w: string) => lines.find((l) => l.toLowerCase().startsWith(`${w}:`))?.slice(w.length + 1).trim() ?? ''
    const put = (w: string, v: string) => set({ value: { text: ZONES.map(([z]) => `${z}: ${z === w ? v : zone(z)}`).join('\n') } })
    return <div className="grid gap-1.5">{ZONES.map(([w, tone]) => <label key={w} className="flex items-start gap-2"><Tag tone={tone} className="mt-1 w-20 shrink-0 justify-center">{w}</Tag>
      <Textarea dir="rtl" lang="ar" minRows={2} value={zone(w)} onChange={(e) => put(w, e.target.value)} /></label>)}
      <Faint>Her or his own plan, in Arabic. Printing comes with the printing piece (not in openCare yet).</Faint></div> }
  if (!kind) return null
  return <label className="flex items-center gap-2 text-13"><Faint>{kind === 'flare' ? 'Treated with' : 'Technique'}</Faint>
    <Input dense value={text} onChange={(e) => set({ value: { text: e.target.value } })} />{kind === 'flare' && <><Faint>Where</Faint>
      <Input dense value={String(q.note ?? '')} onChange={(e) => set({ note: e.target.value || undefined })} className="w-40" /></>}</label>
}
