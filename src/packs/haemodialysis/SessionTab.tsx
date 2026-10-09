// The Session tab (haemodialysis.session, spec/openCare.md §5.6, D2b): one chair's session beside the board, opened at a stay by the
// tile's Readings (?stay=…). The chart's centre cannot hold a pack's view and a record section is too narrow, so the session is a tab of
// the unit's, beside the board. The stays in chair order as chips; the patient line (name, age, sex, number, the chair,
// "2:30 of 4:00"); then Before (the card to fill, or its summary once signed) and the prescription on the left, the readings on the right.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { banner } from '@core/db/views'
import type { Department, PatientBanner, Place, PresenceRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, ScreenFrame, Spinner, Tag, errorText } from '@core/ui'
import { BeforeCard, BeforeSummary } from './BeforeCard'
import { Readings } from './Readings'
import { RxCard } from './RxCard'
import { beforeVit, hmWords, inChairOrder, preOf, qv, readingsOf, sessionOf } from './session'
import { chairsOf } from './unit'
import { useLastWeight, usePrescription, useStayRecord } from './useSession'
import { nameOf } from './week'

/** the clock the time on the machine moves by, each half minute */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return now
}

export function Session({ dept }: ScreenProps) {
  const { org } = useDepartment(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const stays = useStays(dept.id)
  const chairs = useMemo(() => chairsOf(org, dept.id), [org, dept.id])
  const list = useMemo(() => inChairOrder(stays.data?.rows ?? [], chairs, dept.id), [stays.data, chairs, dept.id])
  const who = (r: PresenceRow): PatientBanner | undefined => { const p = stays.data?.patients[r.patient_id]; return p ? banner(p) : undefined }
  const chairOf = (r: PresenceRow) => chairs.find((c) => c.id === r.place_id)
  const wanted = params.get('stay')
  const stay = list.find((r) => r.item === wanted) ?? list[0] ?? null
  const choose = (item: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('stay', item); n.delete('card'); return n }, { replace: true })
  return <ScreenFrame
    filters={list.length > 0 && <span role="group" aria-label="Chairs" className="flex flex-wrap items-center gap-1.5">{list.map((r) =>
      <Chip key={r.item} shape="pill" on={r.item === stay?.item} onClick={() => choose(r.item)}>{[chairOf(r)?.name, nameOf(who(r))].filter(Boolean).join(' · ')}</Chip>)}</span>}
    action={stay && <Button size="sm" variant="outline" onClick={() => navigate(`/visit/${stay.item}`)}>Open the chart</Button>}
    notice={wanted && stay && wanted !== stay.item && list.length > 0 && <Callout tone="info" icon={false} role="status">That chair's session has ended: here is the next one.</Callout>}>
    {stays.isLoading ? <Spinner label="Reading the unit" />
      : stays.error ? <Callout tone="danger" title="Not loaded">{errorText(stays.error)}</Callout>
      : !stay ? <Card><Empty>No one is on dialysis now.</Empty></Card>
      : <StayView key={stay.item} dept={dept} stay={stay} who={who(stay)} chair={chairOf(stay)} />}
  </ScreenFrame>
}

function StayView({ dept, stay, who, chair }: { dept: Department; stay: PresenceRow; who: PatientBanner | undefined; chair: Place | undefined }) {
  const { can } = useDepartment()
  const rec = useStayRecord(dept, stay)
  const rx = usePrescription(dept, stay.patient_id)
  const last = useLastWeight(dept, stay.patient_id, stay.checked_in_at)
  const now = useNow()
  const entries = useMemo(() => rec.data?.entries ?? [], [rec.data])
  const session = useMemo(() => sessionOf(entries, stay.item), [entries, stay.item])
  const readings = useMemo(() => readingsOf(entries, stay.item), [entries, stay.item])
  const pre = useMemo(() => preOf(entries, stay.item), [entries, stay.item])
  if (rec.isLoading) return <Spinner label="Reading the session" />
  if (rec.error) return <Callout tone="danger" title="Not loaded">{errorText(rec.error)}</Callout>
  const h = session?.data.haemodialysis
  const on = session?.status === 'in-progress'
  const signed = !!h?.target
  const started = session?.data.performed?.value
  const firstBp = pre?.bp ?? (() => { const s = qv((readings[0]?.data as { bp?: { sys?: unknown } } | undefined)?.bp?.sys); return s !== undefined ? { sys: s } : null })()
  const status = !session ? 'no session' : on ? (started ? hmWords(started, h?.hours, now) : 'on') : session.status === 'not-done' ? 'not done' : session.status
  return <div className="grid gap-3">
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-13">
      <b className="text-14 font-semibold text-fg">{nameOf(who)}</b>
      {who && <span className="text-muted">{[`${who.age} y`, who.sex[0]?.toUpperCase(), `#${who.record_number}`].filter(Boolean).join(' · ')}</span>}
      {chair && <Tag>{chair.name}</Tag>}
      <span className={on ? 'font-medium text-fg tnum' : 'text-warn'}>{status}</span>
      {h?.prescription?.hours != null && h.hours != null && h.prescription.hours !== h.hours && <span className="text-12 text-faint">prescribed {h.prescription.hours} h</span>}
    </Card>
    {!session && <Callout tone="warn" icon={false}>No session in this stay: start it from the board's row.</Callout>}
    <div className="grid items-start gap-3 lg:grid-cols-[20rem_1fr]">
      <div className="grid content-start gap-3">
        {session && (signed ? <BeforeSummary session={session} pre={pre} vit={beforeVit(entries, session, pre)} last={last.data ?? null} />
          : on && can('write:haemodialysis.session') ? rx.isLoading ? <Spinner label="Reading the prescription" /> : <BeforeCard key={`${session.entry_id}|${rx.data?.entry_id ?? ''}|${pre?.at ?? ''}`} dept={dept} stay={stay} session={session}
            pre={pre} rx={rx.data?.data ?? null} last={last.data ?? null} />
          : <Card className="p-3"><Empty size="sm">Before is not signed yet.</Empty></Card>)}
        <RxCard dept={dept} patientId={stay.patient_id} copy={signed ? h?.prescription ?? null : null} />
      </div>
      <Readings dept={dept} stay={stay} readings={readings} first={firstBp} on={on} />
    </div>
  </div>
}
