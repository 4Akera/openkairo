// Problems (chart-plan.md §2 #24, from visit/Side.tsx): active ones with suspected, the ICD-10 code, since when, the note and the
// medicines for each; Update (the composer's card), Resolve (a draft), Undo; the new ones drafted here; the review toggle; + (Alt+P).
// Past ones (resolved, inactive, in remission) under their own tab with when; the encounter diagnoses (base.lists' own list) under
// the active ones, so no row is dropped.
import { useMemo, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Badge, Empty, IconButton, Section, Tabs, cn } from '../../../ui'
import { partialWords, sinceWords } from '../model/labels'
import { medicinesOf, problemsOf, type ProblemRow } from '../model/record'
import { DRAFT, updateProblem, useListDrafts, type ListDrafts } from './actions'
import { AddButton, DraftRow, Fact, ReviewToggle, RowActions, Sub, Undo } from './parts'
import type { Panel } from './RecordPanel'

const code = (c: string | null) => c?.startsWith('icd10:') ? c.slice(6) : null

export function Problems({ p }: { p: Panel }) {
  const m = useMemo(() => problemsOf(p.rec, p.ctx), [p.rec, p.ctx]); const meds = useMemo(() => medicinesOf(p.rec, p.ctx).current, [p.rec, p.ctx])
  const d = useListDrafts(p.patientId); const [tab, setTab] = useState<'active' | 'past'>('active')
  const added = d.drafted('problem', 'add')
  // the medicines for a problem: its current ones, and the ones drafted for it
  const medsFor = (pid: string) => [...meds.filter((x) => x.problem_id === pid).map((x) => x.drug_name),
    ...d.drafted('medication', 'start').filter((x) => (x.params.problems as { id: string }[] | undefined)?.[0]?.id === pid).map((x) => String((x.params.drug as { name: string }).name))]
  return <Section id="chart.problems" variant="compact" title="Problems" count={m.active.length + added.length} summary={m.active.slice(0, 3).map((x) => x.name).join(', ')}
    right={<><ReviewToggle p={p} d={d} list="problems" at={m.review} /><AddButton p={p} line="/dx " keyName="P" action="write:problem" /></>}>
    <Tabs variant="pill" aria-label="Problems" value={tab} onChange={setTab} className="mb-1"
      tabs={[{ id: 'active', label: 'Active', count: m.active.length }, { id: 'past', label: 'Past', count: m.past.length }]} />
    {tab === 'active' ? <>
      {m.active.length + added.length === 0 && <Empty size="sm">No active problems</Empty>}
      <ul className="divide-y divide-line">
        {m.active.map((x) => <Active key={x.id} p={p} d={d} x={x} meds={medsFor(x.id)} />)}
        {added.map((a) => <DraftRow key={a.id} onUndo={() => d.remove(a.id)}>{String(a.params.name)}{a.params.certainty === 'suspected' && <Badge tone="warn" className="ms-1.5">suspected</Badge>}
          {(a.params.onset_on || a.params.text) ? <span className="block text-12 font-normal text-faint">{a.params.onset_on ? `since ${a.params.onset_on}` : ''}{a.params.onset_on && a.params.text ? ' — ' : ''}{String(a.params.text ?? '')}</span> : null}
          {medsFor(a.id).length > 0 && <span className="block text-12 font-normal text-accent">℞ {medsFor(a.id).join(', ')}</span>}</DraftRow>)}
      </ul>
      {m.diagnoses.length > 0 && <>
        <Sub>Diagnoses at visits</Sub>
        <ul className="divide-y divide-line">{m.diagnoses.map((x) => <li key={x.id} className="flex flex-wrap items-baseline gap-x-1.5 py-1.5 text-13">
          <Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined} className="font-medium text-fg">{x.name}</Fact>
          {code(x.code) && <span className="font-mono text-11 text-faint">{code(x.code)}</span>}
          <span className="ms-auto text-12 text-faint tnum">{partialWords({ value: x.listed_on })}</span></li>)}</ul>
      </>}
    </> : <ul className="divide-y divide-line">
      {m.past.length === 0 && <li><Empty size="sm">No past problems</Empty></li>}
      {m.past.map((x) => <li key={x.id} className="flex flex-wrap items-baseline gap-x-1.5 py-1.5 text-13">
        <Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined} className="font-medium text-muted">{x.name}</Fact>
        {code(x.code) && <span className="font-mono text-11 text-faint">{code(x.code)}</span>}
        <span className="ms-auto text-12 text-faint tnum">{x.status_word}{x.resolved_on && ` ${partialWords({ value: x.resolved_on })}`}</span></li>)}
    </ul>}
  </Section>
}

/** an active problem as Side.tsx drew it, with its pending draft (resolving: struck; updating) and its actions on hover */
function Active({ p, d, x, meds }: { p: Panel; d: ListDrafts; x: ProblemRow; meds: string[] }) {
  const res = d.pending('problem', 'problem_id', x.id); const resolving = res?.params.action === 'resolve'
  return <li className={cn('group py-2', resolving && 'opacity-50')}>
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className={cn('text-13 font-medium leading-snug text-fg', resolving && 'line-through')}>
          <Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined}>{x.name}</Fact>{x.certainty === 'suspected' && <Badge tone="warn" className="ms-1.5 align-middle">suspected</Badge>}
          {code(x.code) && <span className="ms-1.5 font-mono text-11 font-normal text-faint">{code(x.code)}</span>}
          {res?.params.action === 'update' && <b className="ms-1.5 text-12 font-medium text-accent">updating</b>}</p>
        {(x.onset_on || x.note_text) && <p className="mt-0.5 text-12 text-faint">{x.onset_on && <span className="tnum">since {partialWords({ value: x.onset_on })} · {sinceWords(x.onset_on)}</span>}
          {x.onset_on && x.note_text && ' — '}{x.note_text}</p>}
        {meds.length > 0 && <p className="mt-0.5 text-12 text-accent">℞ {meds.join(', ')}</p>}
      </div>
      {p.writes('write:problem') && (res ? <Undo onClick={() => d.remove(res.id)} /> : <RowActions>
        <IconButton title="Update — certainty, since, note" aria-label={`Update ${x.name}`} onClick={() => { updateProblem(x); p.onCompose?.() }}><Pencil /></IconButton>
        <IconButton title="Resolve" aria-label={`Resolve ${x.name}`} onClick={() => d.add(DRAFT.resolve(x))}><Check /></IconButton></RowActions>)}
    </div>
  </li>
}
