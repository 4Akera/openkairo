// /review's card and the words under it (spec/openCare.md §5.7; picture #chronic-visit). The feet: the monofilament, the pulses, the skin
// and the foot risk as chips, each taken or left (nothing waits for it); the eyes: seen here, referred, or an outside report. Under the
// card: the condition's review, when it was last done, and the tests by the clinic's checks — due ones drafted as orders, the rest not due
// with their next date; for a foot at risk, what to tell the patient. A check is done when an entry with one of its codes is written.
import { useState } from 'react'
import { useFacts } from '@core/hooks/chart'
import { useDepartment } from '@core/hooks/organization'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Chip, FormRow, Input, Tag, cn, shortDate } from '@core/ui'
import { CHECK_SYSTEM, reviewLine } from './line'
import { careOf, conditionsOf, type Done } from './model'

type Obs = { code?: { text?: string; codings?: { system: string; code: string }[] }; value?: { text?: string }; note?: string }
const PARTS: Record<string, { label: string; choices: string[]; multi?: boolean; where?: boolean }> = {
  monofilament: { label: 'Monofilament', choices: ['felt everywhere', 'not felt somewhere'], where: true },
  pulses: { label: 'Pulses', choices: ['all felt', 'weak or absent'], where: true },
  skin: { label: 'Skin', choices: ['healthy', 'dry, cracked', 'callus', 'ulcer', 'deformity'], multi: true, where: true },
}
const RISK = ['low', 'moderate', 'high', 'active ulcer']
const EYES = ['seen here (fundus)', 'referred to Ophthalmology', 'brings an outside report']
/** the feet's note: "monofilament: not felt somewhere, left big toe · pulses: weak or absent, left posterior tibial · skin: callus" */
const partsOf = (note = '') => Object.fromEntries(note.split(' · ').map((p) => { const i = p.indexOf(': '); return i > 0 ? [p.slice(0, i), p.slice(i + 2)] : [p, ''] }))
const noteOf = (parts: Record<string, string>) => Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
const checkCode = (q: Obs) => q.code?.codings?.find((c) => c.system === CHECK_SYSTEM)?.code

/** the observation's card: the feet's and the eyes' chips for the pack's own checks; any other observation its words */
export function ReviewCard({ q, set }: CardEditorProps) {
  const o = q as Obs; const code = checkCode(o); const parts = partsOf(o.note)
  const setParts = (k: string, v: string) => set({ note: noteOf({ ...parts, [k]: v }) || undefined })
  if (code === 'feet') return <div className="grid gap-1.5">
    {Object.entries(PARTS).map(([k, p]) => { const [chosen, where = ''] = (parts[k] ?? '').split(/, (?=[^,]*$)/); const picked = p.multi ? chosen.split(' & ').filter(Boolean) : [chosen]
      return <FormRow key={k} inline label={p.label}>{p.choices.map((c) => <Chip data-chip key={c} on={picked.includes(c)}
        onClick={() => { const next = p.multi ? (picked.includes(c) ? picked.filter((x) => x !== c) : [...picked.filter((x) => x !== 'healthy' && c !== 'healthy'), c]) : picked.includes(c) ? [] : [c]
          setParts(k, [next.join(' & '), where].filter(Boolean).join(', ')) }}>{c}</Chip>)}
        {p.where && <Input aria-label={`${p.label}: where`} value={where} onChange={(e) => setParts(k, [picked.join(' & '), e.target.value].filter(Boolean).join(', '))} placeholder="where…" className="h-7 w-44 text-13" />}</FormRow> })}
    <FormRow inline label="Foot risk">{RISK.map((r) => <Chip data-chip key={r} on={o.value?.text === `${r} risk` || (r === 'active ulcer' && o.value?.text === r)} onClick={() => set({ value: { text: r === 'active ulcer' ? r : `${r} risk` } })}>{r}</Chip>)}</FormRow>
  </div>
  if (code === 'eyes') return <FormRow inline label="Today">{EYES.map((e) => <Chip data-chip key={e} on={o.value?.text === e} onClick={() => set({ value: { text: e } })}>{e}</Chip>)}
    <Input aria-label="What was found" value={o.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} placeholder="no retinopathy…" className="h-7 w-48 text-13" /></FormRow>
  return <FormRow inline label="Found"><Input aria-label="What was found" value={o.value?.text ?? ''} onChange={(e) => set({ value: { text: e.target.value } })} className="h-7 max-w-sm flex-1 text-13" /></FormRow>
}
export const reviewCardLine = (params: Record<string, unknown>) => reviewLine(params as Obs)

