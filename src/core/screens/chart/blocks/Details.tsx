// A block's Details (chart-plan.md §1.3; the entry drawer of Record.tsx, now under the block and never over it): who wrote it and
// where, the clinical and the signed time, every version, an order's steps and answers, who reviewed it, the warnings signed anyway,
// and privacy for notes and results. It reads the item once, when opened; the gallery and a draft show what the item holds.
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { ServerEntry } from '../../../db/types'
import { card } from '../../../db/views'
import { useItem } from '../../../hooks/chart'
import { rendererFor } from '../../../renderers'
import { Button, KV, Kbd, Skeleton, cn, dateTime, errorText, longDate, ymd } from '../../../ui'
import { baseOf, type ChartItem } from '../model/items'
import { CROSSED_REASON, partialWords, stepWord } from '../model/labels'
import { NotePrivacy } from './Privacy'
import { personName, placeName, useBlockEnv, when, type BlockEnv } from './env'

/** when it happened, at the precision it was written with */
const clinical = (e: ServerEntry) => e.precision === 'day' ? longDate(e.occurred_at) : e.precision === 'month' || e.precision === 'year'
  ? partialWords({ value: ymd(e.occurred_at), precision: e.precision }) : dateTime(e.occurred_at)
const PRIVACY = new Set(['note', 'result'])

export function Details({ item, onClose, inset }: { item: ChartItem; onClose: () => void; inset?: boolean }) {
  const env = useBlockEnv(); const local = !!env.sample || !!item.draft
  const q = useItem(local ? null : item.entry.id, item.entry.patient_id)
  // what the item holds (every version of an order's steps comes through base.orders; the item read has only the steps that refer to
  // the order itself) joined with the read
  const held = [...item.versions, item.entry, ...item.later, ...(item.order ? [...item.order.steps, ...item.order.answers] : [])]
  const all = local ? held : q.data && [...new Map([...held, ...q.data].map((e) => [e.id, e])).values()]
  return <div role="region" aria-label="Details" className={cn('grid gap-2 bg-sunken text-13', inset ? 'mt-2 rounded-lg p-3' : 'border-t border-line px-4 py-3 sm:ps-[4.75rem]')}>
    <div className="flex items-center gap-2"><p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">Details</p>
      <Button size="xs" variant="ghost" className="ms-auto" onClick={onClose}>Close <Kbd>esc</Kbd><X aria-hidden /></Button></div>
    {item.draft ? <KV dense items={[['Not signed', 'Written with the others when you sign'], ['As typed', item.draft.line || '—']]} />
      : !all ? (q.error ? <p role="alert" className="text-danger">{errorText(q.error)}</p> : <Skeleton lines={3} />)
      : <Facts item={item} all={all} env={env} />}
  </div>
}

function Facts({ item, all, env }: { item: ChartItem; all: ServerEntry[]; env: BlockEnv }) {
  const types = env.org?.types; const base = (e: ServerEntry) => baseOf(e.type, types)
  const versions = all.filter((e) => e.item === item.item).sort((a, b) => a.item_version - b.item_version)
  const related = all.filter((e) => e.item !== item.item).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const steps = related.filter((e) => base(e) === 'step'); const answers = related.filter((e) => e.relation === 'answers' && base(e) !== 'step')
  const reviews = related.filter((e) => base(e) === 'reviewed')
  const marks = related.filter((e) => base(e) === 'private' || base(e) === 'not_private'); const isPrivate = marks.at(-1) ? base(marks.at(-1)!) === 'private' : false
  const e = item.entry; const findings = (e.findings ?? []).filter((f) => f.confirmed || f.level === 'warn')
  const by = (x: ServerEntry) => [personName(env, x.author_id), placeName(env, x.department_id)].filter(Boolean).join(' · ') || '—'
  const rows: [string, ReactNode][] = [['Written by', by(e)], ['When', clinical(e)]]
  if (dateTime(e.recorded_at) !== dateTime(e.occurred_at)) rows.push(['Signed', dateTime(e.recorded_at)])
  if (versions.length > 1 || item.crossed) rows.push(['Versions', <ol className="grid gap-0.5">
    {versions.map((v) => <li key={v.id} className={cn('tnum', v.id !== e.id && 'text-muted')}>
      <span className="text-faint">v{v.item_version} · {when(v.recorded_at)} · {personName(env, v.author_id) ?? '—'} · </span>
      {base(v) === 'crossed_out' ? `Crossed out · ${CROSSED_REASON[String(v.data?.reason)] ?? 'other'}` : <span className={cn(v.id !== e.id && 'line-through')}>{v.line}</span>}
      {v.id === e.id && <span className="text-faint"> · shown</span>}</li>)}
    {item.crossed && !versions.some((v) => base(v) === 'crossed_out') && <li className="text-muted">Crossed out · {CROSSED_REASON[item.crossed.reason] ?? item.crossed.reason} · {when(item.crossed.at)}</li>}
  </ol>])
  if (steps.length) rows.push(['Steps', <ol className="grid gap-1">{steps.map((s) => { const F = rendererFor(s.type)?.Full
    return <li key={s.id}><span className="tnum text-faint">{when(s.recorded_at)} · </span>{stepWord(String(s.data?.step ?? s.data?.status ?? ''))}{s.data?.reason ? ` · ${String(s.data.reason)}` : ''}
      <span className="text-faint"> · {by(s)}</span>{F && !s.hidden && <div className="mt-1"><F card={card(s, env.org)} data={s.data ?? {}} /></div>}</li> })}</ol>])
  if (answers.length) rows.push(['Answers', <ul className="grid gap-0.5">{answers.map((a) => <li key={a.id}>
    {env.onOpen ? <button type="button" onClick={() => env.onOpen!(a.id)} className="rounded-sm text-start text-accent hover:underline focus-ring">{a.line}</button> : a.line}
    <span className="text-faint tnum"> · {when(a.recorded_at)} · {by(a)}</span></li>)}</ul>])
  if (reviews.length) rows.push(['Reviewed', reviews.map((r) => `${personName(env, r.author_id) ?? '—'} · ${when(r.recorded_at)}`).join('; ')])
  if (findings.length) rows.push(['Warnings', <ul className="grid gap-0.5">{findings.map((f, i) => <li key={i}>{f.detail ?? f.code}{f.confirmed && <span className="text-faint"> · signed anyway</span>}</li>)}</ul>])
  return <>
    <KV dense labelWidth="6.5rem" items={rows} />
    {PRIVACY.has(base(e)) && !e.hidden && <NotePrivacy entryId={e.id} patientId={e.patient_id} isPrivate={isPrivate} />}
  </>
}
