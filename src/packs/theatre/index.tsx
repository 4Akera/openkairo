// The theatre pack's client (spec/openCare.md §5.8; the pictures #surg-clinic, #theatre-list, #theatre-checklist): /op, the operation
// as an order to the Theatre (its card under the line: the side big, the chips, the record's facts, the risks told), offered wherever
// the Theatre works for the department; the theatre list in place of the bench, with the WHO checklist on each case.
import { registerRenderer } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { registerCommand } from '@core/screens/visit/commands'
import { TheatreList } from './List'
import { OpNote } from './OpNote'
import { parseOp } from './line'
import { CheckView } from './CheckView'
import { registerPrintout } from '@core/print/registry'
import { CONSENT_KEY, ConsentSheet, LIST_KEY, OpListSheetView, type ConsentForm, type OpListSheet } from './printout'

registerScreen('theatre.list', TheatreList)
// the operating list and the consent form, printed (built 2026-10-10)
registerPrintout<OpListSheet>(LIST_KEY, { paper: 'a5', Component: OpListSheetView })
registerPrintout<ConsentForm>(CONSENT_KEY, { paper: 'a5', Component: ConsentSheet })
registerCommand({ name: 'op', pack: 'theatre', orders: true, groupTitle: 'Theatre', title: 'Operation', label: 'An operation — to the Theatre',
  example: '/op lichtenstein right · /op lap chole urgent admitted', action: 'write:order', writes: ['order'],
  parse: (rest, ctx) => parseOp(rest, ctx), note: (items, ctx) => <OpNote items={items} ctx={ctx} /> })
// a part of the WHO checklist in the record: what was said, by whom, the counts (not the ids it is about)
registerRenderer('theatre.check', { Full: CheckView })
export const key = 'theatre'
