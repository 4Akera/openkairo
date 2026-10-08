// The drafts, drawn as the blocks they will be (chart-plan.md §2 #28, moved from the composer's draft list): the composer's own
// draftEntries builds each with the exact type and data Done or Sign will write, in the draft look (dashed, Not signed); edit opens it
// in the composer's card (a long note in the long note), remove takes it back. A prescription is checked again against allergies
// recorded since it was drafted.
import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import { compose, useComposer } from '../../../hooks/composer'
import { useDrafts, useDraftsFor } from '../../../hooks/drafts'
import { useDepartment } from '../../../hooks/organization'
import type { Draft } from '../../../db/entries'
import type { Allergy } from '../../../db/types'
import { Tag } from '../../../ui'
import { drugWarnings } from '../../visit/catalog'
import { cardLineDefs, cardLinesOf } from '../../visit/lines'
import { DraftLine } from '../../visit/CardLines'
import { SetCard } from '../blocks'
import { BlockContext, useBlockEnv } from '../blocks/env'
import { useChart } from '../context'
import { bySet } from '../model/encounter'
import { draftItems } from '../model/items'
import { useItemCtx } from './itemCtx'

type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** where the drafts go: Done in my clinic visit, Sign in a stay, Sign N elsewhere (outside any visit) */
const SIGNS = { done: 'Done signs them', stay: 'Sign writes them into the stay', other: 'Sign writes them' }

export function DraftBlocks() {
  const c = useChart(); const { org } = useDepartment(); const drafts = useDraftsFor(c.patientId); const ctx = useItemCtx(); const env = useBlockEnv()
  const withVisit = c.role.consult || c.role.admitted
  const set = useMemo(() => drafts.length ? bySet(draftItems(drafts, { patientId: c.patientId, departmentId: c.departmentId, visitId: withVisit ? c.encounter?.id : null, record: c.r, org },
    { ...ctx, me: c.me }), [], org?.types)[0] ?? null : null, [drafts, c.patientId, c.departmentId, withVisit, c.encounter, c.r, org, ctx, c.me])
  // what the allergy list holds once these drafts are signed: a drafted prescription is checked against it again
  const clashes = useMemo(() => {
    const allergies: Pick<Allergy, 'substance_name' | 'class_code'>[] = [...c.r.allergies.filter((a) => a.status === 'active' && !drafts.some((d) => d.function === 'allergy' && d.params.action === 'refute' && d.params.allergy_id === a.id)),
      ...drafts.filter((d) => d.function === 'allergy' && d.params.action === 'add').map((d) => ({ substance_name: (d.params as Q).substance?.name, class_code: (d.params as Q).substance?.class_code ?? null }))]
    return drafts.flatMap((d) => { const q = d.params as Q
      const w = d.function === 'medication' && q.action !== 'stop' && q.drug?.name ? drugWarnings(q.drug.name, allergies as Allergy[], [], null).find((x) => x.level === 'block') : undefined
      return w ? [{ id: d.id, text: w.text }] : [] })
  }, [drafts, c.r.allergies])
  const edit = (d: Draft) => {
    if (d.function === 'note' && String(d.params.text ?? '').length > 120) { useComposer.getState().openLongNote({ kind: String(d.params.kind ?? 'progress'), text: String(d.params.text ?? ''), draftId: d.id }); return }
    compose({ seed: { label: 'Edit', items: [{ function: d.function, params: d.params, line: d.line ?? '', kind: d.kind ?? 'note', tag: d.tag }], draftId: d.id } })
  }
  // the packs' short words after a draft's line, as under its card (core change C1)
  const draftEnv = useMemo(() => {
    const packs = org?.departments.find((x) => x.id === c.departmentId)?.packs ?? []
    const record = { patient: c.r.patient, values: c.r.values, medications: c.r.medications, allergies: c.r.allergies, allergy_review: c.r.allergy_review }
    const draftLine = (d: Draft) => <DraftLine lines={cardLinesOf(cardLineDefs(), d.function, d.params, { departmentId: c.departmentId, packs, org, now: new Date(), record })} />
    return { ...env, onEdit: edit, onRemove: (d: Draft) => useDrafts.getState().remove(c.patientId, d.id), draftLine }
  }, [env, c.patientId, c.departmentId, c.r, org])
  if (!set) return null
  const signs = c.role.consult ? SIGNS.done : c.role.admitted ? SIGNS.stay : SIGNS.other
  return <BlockContext.Provider value={draftEnv}>
    <section aria-label="Not signed yet" className="grid gap-2">
      <SetCard set={set} head={<div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken px-4 py-2 text-12 text-faint">
        <Tag tone="accent">Not signed yet</Tag><span>{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} · {signs}</span></div>} />
      {clashes.length > 0 && <ul className="grid gap-1">{clashes.map((x) => <li key={x.id} role="alert" className="flex items-start gap-1.5 text-13 text-danger">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />{x.text}</li>)}</ul>}
    </section>
  </BlockContext.Provider>
}
