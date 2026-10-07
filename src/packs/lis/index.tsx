// The laboratory pack's client (spec/openCare.md §5.3; its key lis). Its screens stand in for the bench where the laboratory ticks the
// pack: Collect (tubes by colour, the sample number, collected or not and why) and Results (by section: ranges, flags, the change check,
// values worked out, a critical value's notice). Its walk-in step is the doctor's /order line with the six tests asked for most.
import { registerScreen } from '@core/screens/registry'
import { registerWalkInStep } from '@core/screens/bench/WhatFor'
import { Collect } from './Collect'
import { OrderStep } from './Step'
import { Results } from './Results'

registerScreen('lis.collect', Collect)
registerScreen('lis.results', Results)
registerWalkInStep('lis', OrderStep)
export const key = 'lis'
