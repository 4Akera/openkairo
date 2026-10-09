// The laboratory pack's client (spec/openCare.md §5.3; its key lis). Its screens stand in for the bench where the laboratory ticks the
// pack: Collect (tubes by colour, the sample number, collected or not and why; with chairs, tickets called to a chair), Receive (a tab
// only where tubes are scanned in) and Results (by section: ranges, flags, the change check, values worked out, a critical value's
// notice; late rows, To check where a second person checks). Its walk-in step is the doctor's /order line with the six tests asked
// for most; its order word, /lab, is offered wherever the Laboratory works for a department (order.tsx). Its printout: the specimen
// labels, one a tube on the core's label paper, printed at Collected where its Sample labels setting says printed (§3.13 Printing).
import { registerScreen } from '@core/screens/registry'
import { registerWalkInStep } from '@core/screens/bench/WhatFor'
import { registerWords } from '@core/db/words'
import { registerPrintout } from '@core/print/registry'
import { Collect } from './Collect'
import { OrderStep } from './Step'
import { Receive } from './Receive'
import { Results } from './Results'
import { largeOf } from './large'
import { LabelSheet } from './LabelSheet'
import type { Label } from './labels'
import './order'
import { registerCard } from '@core/screens/visit/commands'
import { transfusionLine, bedsideOf } from './blood'
import { registerBloodWords } from './bloodWords'
import { BedsideCard, BloodNote } from './BloodCards'

registerScreen('lis.collect', Collect)
registerScreen('lis.receive', Receive, (dept, org) => largeOf(org, dept.id).scan_receive)
registerScreen('lis.results', Results)
registerWalkInStep('lis', OrderStep)
registerPrintout<Label[]>('lis.labels', { paper: 'label', Component: LabelSheet })
registerWords({ no_such_chair: 'This laboratory has no such chair: pick yours again', unknown_ticket: 'That ticket is not today\'s',
  called_elsewhere: 'Another chair called this patient a moment ago' })
registerBloodWords((items, ctx) => <BloodNote items={items} ctx={ctx} />)
registerCard({ function: 'lis.transfusion', pack: 'lis', Editor: BedsideCard, line: (q) => { const { b, ml } = bedsideOf(q); return transfusionLine(b, ml) } })
export const key = 'lis'
