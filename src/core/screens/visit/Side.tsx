import type { ReactNode } from 'react'
import { Plus, Check, X, RotateCw, Pencil, Send } from 'lucide-react'
import { useDrafts, useDraftsFor, type NewDraft } from '../../hooks/drafts'
import { compose } from '../../hooks/composer'
import { useDepartment } from '../../hooks/organization'
import { canSendPrescriptions } from './send'
import type { RecordView, ListReview, Medication, Problem } from '../../db/types'
import { Badge, Button, Card, Heading, IconButton, cn, ymd } from '../../ui'
import { classOfAllergy } from './catalog'
import { lineOf, type Parsed } from './parse'
import { KeyResults } from './KeyResults'

/** how long ago a partial date was: "7 y" · "4 mo" */
function since(on: string | null | undefined) {
  if (!on) return null
  const [y, m = 1] = on.split('-').map(Number); const n = new Date(); const months = (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m)
  return months >= 24 ? `${Math.floor(months / 12)} y` : months >= 1 ? `${months} mo` : 'this month'
}

const seed = (label: string, p: Omit<Parsed, 'line'>) => compose({ seed: { label, items: [{ ...p, line: lineOf({ ...p, line: '' }) }] } })
/** open the composer on a medication: a new dose, or stopping it with a reason */
const changeMed = (m: Medication) => seed(`Change ${m.drug_name}`, { function: 'medication', kind: 'prescription', params: { action: 'change', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name },
  dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency, prn: m.prn, prn_reason_text: m.prn_reason_text ?? null, instructions_text: m.instructions_text ?? null } })
const stopMed = (m: Medication) => seed(`Stop ${m.drug_name}`, { function: 'medication', kind: 'prescription', params: { action: 'stop', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, stop_reason_text: null } })
const updateProblem = (p: Problem) => seed(`Update ${p.name}`, { function: 'problem', kind: 'problem', params: { action: 'update', problem_id: p.id, name: p.name, status: 'active', certainty: p.certainty, onset_on: p.onset_on, text: p.note_text } })

