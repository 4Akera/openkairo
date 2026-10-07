// The shared bench's walk-in (owner, 2026-10-07: every bench takes walk-ins; the card in two steps, shape C): first who — one big
// search by name, phone or record number, with New patient — then what for — this room's services as big buttons (a pack may put
// its own typing box first: the lab's /order, the pharmacy's /rx) — with who asked folded. Typing the patient and ↵ goes straight
// to the second step, so the keys alone do it. An ECG room with no pack shows it here.
import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Kbd, ListRow, ScreenFrame, Tag, type ScreenView } from '@core/ui'
import { App, Label } from './kit'

const noop = () => undefined
const views: ScreenView<string>[] = [{ id: 'todo', label: 'To do', count: 3, needs: 'warn' }, { id: 'doing', label: 'In progress', count: 1 }, { id: 'done', label: 'Done today', count: 14 }]
export const found = [['10071', 'Nadia Hassan', '45 F', '0111 908 7766', 'last here 12 Sep'], ['10088', 'Nadia Hassan Ali', '67 F', '0111 908 2211', 'never here']]

/** the walk-in card in two steps: who (left), then what for (right); each pack fills the second step, the first is always the same */
export function WalkInSteps({ query, people, picked, what, asked, start }: { query: string; people: string[][]; picked: [string, string]; what: ReactNode
  asked?: string; start: string }) {
  return <div className="grid gap-3 md:grid-cols-2">
    <Card className="grid content-start gap-2 p-4 ring-1 ring-accent-line">
      <div className="flex items-center gap-2"><Label>First · who</Label><span className="text-12 text-faint">name, phone or record number</span>
        <button type="button" className="ms-auto inline-flex items-center gap-1 text-faint"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
      <Input value={query} readOnly className="h-11 text-16" />
      <ul className="grid">{people.map(([n, name, age, phone, last], i) => <li key={n} className={i === 0 ? 'rail flex items-center gap-3 rounded-md bg-hover px-3 py-2' : 'flex items-center gap-3 px-3 py-2'}>
        <span className="font-mono text-12 text-faint">{n}</span><span className="text-14 font-medium text-fg">{name}</span><span className="text-12 text-muted">{age} · {phone}</span>
        <span className="ms-auto text-12 text-faint">{last}</span>{i === 0 && <Kbd className="text-accent">↵</Kbd>}</li>)}
        <li className="flex items-center gap-2 px-3 py-2 text-13 text-accent"><Plus className="size-4" />New patient<span className="text-12 text-faint">— the desk's card, here</span></li></ul>
    </Card>
    <Card className="grid content-start gap-3 p-4 ring-1 ring-accent-line">
      <div className="flex items-center gap-2"><Label>Then · what for</Label><span className="ms-auto text-13"><b className="font-medium text-fg">{picked[0]}</b> <span className="text-muted">{picked[1]}</span>
        <button type="button" className="ms-1 text-12 text-accent">change</button></span></div>
      {what}
      {asked ? <div className="flex flex-wrap items-center gap-2"><span className="text-13 text-muted">Asked by</span><Input readOnly value={asked} className="w-full sm:w-72" /><span className="text-12 text-faint">optional</span></div>
        : <button type="button" className="justify-self-start text-13 text-accent">+ Who asked (optional)</button>}
      <div className="flex items-center gap-2"><Button>{start}<Kbd className="ms-1">↵</Kbd></Button><span className="text-12 text-faint">It joins To do like any order; it stays in the record.</span></div>
    </Card>
  </div>
}

export function BenchWalkIn() {
  return <App dept="ECG room" user="Sara Mahmoud">
    <ScreenFrame views={views} view="todo" onView={noop} search={<Input placeholder="Scan or type: record number or name" className="w-full sm:w-72" readOnly />}
      action={<Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>}>
      <WalkInSteps query="0111 908" people={found} picked={['Nadia Hassan', '45 F']} start="Start · ECG"
        what={<div className="grid grid-cols-3 gap-2">{([['ECG', '10 min', true], ['Echo', '20 min', false], ['Holter', '24 h', false]] as const).map(([x, t, on]) =>
          <button key={x} type="button" className={on ? 'grid h-20 place-content-center rounded-lg bg-accent-soft text-center ring-2 ring-accent' : 'grid h-20 place-content-center rounded-lg bg-surface text-center ring-1 ring-line'}>
            <span className="text-16 font-semibold text-fg">{x}</span><span className="text-12 text-muted">{t}</span></button>)}</div>} />
      <Card><ul>
        <ListRow number="10019" name="Omar Khaled" age="61 M" status={<><Tag tone="danger">stat</Tag><span className="truncate">ECG</span></>} who="General Practice" minutes={5} />
        <ListRow number="10063" name="Hany Lotfy" age="58 M" status={<><Tag tone="info">walk-in</Tag><span className="truncate">ECG, Echo</span></>} who="Dr. Hany Saleh · outside" minutes={9} />
        <ListRow number="10044" name="Hoda Samy" age="63 F" status={<><Tag>at the ward</Tag><span className="truncate">ECG</span></>} who="Medical Ward · Bed 3" minutes={22} />
      </ul></Card>
    </ScreenFrame>
  </App>
}
