// Documents (chart-plan.md §3.2): the files of notes and results, newest first. Read only when the section is opened (it starts
// folded; its body mounts on opening), paged by "Earlier"; a file opens through a short-lived link (fileLink: the server checks the
// reader may see the entry; bytes named but never uploaded say so plainly). A hidden note returns no data, so its files never list.
// Nothing uploads yet, so a patient without them shows the empty line.
import type { Attachment } from '../../../db/shapes.generated'
import { dataOf } from '../../../db/views'
import { useDocuments } from '../../../hooks/chart'
import { Button, Empty, Section, Skeleton, errorText, shortDate } from '../../../ui'
import { Files } from '../blocks/Shell'
import { baseOf } from '../model/items'
import { noteKind, typeLabel } from '../model/labels'
import { personName, placeName, useBlockEnv } from '../blocks/env'
import { Fact } from './parts'
import type { Panel } from './RecordPanel'

export function Documents({ p }: { p: Panel }) {
  return <Section id="chart.documents" variant="compact" title="Documents" start={false} summary="Files of notes and results"><List p={p} /></Section>
}

function List({ p }: { p: Panel }) {
  const env = useBlockEnv(); const types = p.ctx.org?.types
  const q = useDocuments(p.patientId, true)
  const docs = (q.data?.pages ?? []).flatMap((x) => x.docs)
  if (q.isLoading) return <div aria-busy className="py-1.5"><Skeleton lines={2} /></div>
  if (q.error) return <p role="alert" className="py-1.5 text-12 text-danger">{errorText(q.error)}</p>
  return <>
    {!docs.length && !q.hasNextPage && <Empty size="sm">No documents yet: files attached to notes and results are listed here</Empty>}
    <ul className="divide-y divide-line">{docs.map((e) => {
      const what = baseOf(e.type, types) === 'note' ? noteKind(dataOf(e, 'note', types)?.kind) : dataOf(e, 'result', types)?.service?.name ?? typeLabel(e.type, types)
      const by = [personName(env, e.author_id), placeName(env, e.department_id)].filter(Boolean).join(' · ')
      return <li key={e.id} className="py-1.5 text-13">
        <p className="flex flex-wrap items-baseline gap-x-2"><Fact onOpen={() => p.open(e.id)} className="font-medium text-fg">{what}</Fact>
          {by && <span className="text-12 text-faint">{by}</span>}<span className="ms-auto text-12 text-faint tnum">{shortDate(e.occurred_at)}</span></p>
        <Files entryId={e.id} patientId={e.patient_id} files={e.data?.attachments as Attachment[] | undefined} />
      </li> })}</ul>
    {q.hasNextPage && <Button size="xs" variant="ghost" className="mt-1" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Earlier</Button>}
  </>
}
