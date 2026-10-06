// The base's four default screens (spec/openCare.md §4.6) under their declared keys: the desk checks in, a clinic works its queue, a
// bench its worklist, a ward its beds. A pack registers its own the same way (src/packs/<key>).
import { registerScreen } from './registry'
import { ReceptionScreen } from './Reception'
import { ClinicHome } from './clinic/ClinicHome'
import { Bench } from './bench/Bench'
import { BedBoard } from './ward/BedBoard'

registerScreen('base.desk', ReceptionScreen)
registerScreen('base.queue', ClinicHome)
registerScreen('base.bench', Bench)
registerScreen('base.beds', BedBoard)
