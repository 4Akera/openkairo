// The chart's banner (chart-plan.md §2 #16–17, §4): the kit's Banner filled from the record — name, age, sex, deceased, number, phone;
// the encounter in words (a clinic visit's status · new or follow-up · minutes since seen, a stay's "Admitted · Bed 3 · day 4"; none on
// /patient/:id with nothing open here, as before); active alerts, then allergies or "No known allergies" / "Allergies not asked"; a
// chip when results wait for my review, which scrolls the record to them; back to the queue or the beds; the actions at its end — one
// row. No vitals (the Summary has them, with their trend) and no queue line (the queue is the clinic's home; Done → next goes on).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { QueueRow } from '../../db/types'
import { Badge, Banner, cn } from '../../ui'
import { useChart } from './context'
import { Actions } from './Actions'
import { startOf } from './model/encounter'
import { alertsOf, waitingOf } from './model/record'
import { stayWords, visitWords } from './model/visit'
import { useDepartment } from '../../hooks/organization'

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }

export function ChartBanner({ next, assignee }: { next: QueueRow | null; assignee: string | null }) {
  const c = useChart(); const { org } = useDepartment(); const navigate = useNavigate()
  const r = c.r; const v = c.encounter; const p = r.patient
  const alerts = useMemo(() => alertsOf(c.facts ?? [], org?.types).active, [c.facts, org])
  const review = useMemo(() => waitingOf(r.server, { org, me: c.me, departmentId: c.departmentId }).reviews, [r.server, org, c.me, c.departmentId])
  const critical = review.filter((x) => x.critical).length
  const allergies = r.allergies.filter((a) => a.status === 'active' && a.certainty !== 'refuted')
  const context = v && (c.role.stay ? <span className="text-accent">{stayWords(v, org?.places.find((x) => x.id === v.place_id)?.name, startOf(v.presence, r.server.tables['base.presence']))}</span>
    : <><span className={cn(c.role.mine && 'text-accent')}>{visitWords(v)}</span></>)
  const toReview = () => { c.setTab('aside'); requestAnimationFrame(() => document.getElementById('summary-waiting')?.scrollIntoView({ block: 'center', inline: 'nearest' })) }
  return <Banner name={`${p.given_name} ${p.family_name}`} sub={`${p.age} y · ${SEX[p.sex] ?? ''} · #${p.record_number}${p.phone_text ? ` · ${p.phone_text}` : ''}`}
    context={context || undefined} back={{ label: c.role.stay ? 'Back to the beds' : 'Back to the queue', onClick: () => navigate('/') }}
    flags={<>
      {p.died_on && <Badge>deceased</Badge>}
      {v?.priority && v.priority !== 'routine' && <Badge tone="danger">{v.priority}</Badge>}
      {alerts.map((a) => <Badge key={a.item} tone="danger">⚠ {a.text}</Badge>)}
      {allergies.length ? allergies.map((a) => <Badge key={a.id} tone="danger">⚠ {a.substance_name}</Badge>)
        : r.allergy_review ? <span className="text-12 text-faint">No known allergies</span> : <span className="text-12 text-warn">Allergies not asked</span>}
      {review.length > 0 && <button type="button" onClick={toReview} className="rounded-full focus-ring" title="Open the results waiting for your review">
        <Badge tone={critical ? 'danger' : 'warn'}>{critical ? `${critical} critical to review` : `${review.length} to review`}</Badge></button>}
    </>}
    actions={<Actions next={next} assignee={assignee} />} />
}
