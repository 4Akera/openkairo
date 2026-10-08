// The anaesthesia pack's client (spec/openCare.md §5.7; the pictures #anaes-preop, #anaes-record, and Recovery's): the Anaesthesia
// section; /preop and its card (the airway, ASA, the scores typed before it, the medicines to stop, the plan, Fit or Not yet); the
// anaesthetic record, a tab of the operating department's; Recovery's line on each bay and its two buttons (Aldrete: the /score card in the patient's chart;
// Record: the patient's anaesthetic record). RCRI, STOP-BANG and Aldrete are the base's /score with the pack's declared tables.
import { compose } from '@core/hooks/composer'
import { registerRenderer } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { registerRowAction } from '@core/screens/rows'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { registerTileButton, registerTileLine } from '@core/screens/ward/tiles'
import { AnaesthesiaSection, operationsIn } from './Section'
import { PreopCard } from './Preop'
import { parsePreop, preopLine } from './preopLine'
import { AnaesRecord } from './Record'
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import { recoveryLine, setRecoveryReader } from './recovery'
import type { RecRow } from './model'
import { sawOps } from './seen'
import { preopAction } from './rowAction'
import { PreopView, RecordView } from './Views'

const TYPES = ['anaesthesia.preop', 'anaesthesia.record']
type OrderRow = Parameters<typeof operationsIn>[0][number]
registerSection({ key: 'anaesthesia.anaesthesia', title: 'Anaesthesia', types: TYPES, fit: ANYONE, Body: AnaesthesiaSection,
  has: (x) => x.own.shown.length > 0,
  word: (x) => { const ops = operationsIn((x.rec.tables['base.orders']?.rows ?? []) as OrderRow[], x.ctx.org?.services ?? [])
    sawOps(x.identity.id, ops.filter((o) => o.status !== 'revoked' && o.status !== 'completed').map((o) => ({ item: o.item, name: (o.service_name ?? 'Operation').replace(/\s*\(.*\)$/, ''), status: o.status, ordered_at: o.ordered_at })))
    const today = new Date().toISOString().slice(0, 10)
    return x.own.shown.some((e) => e.occurred_at.slice(0, 10) === today) ? { word: 'today' } : ops.length ? { word: 'for op' } : null } })
registerCommand({ name: 'preop', pack: 'anaesthesia', groupTitle: 'Anaesthesia', title: 'Pre-op assessment', label: 'The pre-op assessment: airway, ASA, the medicines to stop, the plan, fit or not yet',
  example: '/preop', action: 'write:anaesthesia.preop', writes: ['anaesthesia.preop'],
  parse: (rest, ctx) => parsePreop(rest, ctx), empty: (ctx) => { const r = parsePreop('', ctx); return r && 'ok' in r ? r.ok : [] } })
registerCard({ function: 'anaesthesia.preop', pack: 'anaesthesia', Editor: PreopCard, line: preopLine })
registerScreen('anaesthesia.record', AnaesRecord)
// the pre-op's ASA and verdict on a list's row where the department uses the pack (the operating list's Pre-op), its summary folded out
registerRowAction('anaesthesia', preopAction)

setRecoveryReader(async (deptId, patients) => (await read<TableRead<RecRow>>({ shape: 'table', table: 'anaesthesia.recovery', department_id: deptId, where: { patient_id: patients }, entries: false })).rows)
registerTileLine('anaesthesia', (row, ctx) => recoveryLine(row, ctx))
// Aldrete opens the patient's chart with the /score card on the line (the base's score; the server adds it up)
registerTileButton('anaesthesia', { label: 'Aldrete', path: (row) => { for (const ms of [500, 1200, 2500]) setTimeout(() => compose({ text: '/score aldrete ' }), ms); return `/visit/${row.item}` } })
registerTileButton('anaesthesia', { label: 'Record', path: (row) => `/patient/${row.patient_id}` })
// the pre-op and the anaesthetic record in the record, in the clinic's words (not the ids they are about)
registerRenderer('anaesthesia.preop', { Full: PreopView })
registerRenderer('anaesthesia.record', { Full: RecordView })
export const key = 'anaesthesia'
