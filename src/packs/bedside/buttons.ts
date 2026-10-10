// Ward nursing's two buttons on a tile (spec/openCare.md §5.6; the ward's, the children's ward's, the day unit's and the labour ward's pictures): Give, the
// Drug round on that stay only; Obs, the stay's chart with the base's /v on the composer's line (on a ward using the pack /v also writes
// NEWS2, the owner's C3). Both on an admitted stay, each for whoever may write it here. Where another pack the department uses comes first
// in its pack order and brings its own two (the ER, the ICU and CCU, Recovery; the labour ward while she is in labour), these do not
// show: a tile holds two pack buttons. Obs added 2026-10-10 (chosen by Claude at the owner's request: the plan's piece 4 deferred it,
// the pictures draw it). Pure: npm run test:bedside.
import { compose } from '@core/hooks/composer'
import type { PresenceRow } from '@core/db/types'
import type { TileButtonIn, TileCtx } from '@core/screens/ward/tiles'

const admitted = (row: PresenceRow) => row.kind === 'stay' && row.state === 'admitted'
export const giveButton: TileButtonIn = { label: 'Give', show: (row, ctx) => admitted(row) && ctx.can('write:bedside.dose'),
  path: (row) => `/?tab=bedside.round&stay=${row.item}` }
/** the chart opens on the stay; the composer, mounted with it, takes /v as soon as it is there (as Recovery's Aldrete button opens /score) */
export const obsButton: TileButtonIn = { label: 'Obs', show: (row: PresenceRow, ctx: TileCtx) => admitted(row) && ctx.can('write:vitals'),
  path: (row) => { for (const ms of [500, 1200, 2500]) setTimeout(() => compose({ text: '/v ' }), ms); return `/visit/${row.item}` } }
