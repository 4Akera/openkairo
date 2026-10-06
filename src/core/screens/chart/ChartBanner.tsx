// The chart's banner (spec/openCare.md §5.1 rule 3): one line in fixed zones split by thin lines — who (name, age, sex, record number,
// deceased) · where (the encounter in words: "In consult · follow-up · 12 min", "Admitted · Bed 3 · day 4"; none on /patient/:id with
// nothing open here) · safety, the same in every department (model/banner.ts: allergies, the base alerts, critical results waiting,
// which scrolls the record to them, pregnant or breastfeeding) · this department's pack words, two, then +n, which opens the rest as
// a second line in place and folds it again (never a menu). The phone lives in the Summary. Back to the queue or the beds; the
// actions at its end. No vitals (the Summary has them, with their trend) and no queue line (the queue is the clinic's home).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import type { QueueRow } from '../../db/types'
import { Badge, Banner, Tag, cn, ymd } from '../../ui'
import { useChart } from './context'
import { Actions } from './Actions'
import { startOf } from './model/encounter'
import { safetyOf, whoOf, type SafetyItem } from './model/banner'
import { stayWords, visitWords } from './model/visit'
import { packWordsOf, wordDefs, wordLines, type Spoken } from './words'
import { useDepartment } from '../../hooks/organization'

export function ChartBanner({ next, assignee }: { next: QueueRow | null; assignee: string | null }) {
  const c = useChart(); const { org, dept } = useDepartment(); const navigate = useNavigate(); const [open, setOpen] = useState(false)
  const r = c.r; const v = c.encounter; const who = whoOf(r.patient)
  const ctx = useMemo(() => ({ org, me: c.me, departmentId: c.departmentId }), [org, c.me, c.departmentId])
  const safety = useMemo(() => safetyOf({ rec: r.server, ctx, facts: c.facts, today: ymd(new Date().toISOString()) }), [r.server, ctx, c.facts])
  const words = useMemo(() => packWordsOf(wordDefs(), { rec: r.server, ctx, identity: r.identity, packs: c.packs }, dept?.packs ?? []), [r.server, ctx, r.identity, c.packs, dept])
  const lines = wordLines(words, open)
  const where = v && (c.role.stay ? <span className="text-13 text-accent">{stayWords(v, org?.places.find((x) => x.id === v.place_id)?.name, startOf(v.presence, r.server.tables['base.presence']))}</span>
    : <span className={cn('text-13 text-muted tnum', c.role.mine && 'text-accent')}>{visitWords(v)}</span>)
  const urgent = v?.priority && v.priority !== 'routine' ? <Badge tone="danger">{v.priority}</Badge> : null
  const toReview = () => { c.setTab('aside'); requestAnimationFrame(() => document.getElementById('summary-waiting')?.scrollIntoView({ block: 'center', inline: 'nearest' })) }
  const zones = [
    ...(where || urgent ? [{ key: 'where', label: 'Where', node: <>{where}{urgent}</> }] : []),
    { key: 'safety', label: 'Safety', node: <>{safety.map((s) => <Safety key={s.key} s={s} onReview={toReview} />)}</> },
    ...(lines.first.length ? [{ key: 'packs', label: 'This department', node: <>{lines.first.map((w) => <Word key={`${w.key}:${w.word}`} w={w} />)}
      {lines.toggle && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? 'Fold the other words' : 'The other words, on a second line'}
        className="rounded-full px-1.5 text-12 font-medium text-accent hover:bg-hover focus-ring">{open ? 'Fewer' : lines.toggle}</button>}</> }] : []),
  ]
  return <Banner name={who.name} sub={<>{who.sub}{who.deceased && <Badge className="ms-2">deceased</Badge>}</>} zones={zones}
    second={lines.second && <>{lines.second.map((w) => <Word key={`${w.key}:${w.word}`} w={w} />)}</>}
    back={{ label: c.role.stay ? 'Back to the beds' : 'Back to the queue', onClick: () => navigate('/') }}
    actions={<Actions next={next} assignee={assignee} />} />
}

/** a safety item: a word with its tone; a severe allergy or an alert carries the glyph too (colour never alone); critical results open
 *  the review list */
function Safety({ s, onReview }: { s: SafetyItem; onReview: () => void }) {
  if (s.kind === 'critical') return <button type="button" onClick={onReview} className="rounded-full focus-ring" title="Critical results waiting for review: the list is in the Summary">
    <Badge tone="danger">{s.word}</Badge></button>
  if (s.tone === 'neutral') return <span className="text-12 text-faint">{s.word}</span>
  if (s.tone === 'warn' && s.kind === 'allergies') return <span className="text-12 text-warn">{s.word}</span>
  return <Badge tone={s.tone} icon={s.kind === 'allergy' || s.kind === 'alert' ? AlertTriangle : undefined}>{s.word}</Badge>
}
/** a pack's word: plain unless it says a state that asks for something */
const Word = ({ w }: { w: Spoken }) => <Tag tone={w.tone ?? 'neutral'}>{w.word}</Tag>
