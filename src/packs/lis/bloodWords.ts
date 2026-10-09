// The Blood bank's words on the line (spec/openCare.md §5.8, Q35, Q36): /blood, its order word, and /transfuse, the record at the bed. Pure:
// the note under /blood's card is handed in by the client.
import type { ReactNode } from 'react'
import { registerCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { parseBlood, parseTransfuse } from './blood'

export function registerBloodWords(note?: (items: Parsed[], ctx: Ctx) => ReactNode) {
  // the Blood bank (spec §5.8, Q35, Q36): /blood, its order word, wherever a department using the pack works for this one; /transfuse, the
  // record at the bed of one unit, offered the same way (core change C3: the ward gives blood without ticking the pack)
  registerCommand({ name: 'blood', pack: 'lis', orders: true, section: 'Blood bank', groupTitle: 'Blood bank', title: 'Blood', label: 'Blood — from the Blood bank',
    example: '/blood rbc 2 leuco kell ? thalassaemia programme · /blood plt 1 urgent', action: 'write:order', writes: ['order'],
    parse: (rest, ctx) => rest ? parseBlood(rest, ctx) : null, ...(note ? { note } : {}) })
  registerCommand({ name: 'transfuse', pack: 'lis', worksFor: true, groupTitle: 'Blood bank', title: 'Transfuse', label: 'Blood beside the patient — one unit, two who check, the signs',
    example: '/transfuse 26-118452 with Marwa Gaber checked', action: 'write:given', writes: ['lis.transfusion'], parse: (rest) => parseTransfuse(rest) })
}
