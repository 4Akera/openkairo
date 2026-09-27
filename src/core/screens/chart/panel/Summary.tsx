// The Summary, exactly (chart-plan.md §4): seven items from data only, in the agreed order — active problems, current medicines,
// allergies and alerts, last vitals, key results, last visits, still waiting — each with its limit and its empty state, and the
// notices above them (opened anyway, died; the private notes stand just above the Summary). The label sits left of the facts where
// the panel is wide, above them where it is narrow. Vitals carry no flag (none exists): a tile shows its change (↗ ↘ →), never a flag
// arrow; a result keeps its analyte's own interpretation (↑‼ critically high). A fact opens its entry in the center, "+N more" its
// section. "Not reviewed" is warn, as Side.tsx's amber: it asks for a review.
import { useMemo, useState, type ReactNode } from 'react'
import { Lock, TriangleAlert } from 'lucide-react'
import type { ListReview } from '../../../db/types'
import { oneSet, reviewed } from '../../../db/entries'
import { useOpened } from '../../../hooks/reads'
import { useWrite } from '../../../hooks/writes'
import { Badge, Button, Section, Sparkline, TONE, Tag, cn, errorText, flagTone, flagWord, hm, longDate, minutesSince, shortDate, ymd } from '../../../ui'
import { partialWords, sinceWords } from '../model/labels'
import { doseText, waitingOf } from '../model/record'
import { summaryOf, type Summary as S } from '../model/summary'
import type { KeyResult, VitalTile } from '../model/values'
import { DRAFT, useListDrafts } from './actions'
import { Fact, More, ReviewLine, Undo } from './parts'
import type { Panel } from './RecordPanel'

