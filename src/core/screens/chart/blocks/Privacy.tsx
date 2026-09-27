// Private notes in the chart (spec 07; moved from visit/Record.tsx, which keeps its copies until the switch, build plan 3.10): the
// Summary's notice per department, a hidden entry's quiet block, Open anyway inline under it (a reason; Emergency opens at once; the
// department's private notes open for 12 hours and the read is logged), and Make private / Make not private in a block's Details.
// Nothing here is ever over the record. In the /design gallery (sample) nothing is written.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { write } from '../../../db/rpc'
import { newId, oneSet } from '../../../db/entries'
import type { EntryData } from '../../../db/shapes.generated'
import { useOpened } from '../../../hooks/reads'
import { refresh } from '../../../hooks/writes'
import { Button, Card, Chip, Input, errorText } from '../../../ui'
import type { ChartItem } from '../model/items'
import { Shell } from './Shell'
import { placeName, useBlockEnv } from './env'

const REASONS = ['Direct care', 'Emergency', 'Admin', 'Other']
const REASON_CODE: Record<string, EntryData['opened_anyway']['reason']> = { 'Direct care': 'TREAT', Emergency: 'ETREAT', Admin: 'PATADMIN', Other: 'other' }

/** private notes hidden from me, one line per department, on top of the Summary */
export function PrivateNotes({ hidden, patientId }: { hidden: { department_id: string; department: string; items: number }[]; patientId: string }) {
  const [dept, setDept] = useState<string | null>(null)
  if (!hidden.length) return null
  return <Card className="overflow-hidden">
    {hidden.map((h) => <div key={h.department_id} className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 text-13 text-muted"><Lock aria-hidden className="size-3.5 text-faint" />
        <span>{h.items} private {h.items === 1 ? 'note' : 'notes'} from <b className="font-medium text-fg">{h.department}</b></span>
        {dept !== h.department_id && <Button size="xs" variant="outline" className="ms-auto" onClick={() => setDept(h.department_id)}>Open anyway</Button>}</div>
      {dept === h.department_id && <div className="px-3.5 pb-3"><OpenAnyway patientId={patientId} openDepartmentId={h.department_id} onDone={() => setDept(null)} /></div>}
    </div>)}
  </Card>
}

/** a hidden entry: one quiet line (the reader returned no text, author or findings), Open anyway under it; inline, a line of a group */
export function PrivateBlock({ item, time, inline }: { item: ChartItem; time?: string | null; inline?: boolean }) {
  const env = useBlockEnv(); const [open, setOpen] = useState(false)
  const dept = placeName(env, item.entry.department_id)
  const words = <><span className="italic">{item.entry.line || 'Private note'}</span>{dept && <span>· {dept}</span>}</>
  const button = !open && <Button size="xs" variant="ghost" onClick={() => setOpen(true)} aria-expanded={open}>Open anyway</Button>
  const under = open && <OpenAnyway patientId={item.entry.patient_id} openDepartmentId={item.entry.department_id} onDone={() => setOpen(false)} />
  if (inline) return <div id={`entry-${item.entry.id}`} className="grid gap-2 py-1">
    <p className="flex flex-wrap items-center gap-1.5 text-13 text-faint"><Lock aria-hidden className="size-3.5" />{words}<span className="ms-auto">{button}</span></p>{under}</div>
  return <div id={`entry-${item.entry.id}`}>
    <Shell bare time={time} icon={Lock} className="py-2.5" tags={button}>{words}</Shell>
    {under && <div className="px-4 pb-3">{under}</div>}
  </div>
}

/** open anyway, inline: a reason (Emergency opens at once); one department's private notes of this patient open to me for 12 hours,
 *  and the read is logged */
