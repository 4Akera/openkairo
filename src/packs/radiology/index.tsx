// The radiology pack's client (spec/openCare.md §5.5). Its screens stand in for the bench where Radiology ticks the pack: Scan (one list
// for every room, by kind; who and which side, pregnant at the door, before contrast, Scanned or why not) and Report (the radiologist's:
// templates, the last study of the same kind, findings and impression, a critical finding's notice, Sign). Its walk-in step is the
// doctor's line with the exams asked for most; its order words, /xr /us /ct /mri, are offered wherever Radiology works for a department
// (order.tsx), each carrying radiology's words on the order (its own order type).
import { registerScreen } from '@core/screens/registry'
import { registerWalkInStep } from '@core/screens/bench/WhatFor'
import { Scan } from './Scan'
import { Report } from './Report'
import { ExamStep } from './Step'
import './order'

registerScreen('radiology.scan', Scan)
registerScreen('radiology.report', Report)
registerWalkInStep('radiology', ExamStep)
export const key = 'radiology'
