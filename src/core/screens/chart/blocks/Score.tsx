// A recorded score (spec/openCare.md §5.1 rule 8): its total and the version it used ("GCS 14 · 1974"), its band in words with its
// state colour, and each item's answer — read from the version the entry names, never added up again.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { Tag } from '../../../ui'
import { tableOf, toneOf } from '../../visit/score'
import { useBlockEnv } from './env'

export function Score({ data }: BlockProps) {
  const env = useBlockEnv(); const d = data as Partial<EntryData['score']>
  const t = tableOf(env.org?.scores, d.score ?? null, d.version ?? null); const band = t?.bands.find((b) => b.key === d.band)
  const answers = (t?.items ?? []).map((i) => { const v = d.inputs?.[i.key]; const c = i.choices?.find((x) => x.value === String(v))
    return `${i.labels.en ?? i.key} ${v === undefined ? '—' : c ? c.labels.en : typeof v === 'boolean' ? (v ? 'yes' : 'no') : `${v}${i.unit ? ` ${i.unit}` : ''}`}` })
  return <div className="grid gap-0.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-14 font-medium text-fg tnum">{t?.short ?? d.score} {d.total}</span>
      {band && <Tag tone={toneOf(band)}>{band.labels.en}</Tag>}
      <span className="text-12 text-faint">{t?.labels.en ?? d.score} · {d.version}</span>
    </p>
    {answers.length > 0 && <p className="text-muted">{answers.join(' · ')}</p>}
  </div>
}
