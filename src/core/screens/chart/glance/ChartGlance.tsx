// The glance (chart-plan.md §1.5, §4; build plan 3.11): the chart's small read-only form, for the bench (an aside beside the grid) and
// for anyone who may not read the record here (the desk opening a visit). With read:record: the Summary's first five items at half
// their limits — problems, medicines, allergies and alerts, the last vitals, key results — and the visits; no buttons. Without it: who
// the patient is and where they have been (base.presence, base.deceased), nothing clinical. The desk's card folds out the visits alone.
import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useFacts, useGlance } from '../../../hooks/chart'
import { useDepartment } from '../../../hooks/organization'
import { useRecord } from '../../../hooks/reads'
import { banner } from '../../../db/views'
import { Badge, Banner, Centered, Empty, Section, Skeleton, TONE, Tag, cn, errorText, flagTone, shortDate } from '../../../ui'
import { doseText, visitsOf, type ChartCtx, type Rec, type VisitLine } from '../model/record'
import { summaryOf } from '../model/summary'

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
const NONE: Rec = { tables: {}, hidden: [] }

/** page: the whole screen (a reader without read:record opened the chart); else the glance's body, for an aside */
export function ChartGlance({ patientId, page }: { patientId: string; page?: boolean }) {
  const { can } = useDepartment(); const reader = can('read:record')
  const g = useGlance(!reader || page ? patientId : null)
  const navigate = useNavigate()
  const body = reader ? <RecordGlance patientId={patientId} /> : <VisitsOnly patientId={patientId} />
  if (!page) return body
  if (g.isLoading) return <Centered><Skeleton lines={3} /></Centered>
  if (g.error || !g.data) return <Centered><p role="alert" className="text-14 text-danger">{g.error ? errorText(g.error) : 'No patient'}</p></Centered>
  const p = banner(g.data.patient, g.data.tables['base.deceased']?.rows[0] ?? null)
  return <div className="mx-auto grid max-w-3xl gap-4 px-4 py-4">
    <Banner size="compact" name={`${p.given_name} ${p.family_name}`} sub={`${p.age} y · ${SEX[p.sex] ?? ''} · #${p.record_number}`} back={{ label: 'Back', onClick: () => navigate('/') }}
      flags={p.died_on ? <Badge>deceased</Badge> : undefined} />
    {!reader && <p className="text-12 text-faint">Your role here does not read the record: who the patient is and where they have been, nothing clinical.</p>}
    {body}
  </div>
}