/** The record's lists beside the visit (spec 05): problems, then medications, then allergies. Adding and changing go through the composer. */
export function Side({ r, patientId, departmentId, can }: { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }) {
  const drafts = useDraftsFor(patientId)
  const { org } = useDepartment()
  // a pharmacy answers prescriptions here: a medicine can be sent to it (a repeat that is sent), e.g. when the patient decides to get it here
  const canSend = canSendPrescriptions(org, departmentId) && can('write:medication')
  const add = (d: NewDraft) => useDrafts.getState().add(patientId, d)
  const remove = (id: string) => useDrafts.getState().remove(patientId, id)
  const drafted = (fn: string, action: string) => drafts.filter((d) => d.function === fn && d.params.action === action)
  const pending = (fn: string, key: string, id: string) => drafts.find((d) => d.function === fn && d.params[key] === id)
  const newProblems = drafted('problem', 'add')
  const medsFor = (pid: string) => [...r.medications.filter((m) => m.problem_id === pid).map((m) => m.drug_name),
    ...drafted('medication', 'start').filter((d) => (d.params.problems as { id: string }[] | undefined)?.[0]?.id === pid).map((d) => String((d.params.drug as { name: string }).name))]
  const review = (list: 'problems' | 'medications' | 'allergies', at: ListReview | null) => {
    if (!can('write:list_review')) return null
    const d = drafts.find((x) => x.function === 'list_review' && x.params.list === list)
    return <button title="Mark this list reviewed today" onClick={() => d ? remove(d.id) : add({ function: 'list_review', params: { list, outcome: 'reviewed' }, line: `${list} reviewed`, kind: 'review' })}
      className={cn('text-[10.5px]', d ? 'font-medium text-teal-700' : at ? 'text-neutral-400 hover:text-neutral-700' : 'text-amber-700 hover:text-amber-900')}>
      {d ? '✓ reviewed now' : at ? `✓ ${ymd(at.reviewed_at)}` : 'not reviewed'}</button>
  }
  const plus = (line: string, key: string, action: string) => can(action) && <IconButton title={`Add (Alt+${key})`} onClick={() => compose({ text: line })}><Plus className="h-3.5 w-3.5" /></IconButton>
  const activeAllergies = r.allergies.filter((a) => a.status === 'active')
  const nka = drafts.find((d) => d.function === 'list_review' && d.params.list === 'allergies' && d.params.outcome === 'none_known')

  return <aside className="grid content-start gap-3">
    <Section title="Problems" count={r.problems.length + newProblems.length} right={<>{review('problems', r.problem_review)}{plus('/dx ', 'P', 'write:problem')}</>}>
      {r.problems.length + newProblems.length === 0 && <Empty>No problems recorded</Empty>}
      <ul className="divide-y divide-neutral-100">
        {r.problems.map((p) => { const res = pending('problem', 'problem_id', p.id); const meds = medsFor(p.id); return <li key={p.id} className={cn('group py-2', res?.params.action === 'resolve' && 'opacity-50')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className={cn('text-[13.5px] font-medium leading-snug text-neutral-900', res?.params.action === 'resolve' && 'line-through')}>{p.name}{p.certainty === 'suspected' && <Badge tone="amber" className="ml-1.5 align-middle">suspected</Badge>}
                {p.code?.startsWith('icd10:') && <span className="ml-1.5 font-mono text-[10.5px] font-normal text-neutral-400">{p.code.slice(6)}</span>}{res?.params.action === 'update' && <b className="ml-1.5 text-xs font-medium text-teal-700">updating</b>}</p>
              {(p.onset_on || p.note_text) && <p className="mt-0.5 text-xs text-neutral-500">{p.onset_on && <span className="tnum">since {p.onset_on} · {since(p.onset_on)}</span>}{p.onset_on && p.note_text && ' — '}{p.note_text}</p>}
              {meds.length > 0 && <p className="mt-0.5 text-xs text-teal-800">℞ {meds.join(', ')}</p>}
            </div>
            {can('write:problem') && (res ? <IconButton title="Undo" onClick={() => remove(res.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton title="Update — certainty, since, note" onClick={() => updateProblem(p)}><Pencil className="h-3.5 w-3.5" /></IconButton>
              <IconButton title="Resolve" onClick={() => add({ function: 'problem', params: { action: 'resolve', problem_id: p.id, name: p.name }, line: `Resolved: ${p.name}`, kind: 'problem' })}><Check className="h-3.5 w-3.5" /></IconButton></span>)}
          </div></li> })}
        {newProblems.map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{String(d.params.name)}{d.params.certainty === 'suspected' && <Badge tone="amber" className="ml-1.5">suspected</Badge>}
          {(d.params.onset_on || d.params.text) ? <span className="block text-xs font-normal text-neutral-500">{d.params.onset_on ? `since ${d.params.onset_on}` : ''}{d.params.onset_on && d.params.text ? ' — ' : ''}{String(d.params.text ?? '')}</span> : null}
          {medsFor(d.id).length > 0 && <span className="block text-xs font-normal text-teal-800">℞ {medsFor(d.id).join(', ')}</span>}</DraftRow>)}
      </ul>
    </Section>

    <Section title="Medications" count={r.medications.length + drafted('medication', 'start').length} right={<>{review('medications', r.medication_review)}{plus('/rx ', 'M', 'write:medication')}</>}>
      {r.medications.length + drafted('medication', 'start').length === 0 && <Empty>No active medications</Empty>}
      <ul className="divide-y divide-neutral-100">
        {r.medications.map((m) => { const p = pending('medication', 'medication_id', m.id); const forP = r.problems.find((x) => x.id === m.problem_id); return <li key={m.id} className="group flex items-start gap-2 py-2">
          <div className="min-w-0 flex-1">
            <p className={cn('text-[13.5px] font-medium text-neutral-900', p?.params.action === 'stop' && 'line-through opacity-50')}>{m.drug_name} <span className="font-normal text-neutral-600 tnum">{m.dose_number}{m.dose_unit ? ` ${m.dose_unit}` : ''}{m.route && m.route !== 'oral' ? ` ${m.route}` : ''} {m.frequency}{m.prn ? `${m.frequency !== 'PRN' ? ' PRN' : ''}${m.prn_reason_text ? ` for ${m.prn_reason_text}` : ''}` : ''}</span></p>
            <p className="text-xs text-neutral-500">{forP && <span className="text-teal-800">for {forP.name} · </span>}since {m.started_on}{m.instructions_text && ` · ${m.instructions_text}`}{p && <b className="ml-1 font-medium text-teal-700">{p.params.send ? '→ pharmacy' : p.params.action === 'stop' ? `stopping${p.params.stop_reason_text ? ` — ${String(p.params.stop_reason_text).toLowerCase()}` : ''}` : p.params.action === 'change' ? `→ ${p.line.replace(m.drug_name, '').replace(/^Change:\s*/, '').trim()}` : 'repeat'}</b>}</p>
          </div>
          {can('write:medication') && (p ? <IconButton title="Undo" onClick={() => remove(p.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconButton title="Repeat" onClick={() => add({ function: 'medication', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency }, line: `Repeat ${m.drug_name}`, kind: 'prescription' })}><RotateCw className="h-3.5 w-3.5" /></IconButton>
            {canSend && <IconButton title="Send to the pharmacy" onClick={() => add({ function: 'medication', kind: 'prescription', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency, send: true }, line: `Send ${m.drug_name} → pharmacy` })}><Send className="h-3.5 w-3.5" /></IconButton>}
            <IconButton title="Change the dose" onClick={() => changeMed(m)}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton title="Stop — with a reason" className="hover:text-red-700" onClick={() => stopMed(m)}><X className="h-3.5 w-3.5" /></IconButton></span>)}
        </li> })}
        {drafted('medication', 'start').map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{d.line}</DraftRow>)}
      </ul>
    </Section>

    <Section title="Allergies" count={activeAllergies.length + drafted('allergy', 'add').length} right={<>{review('allergies', r.allergy_review)}{plus('/al ', 'A', 'write:allergy')}</>}>
      {activeAllergies.length + drafted('allergy', 'add').length === 0 && (r.allergy_review && !nka
        ? <Empty>No known allergies · checked {ymd(r.allergy_review.reviewed_at)}</Empty>
        : <div className="flex items-center gap-2 py-1.5 text-xs"><span className={nka ? 'font-medium text-teal-800' : 'text-amber-700'}>{nka ? 'No known allergies — signed on Done' : 'Not asked yet'}</span>
            {can('write:list_review') && (nka ? <IconButton title="Undo" onClick={() => remove(nka.id)}><X className="h-3.5 w-3.5" /></IconButton>
              : <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-xs" onClick={() => add({ function: 'list_review', kind: 'review', params: { list: 'allergies', outcome: 'none_known' }, line: 'No known allergies' })}>No known allergies</Button>)}</div>)}
      <ul className="divide-y divide-neutral-100">
        {activeAllergies.map((a) => { const p = pending('allergy', 'allergy_id', a.id); return <li key={a.id} className="group flex items-start gap-2 py-2">
          <div className={cn('min-w-0 flex-1', p && 'line-through opacity-50')}>
            <p className="text-[13.5px] font-medium text-red-800">{a.substance_name}{a.kind === 'intolerance' && <Badge className="ml-1.5">intolerance</Badge>}{a.severity && <Badge tone={a.severity === 'severe' ? 'red' : 'amber'} className="ml-1.5">{a.severity}</Badge>}</p>
            {(a.reactions_text || classOfAllergy(a)) && <p className="text-xs text-neutral-500">{a.reactions_text}{a.reactions_text && classOfAllergy(a) && ' · '}{classOfAllergy(a) && <span className="text-neutral-400">{classOfAllergy(a)!.replace(/_/g, ' ')} class</span>}</p>}
          </div>
          {can('write:allergy') && (p ? <IconButton title="Undo" onClick={() => remove(p.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><IconButton title="Not an allergy (refute)" className="hover:text-red-700" onClick={() => add({ function: 'allergy', params: { action: 'refute', allergy_id: a.id, substance: { name: a.substance_name } }, line: `Refuted: ${a.substance_name}`, kind: 'allergy' })}><X className="h-3.5 w-3.5" /></IconButton></span>)}
        </li> })}
        {drafted('allergy', 'add').map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{d.line.replace(/^(Allergy|Intolerance): /, '')}</DraftRow>)}
      </ul>
    </Section>

    <KeyResults patientId={patientId} />
    {/* open requests live in the record's Needs attention, not here */}
  </aside>
}

function Section({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  return <Card className="px-3.5 py-3"><Heading count={count} right={right} className="mb-1">{title}</Heading>{children}</Card>
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-1.5 text-xs text-neutral-400">{children}</p>
function DraftRow({ children, onUndo }: { children: ReactNode; onUndo: () => void }) {
  return <li className="flex items-start gap-2 py-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" title="new, signed on Done" /><span className="min-w-0 flex-1 text-[13.5px] font-medium text-teal-900">{children}</span><IconButton title="Remove" onClick={onUndo}><X className="h-3.5 w-3.5" /></IconButton></li>
}
