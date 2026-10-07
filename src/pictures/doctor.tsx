// What the doctor sees of both packs (owner, 2026-10-07: the pharmacy's question goes to the chart and to To review, not the queue —
// the pharmacy gets a prescription after Done, when the patient has left the doctor's queue): To review holds the pharmacy's
// questions beside the results to review; a line opens the chart, where the question is a card above the line. A queue mark only
// for a patient still on the queue.
import { MessageSquare } from 'lucide-react'
import { Button, Card, Input, ListSection, ScreenFrame, Tag, cn, type ScreenView, type Tone } from '@core/ui'
import { App, Label } from './kit'

const noop = () => undefined
const views: ScreenView<string>[] = [{ id: 'queue', label: 'Queue', count: 6 }, { id: 'review', label: 'To review', count: 4, needs: 'danger' }]
const items: [string, Tone, string, string, string, string][] = [
  ['Gamal Eid', 'warn', 'pharmacy asks', 'Penicillin allergy recorded (rash). Change Augmentin 1 g?', 'Dr. Reem Hamdy · 10:31', 'Answer'],
  ['Omar Khaled', 'danger', 'critical', 'Potassium 6.9 mmol/L ‼ · Creatinine 3.9 ↑', 'released 10:42 · Karim Fawzy', 'Reviewed'],
  ['Salma Fathy', 'warn', 'pharmacy asks', 'Augmentin 457 for 24 kg: written 10 ml twice a day, usual 5 ml. Confirm?', 'Dr. Reem Hamdy · 10:12', 'Answer'],
  ['Ahmed Tarek', 'info', 'patient not seen', 'Urine analysis · pus cells 20–25 /HPF ↑', 'left before the result', 'Reviewed'],
]
export function DoctorSide() {
  return <App dept="General Practice" user="Dr. Ali Hassan">
    <ScreenFrame views={views} view="review" onView={noop} search={<Input placeholder="Record number or name" className="w-full sm:w-72" readOnly />}>
      <Card className="overflow-hidden ring-1 ring-danger-line"><ul>
        <ListSection title="To review" count={items.length} />
        {items.map(([name, tone, why, line, by, act], i) => <li key={name} className={cn('flex items-center gap-3 border-t border-line px-4 py-2 text-13', i === 0 && 'rail bg-hover')}>
          <span className="w-36 shrink-0 truncate font-medium text-fg">{name}</span><Tag tone={tone}>{why}</Tag>
          <span className={cn('min-w-0 flex-1 truncate', tone === 'danger' ? 'font-semibold text-danger' : 'text-fg')}>{line}</span>
          <span className="shrink-0 text-12 text-faint">{by}</span>
          <Button size="sm" variant={act === 'Answer' ? 'outline' : 'ghost'}>{act}</Button></li>)}
      </ul></Card>
      <Label className="pt-2">Answer opens Gamal Eid's chart: the question is a card above the line</Label>
      <Card className="grid gap-2 p-4 ring-1 ring-warn">
        <p className="flex flex-wrap items-center gap-2 text-13"><MessageSquare className="size-4 text-warn" /><b className="font-semibold text-fg">The pharmacy asks</b>
          <span className="text-muted">Dr. Reem Hamdy · 10:31 · about Augmentin 1 g, 1 tablet twice a day · 7 days</span></p>
        <p className="text-14 text-fg">Penicillin allergy recorded (rash). Change Augmentin 1 g?</p>
        <div className="flex flex-wrap items-center gap-2"><Input readOnly value="/rx azithromycin 500 od 3d" className="w-full max-w-sm font-mono" />
          <Button size="sm">Change</Button><Button size="sm" variant="ghost">Give it anyway</Button></div>
        <p className="text-12 text-faint">The answer goes back to the pharmacy's row at once (the old line stopped, the new one sent) and leaves To review.
          Any doctor in General Practice may answer when Dr. Ali is away.</p>
      </Card>
    </ScreenFrame>
  </App>
}
