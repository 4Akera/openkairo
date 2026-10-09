// Vitals (chart-plan.md §1.3, design-system.md §4.5): a row of tiles, BP together, each with its unit and the reading before it
// (base.values), the change as ↗ ↘ →. No flag and no flag colour: vitals carry no interpretation anywhere (the shape has none,
// base.values_refresh writes null), so a tile never claims high or low (build plan D9). ACVPU and air or oxygen in words, FiO₂ as a
// percentage (the owner's Q5). The oxygen device, method and site quiet under the tiles.
import type { EntryData, Quantity } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { Stat } from '../../../ui'
import { unitOf } from '../model/values'
import { ACVPU, deviceWords } from '../../visit/vitals'
import { useBlockEnv, valueBefore } from './env'

// the tiles in the order the chart reads them (labels.ts VITALS keys)
const TILES: [keyof EntryData['vitals'], string][] = [['hr', 'HR'], ['rr', 'RR'], ['temp', 'T'], ['spo2', 'SpO₂'], ['weight', 'Wt'], ['height', 'Ht'], ['bmi', 'BMI'],
  ['pain', 'Pain'], ['glucose', 'Glucose'], ['head', 'Head']]
const unit = (q: Quantity) => unitOf({ unit: q.unit ?? null, ucum: q.ucum ?? null })

export function Vitals({ item, data, compact }: BlockProps) {
  const env = useBlockEnv(); const d = data as EntryData['vitals']
  const before = (key: string) => compact ? null : valueBefore(env, item.entry, (v) => v.key === key)
  const tiles: { key: string; label: string; value: string; unit: string | null; previous: { value: string; at: string } | null }[] = []
  if (d.bp) {
    const was = before('bp.sys'); const dia = was && env.tables?.['base.values']?.rows.find((v) => v.entry_id === was.entry_id && v.key === 'bp.dia')
    tiles.push({ key: 'bp', label: 'BP', value: `${d.bp.sys.value}/${d.bp.dia.value}`, unit: 'mmHg', previous: was ? { value: dia ? `${was.value}/${dia.value}` : `${was.value}`, at: was.at } : null })
  }
  const o = d.oxygen
  for (const [key, label] of TILES) {
    const q = d[key] as Quantity | undefined
    if (q?.value) { const was = before(key); tiles.push({ key, label, value: q.value, unit: unit(q), previous: was ? { value: `${was.value}`, at: was.at } : null }) }
    // after RR, ACVPU in words; after SpO₂, air or oxygen (its flow) and FiO₂ (the owner's Q5)
    if (key === 'rr' && d.consciousness) tiles.push({ key: 'acvpu', label: 'ACVPU', value: ACVPU[d.consciousness], unit: null, previous: null })
    if (key === 'spo2' && o) {
      const was = o.flow?.value ? before('oxygen.flow') : null
      tiles.push({ key: 'oxygen', label: 'O₂', value: o.on === 'air' ? 'Air' : o.flow?.value ?? 'Oxygen', unit: o.on === 'oxygen' && o.flow?.value ? 'L/min' : null,
        previous: was ? { value: `${was.value}`, at: was.at } : null })
      if (o.on === 'oxygen' && o.fio2?.value) { const f = before('oxygen.fio2'); tiles.push({ key: 'fio2', label: 'FiO₂', value: o.fio2.value, unit: '%', previous: f ? { value: `${f.value}`, at: f.at } : null }) }
    }
  }
  const device = o?.on === 'oxygen' ? deviceWords(o.device) : null
  return <div className="grid gap-2">
    {tiles.length > 0 && <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
      {tiles.map((t) => <Stat key={t.key} size="sm" label={t.label} value={t.value} unit={t.unit} previous={t.previous} />)}</div>}
    {(device || d.method || d.site) && <p className="text-12 text-faint">{[device && device.charAt(0).toUpperCase() + device.slice(1), d.method, d.site].filter(Boolean).join(' · ')}</p>}
    {d.note && <p className="text-13 text-muted">{d.note}</p>}
  </div>
}