export function OpenAnyway({ patientId, openDepartmentId, onDone }: { patientId: string; openDepartmentId: string; onDone: () => void }) {
  const env = useBlockEnv(); const qc = useQueryClient(); const [reason, setReason] = useState<string | null>(null); const [other, setOther] = useState('')
  const go = useMutation({ mutationFn: async (why: string) => {
      const code = REASON_CODE[reason === 'Other' || !REASON_CODE[why] ? 'Other' : why]
      if (env.sample || !env.departmentId) { env.onSample?.(`open ${placeName(env, openDepartmentId) ?? 'the department'}'s private notes for 12 hours (${why})`); return }
      await write(oneSet([{ id: newId(), type: 'opened_anyway', patient_id: patientId, department_id: env.departmentId,
        data: { department_id: openDepartmentId, reason: code, ...(code === 'other' ? { text: why } : {}) } }]))
      useOpened.getState().open(patientId, why)
    }, onSuccess: () => { refresh(qc); onDone() } })
  const why = reason === 'Other' ? other.trim() : reason
  return <div className="grid gap-2 rounded-lg bg-sunken px-3 py-2.5">
    <p className="text-12 text-muted">They open for you for 12 hours; Emergency opens them at once. Your name, the time and your reason are recorded and reviewed.</p>
    <div role="group" aria-label="Why" className="flex flex-wrap gap-1.5">{REASONS.map((x) =>
      <Chip key={x} on={reason === x} onClick={() => { setReason(x); if (x === 'Emergency') go.mutate('Emergency') }}>{x}</Chip>)}</div>
    {reason === 'Other' && <Input dense autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="A few words" aria-label="Why, in a few words" className="max-w-sm" />}
    {go.error && <p role="alert" className="text-13 text-danger">{errorText(go.error)}</p>}
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      <Button size="sm" onClick={() => why && go.mutate(why)} disabled={!why} loading={go.isPending}>Open</Button></div>
  </div>
}

/** a note's or a result's privacy, for its author and the people of its department: Private, or Not private with a reason (logged);
 *  the server decides who may, as before */
export function NotePrivacy({ entryId, patientId, isPrivate }: { entryId: string; patientId: string; isPrivate: boolean }) {
  const env = useBlockEnv(); const qc = useQueryClient(); const [asking, setAsking] = useState(false); const [reason, setReason] = useState('')
  // not private needs its reason (the shape requires it), so the argument cannot leave it out
  const set = useMutation({ mutationFn: async (a: { is_private: true } | { is_private: false; reason: string }) => {
      if (env.sample || !env.departmentId) { env.onSample?.(a.is_private ? 'make this private' : `make this not private (${a.reason})`); return }
      const at = { id: newId(), patient_id: patientId, department_id: env.departmentId, refers_to: entryId, relation: 'about' as const }
      await write(oneSet([a.is_private ? { ...at, type: 'private', data: {} } : { ...at, type: 'not_private', data: { reason: a.reason } }]))
    }, onSuccess: () => { setAsking(false); setReason(''); refresh(qc) } })
  return <div className="flex flex-wrap items-center gap-2 text-12 text-muted">
    <Lock aria-hidden className="size-3.5 text-faint" />{isPrivate ? 'Private: only its department reads it.' : 'Not private.'}
    {!asking && <Button size="xs" variant="outline" className="ms-auto" loading={set.isPending}
      onClick={() => isPrivate ? setAsking(true) : set.mutate({ is_private: true })}>{isPrivate ? 'Make not private' : 'Make private'}</Button>}
    {asking && <form className="ms-auto flex items-center gap-1.5" onSubmit={(x) => { x.preventDefault(); if (reason.trim()) set.mutate({ is_private: false, reason: reason.trim() }) }}>
      <Input dense autoFocus value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why" aria-label="Why it is not private" className="w-44" />
      <Button size="xs" type="submit" disabled={!reason.trim()} loading={set.isPending}>Save</Button><Button size="xs" type="button" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button></form>}
    {set.error && <span role="alert" className="w-full text-danger">{errorText(set.error)}</span>}
  </div>
}
