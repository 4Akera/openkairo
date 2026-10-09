// The hour card's cardiac rows (spec/openCare.md §5.6, piece I3), where the department switches them on: the rhythm (Other opens a
// field for its words), ectopic beats, chest pain 0–10 and the ST segment with its fall in %. Inline chips only: no dropdown.
import { Chip, Input, NumberInput } from '@core/ui'
import { ECTOPICS, RHYTHMS, ST, type CardiacDraft } from './cardiac'
import { Part, Under, type PartProps } from './HourParts'

const Label = ({ children }: { children: string }) => <span className="text-12 font-medium text-muted">{children}</span>

export function HourCardiac({ d, set, say }: PartProps) {
  const c = d.cardiac ?? {}
  const put = (patch: Partial<CardiacDraft>) => set((x) => ({ ...x, cardiac: { ...x.cardiac, ...patch } }))
  const chips = (key: 'rhythm' | 'ectopics' | 'st', list: [string, string, string][]) => <span className="flex flex-wrap gap-1">{list.map(([code, words, short]) =>
    <Chip key={code} title={words} on={c[key] === code} onClick={() => put({ [key]: c[key] === code ? undefined : code })}>{key === 'st' ? words : short}</Chip>)}</span>
  const n = (s: string | undefined) => s?.trim() ? Number(s) : null
  return <Part title="Heart">
    <div className="grid content-start gap-1"><Label>Rhythm</Label>{chips('rhythm', RHYTHMS)}
      {c.rhythm === 'other' && <Input dense aria-label="The rhythm" placeholder="The rhythm" value={c.rhythm_text ?? ''} onChange={(e) => put({ rhythm_text: e.target.value })} className="w-48" />}
      <Under s={say.rhythm} /></div>
    <div className="grid content-start gap-1"><Label>Ectopics</Label>{chips('ectopics', ECTOPICS)}</div>
    <label className="grid content-start gap-1"><span className="text-12 font-medium text-muted">Chest pain <span className="text-11 font-normal text-faint">0–10</span></span>
      <NumberInput dense integer label="Chest pain" value={n(c.pain)} onValue={(v) => put({ pain: v === null ? undefined : String(v) })} className="w-16" />
      <Under s={say.pain} /></label>
    <div className="grid content-start gap-1"><Label>ST</Label>{chips('st', ST)}</div>
    <label className="grid content-start gap-1"><span className="text-12 font-medium text-muted">ST fall <span className="text-11 font-normal text-faint">%</span></span>
      <NumberInput dense label="ST fall" value={n(c.st_fall)} onValue={(v) => put({ st_fall: v === null ? undefined : String(v) })} className="w-16" />
      <Under s={say.st_fall} /></label>
  </Part>
}