const today = () => ymd(new Date().toISOString())
/** when the vitals were taken: 10:05 today, else 12 Jun · 10:05 */
const taken = (at: string) => ymd(at) === today() ? `${hm(at)} today` : `${shortDate(at)} · ${hm(at)}`
/** how long an order has been out: waiting 2 h today, else since 12 Sep */
const waited = (at: string) => { if (ymd(at) !== today()) return `since ${shortDate(at)}`; const m = minutesSince(at); return `waiting ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`}` }
/** a Break-the-glass window of this browser, while it lasts */
const live = (o: { at: number; reason: string } | undefined) => o && o.at > Date.now() ? o : null

export function Summary({ p }: { p: Panel }) {
  const presence = p.r.visit?.presence
  const s = useMemo(() => summaryOf(p.rec, p.ctx, { facts: p.facts, visitId: p.visitId, visit: presence }), [p.rec, p.ctx, p.facts, p.visitId, presence])
  const btg = live(useOpened((x) => x.until[p.patientId]))
  return <Section variant="compact" title="Summary" className="@container">
    {(btg || s.notices.died) && <div className="mb-2 grid gap-1 text-12">
      {btg && <p className="flex items-center gap-1.5 text-muted"><Lock aria-hidden className="size-3.5 text-faint" />Opened anyway — until {hm(new Date(btg.at).toISOString())} · {btg.reason}</p>}
      {s.notices.died && <p className="font-medium text-fg">Died {longDate(s.notices.died)}</p>}
    </div>}
    <dl className="grid gap-3">
      <Item label="Active problems">
        {s.problems.rows.length ? <ul className="grid gap-0.5">{s.problems.rows.map((x) => <li key={x.id}>
          <Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined} className="font-medium">{x.name}</Fact>
          {x.certainty === 'suspected' && <Tag tone="warn" className="ms-1.5">Suspected</Tag>}
          {x.onset_on && <span className="text-faint tnum"> · since {partialWords({ value: x.onset_on })} ({sinceWords(x.onset_on)})</span>}</li>)}</ul>
          : <p className="text-faint">No active problems<ReviewLine at={s.problems.review} /></p>}
        <More n={s.problems.more} onClick={() => p.jump('problems')} />
      </Item>
      <Item label="Current medicines">
        {s.medicines.rows.length ? <ul className="grid gap-0.5">{s.medicines.rows.map((m) => { const dose = [doseText(m.line), m.line.prn].filter(Boolean).join(' ')
          return <li key={m.id}><Fact onOpen={m.entry_id ? () => p.open(m.entry_id!) : undefined} className="font-medium">{m.drug_name}</Fact>
            {m.line.strength && <span className="text-muted"> {m.line.strength}</span>}{dose && <span className="text-muted tnum"> · {dose}</span>}
            {m.status === 'on-hold' && <Tag tone="warn" className="ms-1.5">On hold</Tag>}{m.reported && <Tag className="ms-1.5">Reported</Tag>}
            {m.pharmacy?.open && <Tag tone="info" className="ms-1.5">at the pharmacy</Tag>}</li> })}</ul>
          : <p className="text-faint">No current medicines<ReviewLine at={s.medicines.review} /></p>}
        <More n={s.medicines.more} onClick={() => p.jump('medicines')} />
      </Item>
      <Item label="Allergies & alerts">
        {s.allergies.alerts.map((a) => <p key={a.item} className="flex flex-wrap items-baseline gap-x-1.5 text-danger">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 self-center" /><Fact onOpen={() => p.open(a.entry.id)} className="font-medium">{a.text}</Fact>
          {a.when && <span className="text-12 text-faint tnum">since {partialWords({ value: a.when }, ymd)}</span>}</p>)}
        {s.allergies.rows.map((a) => <p key={a.id}><Fact onOpen={a.entry_id ? () => p.open(a.entry_id!) : undefined} className="font-medium text-danger">{a.substance_name}</Fact>
          {a.reactions_text && <span className="text-muted"> — {a.reactions_text}</span>}{a.severity && <span className="text-muted"> ({a.severity})</span>}
          {a.kind === 'intolerance' && <Tag className="ms-1.5">Intolerance</Tag>}{a.high_risk && <Badge tone="danger" className="ms-1.5">High risk</Badge>}</p>)}
        {!s.allergies.rows.length && <NoneKnown p={p} checked={s.allergies.nka} at={s.allergies.review} />}
      </Item>
      <Item label="Last vitals">
        {s.vitals.at ? <>
          <p className="mb-1 text-12 text-faint tnum">{taken(s.vitals.at)}</p>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 @md:grid-cols-4">{s.vitals.tiles.map((t) => <Tile key={t.key} t={t} onOpen={() => p.open(t.entry_id)} />)}</div>
        </> : <p className="text-faint">No vitals recorded</p>}
      </Item>
      {s.results.show && <Item label="Key results">
        {s.results.rows.length ? <ul className="grid gap-0.5">{s.results.rows.map((k) => <li key={k.code}><KeyRow k={k} onOpen={() => p.open(k.entry_id)} /></li>)}</ul>
          : <p className="text-faint">None of the key tests yet — <Fact onOpen={() => p.jump('results')} className="text-accent">all results below</Fact></p>}
      </Item>}
      <Item label="Last visits">
        {s.visits.rows.length ? <ul className="grid gap-0.5">{s.visits.rows.map((v) => <li key={v.id}>
          <Fact onOpen={() => p.onOpen({ scope: 'visit', id: v.id })}><span className="text-muted tnum">{shortDate(v.start)}</span>
            {' · '}{v.locked && <Lock aria-label="Private notes" className="me-1 inline size-3 text-faint" />}{v.kind === 'stay' ? `Stay · ${v.days} day${v.days === 1 ? '' : 's'} · ${v.department}` : v.department}
            {v.who && <span className="text-muted"> · {v.who}</span>}
            {(v.new_there.length > 0 || v.reason) && <span className="text-faint"> · {v.new_there.length ? v.new_there.join(', ') : v.reason}</span>}</Fact></li>)}</ul>
          : <p className="text-faint">No earlier visits</p>}
        <More n={s.visits.more} onClick={() => p.jump('visits')}>{s.visits.more > 0 ? 'All visits' : undefined}</More>
      </Item>
      <Item label="Still waiting" id="summary-waiting"><Waiting p={p} s={s} /></Item>
    </dl>
  </Section>
}

function Item({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return <div id={id} className="grid scroll-mt-2 gap-0.5 @md:grid-cols-[7.5rem_minmax(0,1fr)] @md:gap-3">
    <dt className="text-12 text-faint @md:pt-px">{label}</dt><dd className="min-w-0 text-13 text-fg">{children}</dd>
  </div>
}

/** no allergies listed: checked (ok), no known allergies drafted (signed on Done), or not asked (warn) with the button that drafts it */
function NoneKnown({ p, checked, at }: { p: Panel; checked: boolean; at: ListReview | null }) {
  const d = useListDrafts(p.patientId)
  if (d.nka) return <p className="flex items-center gap-1 font-medium text-accent">No known allergies — signed on Done<Undo onClick={() => d.remove(d.nka!.id)} /></p>
  if (checked && at) return <p className="text-ok">No known allergies · checked {shortDate(at.reviewed_at)}</p>
  return <p className="flex flex-wrap items-center gap-2"><span className="text-warn">Allergies not asked</span>
    {p.writes('write:list_review') && !d.drafted('allergy', 'add').length && <Button size="xs" variant="outline" onClick={() => d.add(DRAFT.noneKnown())}>No known allergies</Button>}</p>
}

/** a vital: its latest value and its change against the value before (a trend, never a flag); its own date when older than the reading */
function Tile({ t, onOpen }: { t: VitalTile; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} title={t.before ? `was ${t.before}` : undefined} className="-m-1 min-w-0 rounded-md p-1 text-start hover:bg-hover focus-ring">
    <span className="flex items-baseline gap-1 text-12 text-muted">{t.label}{t.trend && <span className="text-faint"><span aria-hidden>{t.trend}</span><span className="sr-only">, was {t.before},</span></span>}</span>
    <span className="flex flex-wrap items-baseline gap-x-1"><span className="text-16 font-semibold text-fg">{t.value}</span>{t.unit && <span className="text-11 text-faint">{t.unit}</span>}</span>
    {t.own && <span className="block text-11 text-faint tnum">{shortDate(t.at)}</span>}
  </button>
}

/** a key test: the value with its own interpretation (tone, glyph and word), its change against the value before, the last eight */
function KeyRow({ k, onOpen }: { k: KeyResult; onOpen: () => void }) {
  const flagged = !!k.flag && k.flag !== 'normal'
  return <button type="button" onClick={onOpen} className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-1 py-0.5 text-start hover:bg-hover focus-ring">
    <span className="w-20 shrink-0 truncate text-muted" title={k.name}>{k.name}</span>
    <span className={cn('shrink-0 font-semibold', flagged ? TONE[flagTone(k.flag)].text : 'text-fg')}>{k.value}{k.mark && <span aria-hidden> {k.mark}</span>}
      {k.word && flagged && <span className="sr-only"> {k.word}</span>}{k.unit && <span className="text-12 font-normal text-faint"> {k.unit}</span>}</span>
    {k.before && <span className="min-w-0 truncate text-12 text-faint tnum"><span aria-hidden>{k.trend} </span>was {k.before.value} · {shortDate(k.before.at)}</span>}
    <Sparkline className="ms-auto h-4 w-12 @md:w-14" width={56} height={16} label={`${k.name} ${k.points.join(', ')}${k.unit ? ` ${k.unit}` : ''}`}
      points={k.points.map((value, i) => ({ at: i, value, flag: i === k.points.length - 1 ? k.flag : null }))} />
  </button>
}

/** results to review (every critical, three others; Reviewed for whoever may write it), orders out (five), this visit waiting for results */
function Waiting({ p, s }: { p: Panel; s: S }) {
  const [all, setAll] = useState(false); const presence = p.r.visit?.presence
  const full = useMemo(() => all ? waitingOf(p.rec, p.ctx, presence) : null, [all, p.rec, p.ctx, presence])
  const reviews = full?.reviews ?? s.waiting.reviews; const orders = full?.orders ?? s.waiting.orders.rows
  if (s.waiting.empty) return <p className="text-faint">Nothing waiting</p>
  return <div className="grid gap-1">
    {s.waiting.pending && <p className="text-info">Waiting for results</p>}
    {reviews.map((x) => <div key={x.row.item} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {x.critical ? <Badge tone="danger">Critical</Badge> : <Tag tone="warn">To review</Tag>}
      <Fact onOpen={() => p.open(x.row.entry_id)} className="font-medium">{x.name}</Fact>
      {!x.critical && flagWord(x.flag) && <span className="text-12 text-warn">{flagWord(x.flag)}</span>}
      <span className="text-12 text-faint tnum">{shortDate(x.row.at)}</span>
      {p.writes('write:reviewed') && <Reviewed p={p} entryId={x.row.entry_id} />}
    </div>)}
    {orders.map((o) => <p key={o.row.item} className="flex flex-wrap items-baseline gap-x-1.5">
      <Fact onOpen={() => p.open(o.row.latest_entry)} className="font-medium">{o.name}</Fact>{o.medicine && <span className="text-muted">{o.medicine}</span>}
      {o.to && <span className="text-muted">· to {o.to}</span>}<Tag tone="info">{o.word}</Tag><span className="text-12 text-faint tnum">{waited(o.since)}</span></p>)}
    {!full && <More n={s.waiting.more_reviews + s.waiting.orders.more} onClick={() => setAll(true)} />}
  </div>
}

/** "I have seen it": a reviewed entry about the result closes its review row (as the clinic home's list does) */
function Reviewed({ p, entryId }: { p: Panel; entryId: string }) {
  const w = useWrite()
  return <span className="ms-auto flex items-center gap-1.5">
    <Button size="xs" variant="outline" loading={w.isPending} onClick={() => w.mutate(oneSet([reviewed(entryId, p.patientId, p.departmentId)]))}>Reviewed</Button>
    {w.error && <span role="alert" className="text-12 text-danger">{errorText(w.error)}</span>}
  </span>
}
