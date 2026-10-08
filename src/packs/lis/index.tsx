// The laboratory pack's client (spec/openCare.md §5.3; its key lis). Its screens stand in for the bench where the laboratory ticks the
// pack: Collect (tubes by colour, the sample number, collected or not and why; with chairs, tickets called to a chair), Receive (a tab
// only where tubes are scanned in) and Results (by section: ranges, flags, the change check, values worked out, a critical value's
// notice; late rows, To check where a second person checks). Its walk-in step is the doctor's /order line with the six tests asked
// for most; its order word, /lab, is offered wherever the Laboratory works for a department (order.tsx).
import { registerScreen } from '@core/screens/registry'
import { registerWalkInStep } from '@core/screens/bench/WhatFor'
import { registerWords } from '@core/db/words'
import { Collect } from './Collect'
import { OrderStep } from './Step'
import { Receive } from './Receive'
import { Results } from './Results'
import { largeOf } from './large'
import './order'
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { parseBlood, parseTransfuse, transfusionLine, bedsideOf } from './blood'
import { BedsideCard, BloodNote } from './BloodCards'

registerScreen('lis.collect', Collect)
registerScreen('lis.receive', Receive, (dept, org) => largeOf(org, dept.id).scan_receive)
registerScreen('lis.results', Results)
registerWalkInStep('lis', OrderStep)
registerWords({ no_such_chair: 'This laboratory has no such chair: pick yours again', unknown_ticket: 'That ticket is not today\'s',
  called_elsewhere: 'Another chair called this patient a moment ago' })
// the Blood bank (spec §5.7, Q35, Q36): /blood, its order word, wherever a department using the pack works for this one; /transfuse, the
// bedside record of one unit, offered the same way (core change C3: the ward gives blood without ticking the pack)
registerCommand({ name: 'blood', pack: 'lis', orders: true, section: 'Blood bank', groupTitle: 'Blood bank', title: 'Blood', label: 'Blood — from the Blood bank',
  example: '/blood rbc 2 leuco kell ? thalassaemia programme · /blood plt 1 urgent', action: 'write:order', writes: ['order'],
  parse: (rest, ctx) => rest ? parseBlood(rest, ctx) : null, note: (items, ctx) => <BloodNote items={items} ctx={ctx} /> })
registerCommand({ name: 'transfuse', pack: 'lis', orders: true, groupTitle: 'Blood bank', title: 'Transfuse', label: 'Blood at the bedside — one unit, two who check, the signs',
  example: '/transfuse 26-118452', action: 'write:lis.transfusion', writes: ['lis.transfusion'], parse: (rest) => parseTransfuse(rest, '') })
registerCard({ function: 'lis.transfusion', pack: 'lis', Editor: BedsideCard, line: (q) => { const { b, ml } = bedsideOf(q); return transfusionLine(b, ml) } })
export const key = 'lis'
