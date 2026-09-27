// /design · Charts (design-system.md §4.3): Stat, Sparkline and LineChart on made-up values. A flag shows in a point's shape as
// well as its colour (filled normal, hollow abnormal, a larger filled critical with ‼), every value is reachable without hover
// (the Table view), and the arrow keys move along the line. A trend is ↗ ↘ →, never the flag arrows.
import { useState } from 'react'
import { Check } from 'lucide-react'
import { LineChart, Sparkline, Stat } from '../../ui'
import { Columns, Group, Sample } from './Frame'
import { HBA1C, HBA1C_BAND, POTASSIUM, POTASSIUM_BAND, POTASSIUM_CRITICAL, WEIGHT } from './fixtures'

const series = (p: typeof HBA1C) => p.map((x) => x.value).join(', ')

export function Charts({ side }: { side: boolean }) { return <Columns side={side}><Body /></Columns> }

function Body() {
  const [opened, setOpened] = useState<string | null>(null)
  const last = HBA1C[HBA1C.length - 1], before = HBA1C[HBA1C.length - 2]
  return <div className="grid gap-6">
    <Group title="Stat" hint="one number with its context: the flag as tone and glyph, the value before as a trend, a sparkline">
      <div className="grid gap-5 sm:grid-cols-2">
        <Stat label="HbA1c" value={last.value} unit="%" flag="high" previous={{ value: before.value, at: before.at }} />
        <Stat label="Potassium" value={6.8} unit="mmol/L" flag="critical" previous={{ value: 4.9, at: POTASSIUM[1].at }} />
        <Stat size="sm" label="Weight" value={80.4} unit="kg" previous={{ value: 81.2, at: WEIGHT[2].at }} trend={WEIGHT} />
        <Stat size="sm" label="HbA1c, click it" value={last.value} unit="%" flag="high" trend={HBA1C} band={HBA1C_BAND} onClick={() => setOpened('HbA1c trend')} title="Open the trend" />
      </div>
    </Group>
    <Group title="Sparkline" hint="a bare mark beside a value: the band, the line, the last point in its flag's colour; fewer than 2 points draw nothing">
      <Sample title="In range, then high" note={series(HBA1C)}><Sparkline points={HBA1C} band={HBA1C_BAND} label={`HbA1c ${series(HBA1C)} %`} /></Sample>
      <Sample title="Critical, then back" note={series(POTASSIUM)}><Sparkline points={POTASSIUM} band={POTASSIUM_BAND} label={`Potassium ${series(POTASSIUM)} mmol/L`} /></Sample>
      <Sample title="Last one critical" note="4.8, 5.6, 6.8"><Sparkline points={POTASSIUM.slice(1, 4)} band={POTASSIUM_BAND} label="Potassium 4.8, 5.6, 6.8 mmol/L" /></Sample>
      <Sample title="No band, larger" note="weight"><Sparkline points={WEIGHT} width={120} height={32} label={`Weight ${WEIGHT.map((w) => w.value).join(', ')} kg`} /></Sample>
      <Sample title="One point" note="draws nothing: the value says enough"><Sparkline points={WEIGHT.slice(0, 1)} label="Weight 84 kg" /><span className="text-12 text-faint">(nothing drawn)</span></Sample>
    </Group>
    <Group title="LineChart" hint="the trend opened from a result: hover it, or Tab to it and use ←/→, Home, End; Enter opens the entry; Table shows the same points">
      <LineChart label="HbA1c · normal 4.0–5.6 %" unit="%" points={HBA1C} band={HBA1C_BAND} onPoint={(id) => setOpened(`entry ${id}`)} />
      <LineChart label="Potassium · critical limits 2.8 and 6.2" unit="mmol/L" points={POTASSIUM} band={POTASSIUM_BAND} critical={POTASSIUM_CRITICAL} onPoint={(id) => setOpened(`entry ${id}`)} />
      <LineChart label="Potassium, as a table" unit="mmol/L" points={POTASSIUM} band={POTASSIUM_BAND} showTable />
      {opened && <p role="status" className="flex items-center gap-1.5 text-12 text-ok"><Check aria-hidden className="size-3.5" />Would open {opened} (a sample: nothing is read)</p>}
    </Group>
  </div>
}
