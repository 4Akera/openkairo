// The Labour tab (obgyn.labour, spec/openCare.md §5.6): ObGyn's screen beside the board, opened at a woman by her tile's Partograph.
// The women in labour as chips ("Delivery 1 · Salma Ahmed"), the chosen one kept in the link (?stay=); one line about her (her name,
// age, G and P as her exam said them, the weeks, the bed, since when in active labour); the notice when she is past the alert or the
// action line (only a notice: the doctor decides); the WHO's modified partograph and the grid by time under it. Nothing is typed
// here: the composer's /ve, /ctx, /fhr and /v in her chart write what this draws ("Open the chart").
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { banner } from '@core/db/views'
import type { PresenceRow } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, ScreenFrame, Spinner, errorText } from '@core/ui'
import { hm, ymd } from '@core/ui/time'
import { gpOf, stayOf } from './board'
import { Partograph } from './Chart'
import { LabourGrid } from './LabourGrid'
import { examPoints, gridOf, noticeOf } from './grid'
import { activeFrom, gestation, gestationWords, partographOf, type Point } from './partograph'
import { useLabour } from './useLabour'

export function Labour({ dept }: ScreenProps) {
  const { org } = useDepartment(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const l = useLabour(dept, params.get('stay'))
  const af = activeFrom(org, dept.id)
  // the clock the weeks and days count to: a minute's, so a tab left open past midnight says what the tile says
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const exams = useMemo(() => examPoints(l.entries), [l.entries])
  const p = useMemo(() => partographOf(exams.flatMap((e): Point[] => typeof e.cervix === 'number'
    ? [{ at: e.at, cervix: e.cervix, ...(typeof e.descent === 'number' ? { descent: e.descent } : {}) }] : []), af, now), [exams, af, now])
  // the head as palpated, with or without a cervix (/ve 3/5 alone); the chart draws those from where active labour began
  const heads = useMemo(() => exams.flatMap((e) => typeof e.descent === 'number' ? [{ at: e.at, descent: e.descent }] : []), [exams])
  const grid = useMemo(() => gridOf(l.entries), [l.entries])
  const bed = (r: PresenceRow) => org?.places.find((x) => x.id === r.place_id && x.department_id === dept.id)?.name ?? 'No bed'
  const who = (r: PresenceRow) => l.stays?.patients[r.patient_id]
  const choose = (item: string) => setParams((was) => { const n = new URLSearchParams(was); n.set('stay', item); return n }, { replace: true })
  const s = l.selected
  const filters = l.list.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{l.list.map((r) => { const i = who(r)
    return <Chip key={r.item} shape="pill" on={r.item === s?.item} onClick={() => choose(r.item)}>{bed(r)} · {i ? i.given.slice(0, 2).join(' ') || i.full_name : 'Patient'}</Chip> })}</div>
  const action = s && <Button size="sm" variant="outline" onClick={() => navigate(`/visit/${s.item}`)}>Open the chart</Button>
  if (l.error) return <ScreenFrame><Callout tone="danger">{errorText(l.error)}</Callout></ScreenFrame>
  if (l.isLoading) return <ScreenFrame><Spinner /></ScreenFrame>
  if (!s) return <ScreenFrame><Card><Empty>No one is in labour on this ward.</Empty></Card></ScreenFrame>
  const i = who(s); const b = i ? banner(i) : null
  const g = gestation(stayOf(l.board, s.item)?.pregnancy, ymd(new Date(now).toISOString()))
  const gp = gpOf(exams)
  const line = [i?.full_name, b && `${b.age} y · ${b.sex[0]?.toUpperCase() ?? ''}`, gp, g && gestationWords(g), bed(s),
    p.start ? `active labour since ${hm(p.start.at)}` : p.latest ? 'latent phase' : null].filter(Boolean).join(' · ')
  const notice = noticeOf(p)
  return <ScreenFrame filters={filters} action={action}>
    <p className="text-14 text-fg">{line}</p>
    {notice && <Callout tone={notice.tone} title={notice.title}>{notice.text}</Callout>}
    {l.entriesError ? <Callout tone="danger">{errorText(l.entriesError)}</Callout> : l.entriesLoading ? <Spinner /> : <>
      <Card className="grid content-start gap-2 p-3">
        <p className="flex flex-wrap items-center gap-2"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Partograph{p.start ? ` · active labour from ${hm(p.start.at)}` : ''}</span>
          <span className="text-12 text-muted">× cervix in cm · ○ head, fifths above the brim (right scale)</span></p>
        <Partograph p={p} af={af} heads={heads} />
      </Card>
      <LabourGrid model={grid} />
    </>}
    <p className="text-12 text-faint">Type in the chart: <span className="font-mono">/ve 6 3/5 oa clear m+ · /ctx 3/10 40s · /fhr 142 · /v</span> the mother's signs</p>
  </ScreenFrame>
}
