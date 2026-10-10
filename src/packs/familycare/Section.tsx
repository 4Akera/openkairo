// The family pack's two sections (spec/openCare.md §5.1 rule 2; picture #family-folder): Family — the file (its number, address, phone)
// and each member with what they are due, a name opening that member's chart; Checks — this patient's checks by age and sex, each met by
// a base entry with one of its codes or due.
import { useMemo } from 'react'
import type { SectionBody, SectionInput } from '@core/screens/chart/sections'
import { packRowOf } from '@core/screens/rows'
import { usePackRows } from '@core/screens/useRows'
import { Empty, shortDate } from '@core/ui'
import { checksFor, checksOf, metOf, type CheckState } from './checks'
import { useFileOf, type File } from './data'
import { MemberRow } from './Member'

/** the files this tab has read, by patient: the chip's count follows once the section has read the file */
const seen = new Map<string, File | null>()
export const fileSeen = (patientId: string) => seen.get(patientId)

export function FamilySection({ p }: SectionBody) {
  const f = useFileOf(p.patientId, p.departmentId)
  if (f.data !== undefined) seen.set(p.patientId, f.data)
  const dept = p.ctx.org?.departments.find((d) => d.id === p.departmentId)
  // each other member as a patient card's row: the packs this department uses may put their button on it (core change (i) of §5.7 —
  // Book where the department keeps a diary, its booking card folded out under the member; nothing is written in this chart)
  const rows = useMemo(() => (f.data?.members ?? []).filter((m) => m.patient_id !== p.patientId)
    .map((m) => packRowOf(`member ${m.patient_id}`, { patient_id: m.patient_id, visit_id: null, orders: [] })), [f.data, p.patientId])
  const packs = usePackRows('card', rows, dept)
  if (f.isLoading) return <Empty size="sm">Reading the family file…</Empty>
  if (f.error) return <p className="text-13 text-danger">{String((f.error as Error).message)}</p>
  if (!f.data) return <Empty size="sm">No family file yet: the desk joins one or starts one</Empty>
  const me = f.data.members.find((m) => m.patient_id === p.patientId)
  return <div className="grid gap-1 text-13">
    <p className="flex flex-wrap items-baseline gap-2"><span className="text-muted">{[f.data.address, f.data.phone].filter(Boolean).join(' · ')}</span><span className="ms-auto text-12 text-faint">file {f.data.number}</span></p>
    <ul className="divide-y divide-line">{dept && f.data.members.map((m) => { const r = rows.find((x) => x.patient_id === m.patient_id)
      return <MemberRow key={m.patient_id} m={m} dept={dept} viewer={me?.relation} here={m.patient_id === p.patientId} actions={r && packs.buttons(r)} below={r && packs.below(r)} /> })}</ul>
    <p className="text-12 text-faint">A name opens that member&apos;s chart. What each is due comes from the packs this department uses.</p>
  </div>
}

/** this patient's checks, from the one record read and the facts page */
export function checkStates(x: Pick<SectionInput, 'rec' | 'ctx' | 'identity' | 'facts'>): CheckState[] {
  const values = (x.rec.tables['base.values']?.rows ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
  return checksFor(checksOf(x.ctx.org), { sex: x.identity.gender, born: x.identity.birth_date }, metOf(values, x.facts))
}
export function ChecksSection({ p }: SectionBody) {
  const st = checkStates({ rec: p.rec, ctx: p.ctx, identity: p.r.identity, facts: p.facts })
  if (!st.length) return <Empty size="sm">No check of the clinic&apos;s list for this age and sex</Empty>
  return <ul className="grid gap-1 text-13">{st.map((s, i) => <li key={i} className="grid grid-cols-[7rem_1fr] gap-2">
    <span className="text-muted">{s.check.name}</span>
    <span className={s.state === 'due' ? 'text-warn' : 'text-ok'}>{s.last ? `${shortDate(s.last)}` : 'never done'}{s.why && s.state === 'due' ? ` · ${s.why}` : ''} · {s.state === 'due' ? 'due' : s.check.once ? 'once, done' : 'met'}</span></li>)}</ul>
}
