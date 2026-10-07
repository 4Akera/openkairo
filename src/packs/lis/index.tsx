// The laboratory pack's client (spec/openCare.md §5.3; its key lis). Its screens stand in for the bench where the laboratory ticks the
// pack: Collect (tubes by colour, the sample number, collected or not and why) and Results (for now the bench's patient pages; results
// by section come next). Its walk-in step is the doctor's /order line with the six tests asked for most.
import { registerScreen } from '@core/screens/registry'
import { Bench } from '@core/screens/bench/Bench'
import { registerWalkInStep } from '@core/screens/bench/WhatFor'
import { Collect } from './Collect'
import { OrderStep } from './Step'

registerScreen('lis.collect', Collect)
registerScreen('lis.results', Bench)
registerWalkInStep('lis', OrderStep)
export const key = 'lis'
