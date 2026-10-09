// /checks (spec/openCare.md §5.7, Q49; picture #family-folder): what is due for this patient by age and sex — the due ones a service
// here does drafted as orders, each left out with × — and under the card the clinic's list for them, due or met, and what the others in
// the family are due. Worked out from age, sex, the latest values and the coded observations; never ticked by hand.
import { useFacts } from '@core/hooks/chart'
import { useDepartment } from '@core/hooks/organization'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { Tag } from '@core/ui'
import { BMI, checksFor, checksOf, metOf } from './checks'
import { useFileOf } from './data'
import { MemberRow } from './Member'

type Svc = Ctx['services'][number] & { coding?: { system: string; code: string } | null; fields?: { code: string }[] }
const valuesOf = (ctx: Ctx) => (ctx.record?.values ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
/** "/checks": the due checks a service here does, as orders */
export function parseChecks(_rest: string, ctx: Ctx): Result {
  const p = ctx.record?.patient; if (!p) return { error: 'Open a patient first' }
  const st = checksFor(checksOf(ctx.org), { sex: p.sex, born: p.born_on }, metOf(valuesOf(ctx)), ctx.now ?? new Date())
  if (!st.length) return { error: 'No check of the clinic’s list for this age and sex (Settings → Packs → Family medicine)' }
  const items: Parsed[] = st.filter((s) => s.state === 'due').flatMap((s) => {
    const svc = (ctx.services as Svc[]).find((x) => (s.check.order && x.code === s.check.order) || (x.fields ?? []).some((f) => s.check.codes.includes(f.code)))
    return svc ? [{ function: 'order', kind: 'request', action: 'write:order', tag: 'familycare:checks', params: { service_id: svc.id, priority: 'routine' },
      line: `${svc.name} → ${ctx.departments.find((d) => d.id === svc.department_id)?.name ?? ''}`.trim() }] : [] })
  return items.length ? { ok: items } : { error: st.some((s) => s.state === 'due') ? 'What is due here needs no order from this clinic: see the list under the line' : 'Every check is met' }
}

/** under the card: the patient's checks, due or met, and what the family is due */
export function ChecksNote({ ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org, dept } = useDepartment(); const p = ctx.record?.patient
  const facts = useFacts(p?.id ?? null); const file = useFileOf(p?.id ?? null, dept?.id ?? null)
  if (!p) return null
  const values = valuesOf(ctx); const bmi = values.filter((v) => v.code === BMI).sort((a, b) => b.at.localeCompare(a.at))[0]?.value
  const st = checksFor(checksOf(org ?? ctx.org), { sex: p.sex, born: p.born_on }, metOf(values, facts.data ?? []))
  const others = (file.data?.members ?? []).filter((m) => m.patient_id !== p.id)
  return <div className="grid gap-1.5">
    <p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">Due for {p.given_name}</b>
      <span className="text-muted">{p.age}, {p.sex === 'female' ? 'woman' : p.sex === 'male' ? 'man' : p.sex}{bmi ? `, BMI ${bmi}` : ''} · the clinic&apos;s list of checks</span></p>
    <ul className="grid gap-1">{st.map((s, i) => <li key={i} className="flex flex-wrap items-center gap-2 text-13">
      <Tag tone={s.state === 'due' ? 'warn' : 'ok'}>{s.state === 'due' ? 'due' : 'met'}</Tag><span className="font-medium text-fg">{s.check.name}</span>
      <span className="text-12 text-muted">{[s.why, s.check.once ? 'once' : s.check.every_years ? `every ${s.check.every_years === 1 ? 'year' : `${s.check.every_years} years`}` : null, s.last ? `last ${s.last.slice(0, 4)}` : 'never'].filter(Boolean).join(' · ')}</span></li>)}</ul>
    {others.length > 0 && dept && <div className="rounded-lg border border-line bg-surface px-2.5 py-2"><p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">Also due in the family</p>
      <ul className="divide-y divide-line">{others.map((m) => <MemberRow key={m.patient_id} m={m} dept={dept} viewer={file.data?.members.find((x) => x.patient_id === p.id)?.relation} here={false} />)}</ul>
      <p className="text-12 text-faint">Nothing is written in this chart for them; a name opens their chart.</p></div>}
  </div>
}
