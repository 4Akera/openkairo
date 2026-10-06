// /design · Components, the board and the marks (spec/openCare.md §5.1 rule 4): one bed board for every ward, ICU, labour ward,
// dialysis unit and ER, drawn here with a made-up probe pack the department uses — its one line on each tile, its two buttons after
// the base's — and a queue row with a pack's mark. The probe is only this page's: nothing is registered, nothing is saved.
import { useState } from 'react'
import type { PresenceRow } from '../../db/types'
import { ListRow } from '../../ui'
import { marksOf, visitMarkRow, type MarkDef } from '../marks'
import { BedTile } from '../ward/Tile'
import { tileActions, tileLineOf, type ButtonDef, type LineDef, type TileCtx } from '../ward/tiles'
import { Group, Sample } from './Frame'
import { QUEUE } from './fixtures'

// the state colour is the one word's that carries it (MAP 62 low), never the line's
const LINES: LineDef[] = [{ pack: 'probe', line: (r) => r.urgent ? { words: ['Ventilated d2', 'NorAd 0.15', { text: 'MAP 62', tone: 'danger' }] } : { words: ['Room air', 'NEWS2 1'] } }]
const BUTTONS: ButtonDef[] = [{ pack: 'probe', key: 'probe:Obs', label: 'Obs', onClick: () => {} }, { pack: 'probe', key: 'probe:Wean', label: 'Wean', path: () => '/design', show: (r) => r.urgent }]
const MARKS: MarkDef[] = [{ pack: 'probe', mark: (row) => row.patient_id === '10001' ? { word: 'Obs due', tone: 'warn' } : { word: 'On probe' } }]
const row = (item: string, urgent: boolean) => ({ item, patient_id: item, urgent, reason: null }) as PresenceRow
const ctx = (day: number): TileCtx => ({ dept: { id: 'icu', packs: ['probe'] }, place: null, identity: null, day, can: () => true })
const BEDS = [
  { name: 'Bed 1', closed: false, row: row('a', true), who: { name: 'Demo Patient', sexAge: 'F 58', day: 3, clinician: 'Dr. Demo', reason: 'Pneumonia', urgent: true } },
  { name: 'Bed 2', closed: false, row: row('b', false), who: { name: 'Sample Person', sexAge: 'M 34', day: 1, clinician: null, reason: null, urgent: false } },
  { name: 'Bed 3', closed: false, row: null, who: null }, { name: 'Bed 4', closed: true, row: null, who: null }]

export function Board() {
  const [said, setSaid] = useState<string | null>(null)
  return <Group title="One board per place" hint="every ward, ICU, labour ward, dialysis unit and ER: the bed and who is in it (day, clinician), one line of the packs used here (a state colour only on words that carry a state), then the base's Admit here, Move, Discharge, always first, then at most two pack buttons">
    <Sample title="BedTile" note={said ?? 'a probe pack the department uses: its line and its two buttons'} className="grid w-full items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {BEDS.map((b) => { const taken = b.row ? { row: b.row, ctx: ctx(b.who?.day ?? 1) } : null
        return <BedTile key={b.name} name={b.name} closed={b.closed} who={b.who && { ...b.who, onOpen: () => setSaid(`Opens ${b.who.name}'s stay`) }}
          line={taken ? tileLineOf(LINES, taken.row, taken.ctx) : []} actions={tileActions(BUTTONS, b, taken, true)} onAction={(a) => setSaid(`${a.label} · ${b.name}`)} /> })}
    </Sample>
    <Sample title="The patient row with a pack's mark" note="one place on each row of the desk, the queue and the bench; one word a pack, from the packs used here" className="block">
      <ul className="overflow-hidden rounded-lg ring-1 ring-inset ring-line">{QUEUE.slice(0, 2).map((q) =>
        <ListRow key={q.number} number={q.number} name={q.name} age={q.age} status={q.status} who={q.who} minutes={q.minutes}
          marks={marksOf(MARKS, visitMarkRow({ id: String(q.number), patient: { id: String(q.number) }, orders: [] }), { list: 'queue', dept: { id: 'gp', packs: ['probe'] } })} />)}</ul>
    </Sample>
  </Group>
}
