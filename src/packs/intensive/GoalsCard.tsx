// The daily goals at the round (spec/openCare.md §5.6, piece I2): FAST HUGS BID as chips (a second click clears; the trial off the
// ventilator only while ventilated), the lines with their keep or remove, the targets (MAP at least, the day's fluid balance) and the
// goals in the doctor's words.
import { Card, Chip, Input, NumberInput, Textarea } from '@core/ui'
import { GOALS, goalsMissing, type GoalsDraft } from './goals'
import { Lines, type LinesProps } from './Lines'

export function GoalsCard({ d, set, ventilated, lines }: { d: GoalsDraft; set: (f: (x: GoalsDraft) => GoalsDraft) => void; ventilated: boolean
  lines: Omit<LinesProps, 'decisions' | 'onDecide'> | null }) {
  const num = (s: string | undefined) => s && s.trim() && Number.isFinite(Number(s)) ? Number(s) : null
  return <Card role="group" aria-label="Daily goals" className="grid content-start gap-3 p-4">
    <span className="text-13 font-medium text-fg">Daily goals · ward round</span>
    <div className="grid gap-1.5">{GOALS.filter(([k]) => k !== 'wean' || ventilated).map(([k, label, options]) =>
      <div key={k} className="flex flex-wrap items-center gap-1.5">
        <span className="w-44 shrink-0 text-12 text-muted">{label}</span>
        {options.map(([v, words]) => <Chip key={v} on={d[k] === v} onClick={() => set((x) => ({ ...x, [k]: x[k] === v ? undefined : v }))}>{words}</Chip>)}
      </div>)}</div>
    {lines && <Lines {...lines} decisions={d.lines} onDecide={(item, v) => set((x) => { const next = { ...x.lines }; if (v) next[item] = v; else delete next[item]; return { ...x, lines: next } })} />}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-1.5 text-12 text-muted">MAP at least
        <NumberInput label="MAP at least" integer dense value={num(d.mapTarget)} onValue={(n) => set((x) => ({ ...x, mapTarget: n === null ? undefined : String(n) }))} className="w-20" />mmHg</label>
      <label className="flex items-center gap-1.5 text-12 text-muted">Fluid balance today
        {/* a balance is often below 0, which a NumberInput does not take */}
        <Input aria-label="Fluid balance today" inputMode="numeric" dense placeholder="−500" value={d.balanceTarget ?? ''}
          aria-invalid={goalsMissing({ lines: {}, balanceTarget: d.balanceTarget, text: 'x' }) !== null || undefined}
          onChange={(e) => set((x) => ({ ...x, balanceTarget: e.target.value }))} className="w-24 text-end tnum" />mL</label>
    </div>
    <Textarea aria-label="Goals today" placeholder="Goals today" minRows={2} value={d.text ?? ''} onChange={(e) => set((x) => ({ ...x, text: e.target.value }))} />
  </Card>
}