/** the Summary's items 1–5 at half their limits, and the visits */
function RecordGlance({ patientId }: { patientId: string }) {
  const { org, dept } = useDepartment(); const r = useRecord(patientId, dept?.id ?? null); const facts = useFacts(patientId)
  const ctx = useMemo<ChartCtx>(() => ({ org, me: org?.me.id ?? '', departmentId: dept?.id ?? '' }), [org, dept])
  const s = useMemo(() => r.data ? summaryOf(r.data.server, ctx, { facts: facts.data, half: true }) : null, [r.data, ctx, facts.data])
  if (r.error) return <p role="alert" className="text-13 text-danger">{errorText(r.error)}</p>
  if (!s || !r.data) return <Skeleton lines={4} />
  return <div className="grid gap-3">
    <Section variant="compact" title="Record" className="@container">
      <dl className="grid gap-2.5">
        <Item label="Active problems">{s.problems.rows.length ? s.problems.rows.map((x) => <p key={x.id}><span className="font-medium">{x.name}</span>{x.certainty === 'suspected' && <Tag tone="warn" className="ms-1.5">Suspected</Tag>}</p>)
          : <p className="text-faint">No active problems</p>}{s.problems.more > 0 && <p className="text-12 text-faint">+{s.problems.more} more</p>}</Item>
        <Item label="Current medicines">{s.medicines.rows.length ? s.medicines.rows.map((m) => <p key={m.id}><span className="font-medium">{m.drug_name}</span>
          <span className="text-muted tnum"> {doseText(m.line)}</span>{m.status === 'on-hold' && <Tag tone="warn" className="ms-1.5">On hold</Tag>}</p>)
          : <p className="text-faint">No current medicines</p>}{s.medicines.more > 0 && <p className="text-12 text-faint">+{s.medicines.more} more</p>}</Item>
        <Item label="Allergies & alerts">
          {s.allergies.alerts.map((a) => <p key={a.item} className="font-medium text-danger">⚠ {a.text}</p>)}
          {s.allergies.rows.map((a) => <p key={a.id}><span className="font-medium text-danger">{a.substance_name}</span>{a.reactions_text && <span className="text-muted"> — {a.reactions_text}</span>}</p>)}
          {!s.allergies.rows.length && <p className={s.allergies.nka ? 'text-ok' : 'text-warn'}>{s.allergies.nka ? 'No known allergies' : 'Allergies not asked'}</p>}</Item>
        <Item label="Last vitals">{s.vitals.tiles.length ? <p className="flex flex-wrap gap-x-3 tnum">{s.vitals.tiles.map((t) => <span key={t.key}><span className="text-muted">{t.label}</span> <b className="font-semibold">{t.value}</b>
          {t.trend && <span aria-hidden className="text-faint"> {t.trend}</span>}</span>)}</p> : <p className="text-faint">No vitals recorded</p>}
          {s.vitals.at && <p className="text-11 text-faint tnum">{shortDate(s.vitals.at)}</p>}</Item>
        {s.results.show && <Item label="Key results">{s.results.rows.length ? s.results.rows.map((k) => { const f = !!k.flag && k.flag !== 'normal'
          return <p key={k.code} className="tnum"><span className="text-muted">{k.name}</span> <b className={cn('font-semibold', f ? TONE[flagTone(k.flag)].text : 'text-fg')}>{k.value}{k.mark && <span aria-hidden> {k.mark}</span>}</b>
            {f && <span className="sr-only"> {k.word}</span>}{k.unit && <span className="text-12 text-faint"> {k.unit}</span>}<span className="text-12 text-faint"> · {shortDate(k.at)}</span></p> })
          : <p className="text-faint">None of the key tests yet</p>}</Item>}
      </dl>
    </Section>
    <Visits lines={visitsOf(r.data.server, ctx)} />
  </div>
}

/** who has seen the patient where: presence only (the reader may not read the record) */
function VisitsOnly({ patientId }: { patientId: string }) {
  const { org, dept } = useDepartment(); const g = useGlance(patientId)
  const lines = useMemo(() => g.data ? visitsOf({ ...NONE, tables: { 'base.presence': g.data.tables['base.presence'] } }, { org, me: org?.me.id ?? '', departmentId: dept?.id ?? '' }) : null, [g.data, org, dept])
  if (g.error) return <p role="alert" className="text-13 text-danger">{errorText(g.error)}</p>
  return lines ? <Visits lines={lines} /> : <Skeleton lines={2} />
}

/** the desk's card: the visits alone, read when folded out */
export function GlanceVisits({ patientId }: { patientId: string }) { return <VisitsOnly patientId={patientId} /> }

function Visits({ lines }: { lines: VisitLine[] }) {
  return <Section variant="compact" title="Visits & stays" count={lines.length || undefined} flush>
    {!lines.length ? <Empty size="sm" className="px-3.5 pb-2">No visits or stays yet</Empty> : <ul className="divide-y divide-line border-t border-line">
      {lines.slice(0, 8).map((v) => <li key={v.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 px-3.5 py-1.5 text-13">
        <span className="text-faint tnum">{shortDate(v.start)}</span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-x-1.5"><span className="font-medium text-fg">{v.department}</span>
          {v.locked && <Lock aria-label="Private" className="size-3 text-faint" />}
          <span className="ms-auto text-12 text-faint">{v.kind === 'stay' ? `${v.open ? 'Admitted' : 'Stay'} · ${v.days} day${v.days === 1 ? '' : 's'}${v.bed ? ` · ${v.bed}` : ''}` : v.state_word}</span></span>
          {v.who && <span className="block truncate text-12 text-faint">{v.who}</span>}</span>
      </li>)}</ul>}
  </Section>
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-0.5 @md:grid-cols-[7rem_minmax(0,1fr)] @md:gap-3"><dt className="text-12 text-faint">{label}</dt><dd className="min-w-0 text-13 text-fg">{children}</dd></div>
}
