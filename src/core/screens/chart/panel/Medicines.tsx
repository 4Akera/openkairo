// Medicines (chart-plan.md §2 #25, from visit/Side.tsx): current ones with the dose line, what for, since when, the instructions and
// where it was sent on stands; Repeat and Send (drafts, in the words of the pack prescriptions go to, visit/send.ts), Change the dose and
// Stop with a reason (the composer's card); the pending markers (→ sent · stopping — reason · → the new dose · repeat) with Undo; the ones
// drafted here; the review toggle;
// + (Alt+M). Reported (what the patient takes from elsewhere: nothing writes these yet, so an empty state) and past ones (stopped,
// completed: when and why) under their own tabs.
import { useMemo, useState } from 'react'
import { Pencil, RotateCw, Send, X } from 'lucide-react'
import { useDepartment } from '../../../hooks/organization'
import { Empty, IconButton, Section, Tabs, Tag, cn } from '../../../ui'
import { sendTarget, sendWordsOf, type SendWords } from '../../visit/send'
import { MED_STATUS, partialWords } from '../model/labels'
import { medicinesOf, problemsOf, type MedRow } from '../model/record'
import { DRAFT, changeMed, pendingWord, stopMed, useListDrafts, type ListDrafts } from './actions'
import { AddButton, DraftRow, Fact, ReviewToggle, RowActions, Undo } from './parts'
import type { Panel } from './RecordPanel'

type TabKey = 'current' | 'reported' | 'past'
/** the dose as Side.tsx wrote it: 500 mg BD, the route when not by mouth, PRN for pain */
const dose = (m: MedRow) => `${m.dose_number ?? ''}${m.dose_unit ? ` ${m.dose_unit}` : ''}${m.route && m.route !== 'oral' ? ` ${m.route}` : ''} ${m.frequency ?? ''}${m.prn ? `${m.frequency !== 'PRN' ? ' PRN' : ''}${m.prn_reason_text ? ` for ${m.prn_reason_text}` : ''}` : ''}`.trim()

export function Medicines({ p }: { p: Panel }) {
  const { org } = useDepartment()
  const m = useMemo(() => medicinesOf(p.rec, p.ctx), [p.rec, p.ctx]); const problems = useMemo(() => problemsOf(p.rec, p.ctx).active, [p.rec, p.ctx])
  const d = useListDrafts(p.patientId); const [tab, setTab] = useState<TabKey>('current')
  // a pack answers prescriptions from here: a medicine can be sent on (a repeat that is sent), e.g. when the patient decides to get it here
  const send = p.writes('write:medication') ? sendTarget(org, p.departmentId)?.words ?? null : null
  const started = d.drafted('medication', 'start')
  const forName = (pid: string | null) => pid ? problems.find((x) => x.id === pid)?.name : undefined
  const rows = tab === 'current' ? m.current : m.reported
  return <Section id="chart.medicines" variant="compact" title="Medicines" count={m.current.length + started.length} summary={m.current.slice(0, 3).map((x) => x.drug_name).join(', ')}
    right={<><ReviewToggle p={p} d={d} list="medications" at={m.review} /><AddButton p={p} line="/rx " keyName="M" action="write:medication" /></>}>
    <Tabs variant="pill" aria-label="Medicines" value={tab} onChange={setTab} className="mb-1"
      tabs={[{ id: 'current', label: 'Current', count: m.current.length }, { id: 'reported', label: 'Reported', count: m.reported.length }, { id: 'past', label: 'Past', count: m.past.length }]} />
    {tab !== 'past' ? <>
      {rows.length === 0 && (tab === 'reported' ? <Empty size="sm">None reported: medicines the patient takes from elsewhere are listed here</Empty>
        : !started.length && <Empty size="sm">No current medicines</Empty>)}
      <ul className="divide-y divide-line">
        {rows.map((x) => <Current key={x.id} p={p} d={d} m={x} forName={forName(x.problem_id)} send={send} />)}
        {tab === 'current' && started.map((s) => <DraftRow key={s.id} onUndo={() => d.remove(s.id)}>{s.line}</DraftRow>)}
      </ul>
    </> : <ul className="divide-y divide-line">
      {m.past.length === 0 && <li><Empty size="sm">No past medicines</Empty></li>}
      {m.past.map((x) => <li key={x.id} className="py-1.5 text-13">
        <p className="flex flex-wrap items-baseline gap-x-1.5"><Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined} className="font-medium text-muted">{x.drug_name}</Fact>
          <span className="text-muted tnum">{dose(x)}</span>
          <span className="ms-auto text-12 text-faint tnum">{MED_STATUS[x.status] ?? x.status}{x.stopped_on && ` ${partialWords({ value: x.stopped_on })}`}</span></p>
        {x.status_reason && <p className="text-12 text-faint">{x.status_reason}</p>}</li>)}
    </ul>}
  </Section>
}

/** a current medicine as Side.tsx drew it, with its pending draft, where it was sent on stands, and its actions on hover */
function Current({ p, d, m, forName, send }: { p: Panel; d: ListDrafts; m: MedRow; forName?: string; send: SendWords | null }) {
  const pend = d.pending('medication', 'medication_id', m.id); const sent = m.sent; const w = sendWordsOf(p.ctx.org, sent?.order.service_id)
  return <li className="group flex items-start gap-2 py-2">
    <div className="min-w-0 flex-1">
      <p className={cn('text-13 font-medium text-fg', pend?.params.action === 'stop' && 'line-through opacity-50')}>
        <Fact onOpen={m.entry_id ? () => p.open(m.entry_id!) : undefined}>{m.drug_name}</Fact> <span className="font-normal text-muted tnum">{dose(m)}</span>
        {m.status === 'on-hold' && <Tag tone="warn" className="ms-1.5">On hold</Tag>}{m.reported && <Tag className="ms-1.5">Reported</Tag>}
        {sent && (sent.open ? <Tag tone="info" className="ms-1.5">{w.open} · {sent.word}</Tag> : sent.order.status === 'completed' && <Tag tone="ok" className="ms-1.5">{w.done}</Tag>)}</p>
      <p className="text-12 text-faint">{forName && <span className="text-accent">for {forName} · </span>}since {partialWords({ value: m.started_on })}{m.instructions_text && ` · ${m.instructions_text}`}
        {pend && <b className="ms-1 font-medium text-accent">{pendingWord(pend, m.drug_name, send ?? w)}</b>}</p>
    </div>
    {p.writes('write:medication') && (pend ? <Undo onClick={() => d.remove(pend.id)} /> : <RowActions>
      <IconButton title="Repeat" aria-label={`Repeat ${m.drug_name}`} onClick={() => d.add(DRAFT.repeat(m))}><RotateCw /></IconButton>
      {send && <IconButton title={send.send} aria-label={`${send.send}: ${m.drug_name}`} onClick={() => d.add(DRAFT.send(m, send))}><Send /></IconButton>}
      <IconButton title="Change the dose" aria-label={`Change the dose of ${m.drug_name}`} onClick={() => { changeMed(m); p.onCompose?.() }}><Pencil /></IconButton>
      <IconButton title="Stop — with a reason" aria-label={`Stop ${m.drug_name}`} tone="danger" onClick={() => { stopMed(m); p.onCompose?.() }}><X /></IconButton></RowActions>)}
  </li>
}
