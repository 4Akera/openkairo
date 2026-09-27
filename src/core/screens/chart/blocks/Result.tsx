// A result as a report (chart-plan.md §1.3, design-system.md §4.5): the service, its status (Preliminary warn: it may still change;
// Final; Amended info — Corrected is the frame's tag), who did it and the specimen; the analytes in the kit's table with the flag from each analyte's
// own interpretation (LL and HH keep their direction), the range copied into the result, and the value before (base.values); a
// critical row tinted. A corrected result strikes the values it replaced beside the new ones. The conclusion under Impression (Report
// when there are no numbers), then files. An analyte with earlier values opens its trend inline, under the table. The Reviewed
// button and the critical rail are the frame's (ItemFrame), for every block with a review row.
import { useState, type ReactNode } from 'react'
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { interp } from '../../../db/views'
import { AnalyteTable, Badge, LineChart, type Tone } from '../../../ui'
import { RESULT_STATUS, sections } from '../model/labels'
import { Files, Paragraphs } from './Shell'
import { personName, placeName, useBlockEnv, valueBefore } from './env'

type Analyte = NonNullable<EntryData['result']['analytes']>[number]
const STATUS_TONE: Record<string, Tone> = { preliminary: 'warn', corrected: 'info', amended: 'info' }
const codeOf = (a: Analyte) => a.code ? `${a.code.system}:${a.code.code}` : null
const num = (q: { value: string } | undefined) => q && q.value !== '' && !isNaN(Number(q.value)) ? Number(q.value) : null

export function Result({ item, data, compact }: BlockProps) {
  const env = useBlockEnv(); const d = data as Partial<EntryData['result']>; const [trend, setTrend] = useState<string | null>(null)
  const analytes = d.analytes ?? []
  // the version this one corrected: its values, struck beside the new ones
  const was = item.corrected ? [...item.versions].reverse().map((v) => (v.data as Partial<EntryData['result']> | undefined)?.analytes).find(Boolean) ?? [] : []
  const series = (a: Analyte) => (env.tables?.['base.values']?.rows ?? []).filter((v) => codeOf(a) ? v.code === codeOf(a) : v.key === a.key).sort((x, y) => x.at.localeCompare(y.at))
  const rows = analytes.map((a) => {
    const old = was.find((x) => x.key === a.key); const struck = old && old.value?.value !== a.value?.value
    const value: ReactNode = a.value?.value ?? a.text ?? '—'
    const before = compact ? null : valueBefore(env, item.entry, (v) => codeOf(a) ? v.code === codeOf(a) : v.key === a.key)
    return { name: a.name ?? a.concept?.text ?? a.key, value: struck ? <><del className="me-1.5 font-normal text-faint"><span className="sr-only">was </span>{old.value?.value ?? old.text}</del><span className="sr-only">now </span>{value}</> : value,
      unit: a.value?.unit ?? null, flag: interp(a.interpretation), interp: a.interpretation ?? null, low: num(a.range?.low), high: num(a.range?.high), text: a.method ?? null,
      previous: before ? { value: before.value, at: before.at } : null, onOpen: !compact && series(a).length > 1 ? () => setTrend(trend === a.key ? null : a.key) : undefined }
  })
  const open = analytes.find((a) => a.key === trend)
  const unlabelled = !sections(d.conclusion)[0]?.label
  const by = [placeName(env, item.entry.department_id), personName(env, item.entry.author_id), d.performer, d.specimen && `specimen ${d.specimen}`].filter(Boolean).join(' · ')
  return <div className="grid gap-2">
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-14 font-semibold text-fg">{d.service?.name ?? d.code?.text ?? 'Result'}</span>
        {d.status && !(item.corrected && d.status === 'corrected') && <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{RESULT_STATUS[d.status] ?? d.status}</Badge>}</p>
      {by && <p className="text-12 text-faint">{by}</p>}
    </div>
    {rows.length > 0 && <div className="-mx-1 overflow-x-auto"><AnalyteTable dense={compact} showPrevious={!compact} rows={rows} /></div>}
    {open && <Trend analyte={open} points={series(open)} onOpen={env.onOpen} />}
    {d.conclusion && <div>{unlabelled && <p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">{rows.length ? 'Impression' : 'Report'}</p>}<Paragraphs text={d.conclusion} /></div>}
    <Files entryId={item.entry.id} files={d.attachments} />
  </div>
}

/** an analyte over time, inline under the table: the kit's LineChart (its Table shows every point without hover) */
function Trend({ analyte: a, points, onOpen }: { analyte: Analyte; points: { at: string; value: number; interpretation: string | null; entry_id: string }[]; onOpen?: (id: string) => void }) {
  const low = num(a.range?.low), high = num(a.range?.high); const unit = a.value?.unit ?? ''
  const name = a.name ?? a.concept?.text ?? a.key
  return <LineChart label={`${name}${low != null && high != null ? ` · normal ${low}–${high}` : ''} ${unit}`.trim()} unit={unit} band={{ low, high }}
    critical={{ low: num(a.critical?.low), high: num(a.critical?.high) }} onPoint={onOpen}
    points={points.map((p) => ({ at: p.at, value: p.value, flag: interp(p.interpretation), entryId: p.entry_id }))} />
}
