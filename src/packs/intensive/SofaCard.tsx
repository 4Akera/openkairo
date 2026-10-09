// SOFA at the round (spec/openCare.md §5.6, piece I2): what the record says for each row (the worst of the last 24 hours), the core's
// own score card under it with each choice's points, filled with what the record supports, and the stay's earlier SOFAs beside it. The
// doctor checks each row and picks what the record cannot show; the server adds them up.
import { TriangleAlert } from 'lucide-react'
import type { Department } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import type { Ctx } from '@core/screens/visit/parse'
import { ScoreCard } from '@core/screens/visit/ScoreCard'
import type { ScoreParams } from '@core/screens/visit/score'
import { Card } from '@core/ui'
import { SOFA_ITEMS, type Evidence, type SofaItem } from './sofa'

const LABEL: Record<SofaItem, string> = { resp: 'Breathing', coag: 'Platelets', liver: 'Bilirubin', cardiovascular: 'Blood pressure', cns: 'GCS', renal: 'Kidney' }

export function SofaCard({ dept, params, set, evidence, history }: { dept: Department; params: ScoreParams; set: (patch: Record<string, unknown>) => void
  evidence: Record<SofaItem, Evidence>; history: { total: number; words: string }[] }) {
  const { org } = useDepartment()
  const ctx = { services: [], templates: [], departments: [], problems: [], departmentId: dept.id, scores: org?.scores, packs: dept.packs } as Ctx
  return <Card role="group" aria-label="SOFA" className="grid content-start gap-3 p-4">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-13 font-medium text-fg">SOFA · this morning</span>
      {history.length > 0 && <span className="text-12 text-muted tnum">{history.map((h) => `${h.words} ${h.total}`).join(' · ')}</span>}</div>
    <dl className="grid gap-1.5">{SOFA_ITEMS.map((k) => <div key={k} className="grid gap-0.5">
      <dt className="text-12 font-medium text-fg">{LABEL[k]}</dt>
      {evidence[k].words.map((w) => evidence[k].warn?.includes(w)
        ? <dd key={w} className="flex items-start gap-1 text-12 text-warn"><TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" /><span>{w}</span></dd>
        : <dd key={w} className="text-12 text-muted">{w}</dd>)}
    </div>)}</dl>
    <p className="text-12 text-faint">What the record shows is chosen; check each row and pick the rest.</p>
    <ScoreCard q={params} set={set} ctx={ctx} />
  </Card>
}
