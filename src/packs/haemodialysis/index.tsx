// The Dialysis pack's client (spec/openCare.md §5.6; its key haemodialysis, since the core already uses the word dialysis). The unit is
// the base's board with chairs: under them, who is due now from the standing schedule (the clinics' C5 rows), each with Start — the
// base's admission into a chair chosen inline, with the session begun in the same Done — and Missed (the session not done, "Did not
// come"); on each chair's tile, the session's time left, the last blood pressure and a chair that does not fit the patient's HBV or HCV
// isolation, the fluid taken off of the fluid to take off, the event of the last hour and a gain over 4 % of the dry weight, read once
// per board (C7's read), with Readings, which opens the Session tab at that chair, and End, which opens it at End. The Schedule tab: the
// standing schedule one shift at a time, this week or next, with Add a patient, a session moved one-off, a slot ended, and the
// patient's standing prescription. The Session tab: Before and the fluid to take off, the prescription, the machine readings, events,
// the unit's drugs, End with the base's Discharge. The banner: "off 1.4 of 2.8 L" while the session is on. Chosen by Claude at the
// owner's request, awaiting the owner.
import { oneSet } from '@core/db/entries'
import { registerWords, write } from '@core/db/rpc'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerBoardRows } from '@core/screens/ward/rows'
import { registerTileButton, registerTileLine } from '@core/screens/ward/tiles'
import { sessionBanner } from './banner'
import { tileWords } from './board'
import { missedEntry, missedShows, startEntries } from './due'
import { refreshDue, useBoard, useDue } from './hooks'
import { Schedule } from './Schedule'
import { Session } from './SessionTab'
import { REFUSALS } from './words'

registerScreen('haemodialysis.schedule', Schedule)
registerScreen('haemodialysis.session', Session)
registerBoardRows('haemodialysis', { title: 'Due now · from the schedule', view: 'Due, not started', useRows: useDue, start: startEntries,
  buttons: [{ label: 'Missed', show: (r, ctx) => ctx.can('write:haemodialysis.session') && missedShows(r, Date.now()),
    onClick: async (r, ctx) => { await write(oneSet([missedEntry(r, ctx.dept.id)])); refreshDue() } }] })
// the tile's words from the board's read (C7: the board calls useBoard once per board)
registerTileLine('haemodialysis', (row, ctx) => tileWords(row, ctx, ctx.read, Date.now()), useBoard)
// the chair's session on the Session tab
registerTileButton('haemodialysis', { label: 'Readings', show: (row, ctx) => row.kind === 'stay' && ctx.can('write:haemodialysis.reading'),
  path: (row) => `/?tab=haemodialysis.session&stay=${row.item}` })
registerTileButton('haemodialysis', { label: 'End', show: (row, ctx) => row.kind === 'stay' && ctx.can('write:discharged'),
  path: (row) => `/?tab=haemodialysis.session&stay=${row.item}&card=end` })
// the banner's word while the session is on (only where the department uses the pack)
registerBannerWords({ key: 'haemodialysis.session', types: ['haemodialysis.session', 'haemodialysis.reading'], words: sessionBanner })
registerWords(REFUSALS)
export const key = 'haemodialysis'
