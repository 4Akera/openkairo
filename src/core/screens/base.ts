// The base's four default screens (spec/openCare.md §4.6) under their declared keys: the desk checks in, a clinic works its queue, a
// bench its worklist, a ward its beds. A pack registers its own the same way (src/packs/<key>). And the base's printout: the
// prescription on A5, from the chart (§3.13 Printing).
import { registerScreen } from './registry'
import { registerPrintout } from '../print/registry'
import { PrescriptionSheet } from './chart/print/PrescriptionSheet'
import type { RxSheet } from './chart/model/prescription'
import { ReceptionScreen } from './Reception'
import { ClinicHome } from './clinic/ClinicHome'
import { Bench } from './bench/Bench'
import { BedBoard } from './ward/BedBoard'

registerScreen('base.desk', ReceptionScreen)
registerScreen('base.queue', ClinicHome)
registerScreen('base.bench', Bench)
registerScreen('base.beds', BedBoard)
registerPrintout<RxSheet>('base.prescription', { paper: 'a5', Component: PrescriptionSheet })
