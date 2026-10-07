// The questions waiting for me about this patient's orders (spec/openCare.md §5.3: the department an order went to asks), each a card above the
// line — who asks, when, about what, and the question — with two answers: Give it anyway (a reviewed entry about the question, its
// note and action, which the asker's list shows at once), or Change: the medicine stopped and its order cancelled with the answer, in
// one set, and the line opened at /rx for the new prescription, which goes through the composer's own checks. Any doctor of the
// department that ordered may answer (the question waits on the department's To review too).
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useDepartment } from '../../../hooks/organization'
import { useWrite } from '../../../hooks/writes'
import { compose } from '../../../hooks/composer'
import { draftEntries, newId, oneSet } from '../../../db/entries'
import type { EntryIn } from '../../../db/rpc'
import type { OrderRow, ReviewRow } from '../../../db/types'
import { nameOf, userName } from '../../../db/views'
import { Button, Callout, Card, Input, errorText, hm } from '../../../ui'
import { useChart } from '../context'
import { isForMe } from '../model/items'

export function Questions() {
  const c = useChart()
  const rv = c.r.server.tables['base.review']
  const qs = (rv?.rows ?? []).filter((r) => r.why === 'question' && isForMe(r, c.me, c.departmentId))
  if (!qs.length) return null
  return <>{qs.map((r) => <Question key={r.item} r={r} />)}</>
}

function Question({ r }: { r: ReviewRow }) {
  const c = useChart(); const { org } = useDepartment(); const w = useWrite(); const [note, setNote] = useState('')
  const e = c.r.server.tables['base.review']?.entries[r.entry_id]
  const o: OrderRow | undefined = c.r.server.tables['base.orders']?.rows.find((x) => x.item === r.order_item)
  const med = o?.about_item ? c.r.medications.find((m) => m.id === o.about_item) : undefined
  const about = med ? `${med.drug_name}${med.dose_number ? ` ${med.dose_number}${med.dose_unit ? ` ${med.dose_unit}` : ''}` : ''}${med.frequency ? ` · ${med.frequency}` : ''}` : o?.service_name ?? 'an order'
  const text = String((e?.data as { text?: string } | undefined)?.text ?? e?.line ?? '')
  const answer = (action: 'give_anyway' | 'changed', words: string, more: EntryIn[] = []) => e && w.mutate(oneSet([...more,
    { id: newId(), type: 'reviewed', patient_id: c.patientId, department_id: c.departmentId, visit_id: null, refers_to: e.id, relation: 'about',
      data: { note: note.trim() ? `${words}: ${note.trim()}` : words, action } }]), { onSuccess: () => { if (action === 'changed') compose({ text: '/rx ' }) } })
  const change = () => {
    if (!o) return
    const stop = med ? draftEntries({ id: newId(), function: 'medication', params: { action: 'stop', medication_id: med.id, stop_reason_text: 'changed after a question about it' } },
      { patientId: c.patientId, departmentId: c.departmentId, record: c.r, org }) : []
    const cancel: EntryIn = { id: newId(), type: 'order', patient_id: c.patientId, department_id: c.departmentId, visit_id: null, refers_to: o.latest_entry, relation: 'changes',
      data: { service: { ...(o.service_id ? { id: o.service_id } : {}), ...(o.service_code ? { code: o.service_code } : {}), name: o.service_name ?? 'Order' },
        ...(o.to_department_id ? { department_id: o.to_department_id } : {}), priority: o.priority, status: 'revoked', reason: 'changed after a question about it' } as never }
    answer('changed', `Changed: ${med?.drug_name ?? o.service_name ?? 'the order'} stopped, a new prescription follows`, [...stop, cancel])
  }
  const asker = nameOf(org, e?.department_id) ?? 'A department'
  return <Card className="grid gap-2 p-4 ring-1 ring-warn">
    <p className="flex flex-wrap items-center gap-2 text-13"><MessageSquare aria-hidden className="size-4 text-warn" /><b className="font-semibold text-fg">{asker} asks</b>
      <span className="text-muted">{userName(org, e?.author_id) ?? ''}{e ? ` · ${hm(e.recorded_at)}` : ''} · about {about}</span></p>
    <p className="text-14 text-fg">{text}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Input value={note} onChange={(x) => setNote(x.target.value)} placeholder="Your answer, if you want to add one" className="w-full max-w-sm" />
      <Button size="sm" onClick={change} loading={w.isPending} disabled={!o}>Change</Button>
      <Button size="sm" variant="ghost" onClick={() => answer('give_anyway', 'Give it anyway')} disabled={w.isPending}>Give it anyway</Button>
    </div>
    <p className="text-12 text-faint">Change stops {med?.drug_name ?? 'it'}, cancels the order and opens /rx for the new line; the answer reaches {asker} at once.</p>
    {w.error && <Callout tone="danger" title="Not answered">{errorText(w.error)}</Callout>}
  </Card>
}
