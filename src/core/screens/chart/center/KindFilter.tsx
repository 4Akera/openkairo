// The kind filter (chart-plan.md §3.2, design-system.md §4.5): All · Notes · Results · Vitals · Medicines · Orders · Problems · … with
// what the center holds of each; a kind with nothing is left out (unless it is the one chosen) — every kind where the filter narrows
// the read itself (the Whole record). ←/→ move along it; [ and ] from anywhere (ChartScreen's one listener reads the chips shown
// here). Kept in the URL (?kind=).
import { useEffect } from 'react'
import { Tabs } from '../../../ui'
import { useChart, type KindOrAll } from '../context'
import { KINDS, type Kind } from '../model/items'
import { KIND_WORD } from '../model/labels'

export function KindFilter({ counts, every }: { counts: Partial<Record<Kind | 'all', number>>; every?: boolean }) {
  const c = useChart()
  const shown: KindOrAll[] = ['all', ...KINDS.filter((k) => every || (counts[k] ?? 0) > 0 || k === c.kind)]
  const key = shown.join(' ')
  const { showKinds } = c
  useEffect(() => showKinds(key.split(' ') as KindOrAll[]), [key, showKinds])
  if (!every && !counts.all && c.kind === 'all') return null
  return <Tabs variant="pill" aria-label="Show only (the [ and ] keys)" value={c.kind} onChange={c.setKind} className="gap-0.5"
    tabs={shown.map((k) => ({ id: k, label: KIND_WORD[k], count: counts[k] }))} />
}