/** under the card: the review's condition, when last done, its tests by the clinic's checks; for a foot at risk, what to tell the patient */
export function ReviewNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org } = useDepartment(); const patient = ctx.record?.patient
  const facts = useFacts(patient?.id ?? null); const [now] = useState(() => Date.now())
  if (!patient) return null
  const cs = conditionsOf(org ?? ctx.org).conditions
  const values = (ctx.record?.values ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
  const done: Done[] = (facts.data ?? []).filter((e) => !e.hidden).map((e) => ({ codes: e.codes ?? [], at: e.occurred_at, text: String((e.data as Obs | undefined)?.value?.text ?? '') }))
  const problems = cs.flatMap((c) => c.codes.map((k) => ({ code: `icd10:${k}`, status: 'active' })))   // the review names its condition: its checks, as if on it
  const which = cs.find((c) => items.some((i) => i.tag === `chroniccare:${c.key}`))
  const st = careOf(cs.filter((c) => c.key === which?.key), problems, values, done, [])[0]
  if (!st) return null
  const reviewed = st.checks.filter((c) => c.check.codes.some((x) => x.startsWith(`${CHECK_SYSTEM}:`))).map((c) => c.last).filter(Boolean).sort().at(-1)
  const tests = st.checks.filter((c) => !c.check.codes.every((x) => x.startsWith(`${CHECK_SYSTEM}:`)))
  const feet = items.find((i) => checkCode(i.params as Obs) === 'feet')?.params as Obs | undefined
  const atRisk = !!feet?.value?.text && !/^low|not examined/.test(feet.value.text)
  const drafted = (codes: string[]) => items.some((i) => i.function === 'order' && (ctx.services as { id: string; fields?: { code: string }[]; coding?: { system: string; code: string } | null }[])
    .some((s) => s.id === i.params.service_id && ((s.coding && codes.includes(`${s.coding.system}:${s.coding.code}`)) || (s.fields ?? []).some((f) => codes.includes(f.code)))))
  return <div className="grid gap-1.5">
    <p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">{st.condition.name} · the yearly review</b>
      <span className="text-muted">{reviewed ? `last ${shortDate(reviewed)}, ${Math.round((now - Date.parse(reviewed)) / (30.44 * 86_400_000))} months ago` : 'never done'} · the clinic&apos;s checks</span></p>
    <ul className="grid gap-1">{tests.map((c) => <li key={c.check.name} className="flex flex-wrap items-center gap-2 text-13">
      <Tag tone={c.due ? 'warn' : 'neutral'}>{c.due ? 'due' : 'not due'}</Tag><span className="font-medium text-fg">{c.check.name}</span>
      <span className="text-12 text-muted">{c.last ? `last ${shortDate(c.last)}` : 'never'}{!c.due && c.dueOn ? ` · next ${shortDate(c.dueOn)}` : ` · every ${c.check.every_months} months`}</span>
      {c.due && <span className={cn('ms-auto text-12', drafted(c.check.codes) ? 'text-ok' : 'text-faint')}>{drafted(c.check.codes) ? 'ordered above · × leaves it out' : 'no service here does it: /order'}</span>}</li>)}</ul>
    {atRisk && <p className="text-13 text-fg"><span className="text-12 text-faint">Tell {patient.sex === 'female' ? 'her' : 'him'}: </span><span dir="rtl" lang="ar">افحص رجليك كل يوم، وما تمشيش حافي في البيت</span></p>}
  </div>
}
