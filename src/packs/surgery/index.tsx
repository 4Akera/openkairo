// The surgery pack's client (spec/openCare.md §5.7; the pictures #surg-clinic, #surg-opnote): the Surgery section and its banner words
// ("for op · …" while an operation waits, "op today · …"), and /opnote with its card — the base's procedure and the pack's operation
// note, from the surgeon's template, the times and the specimen read from the record.
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { surgeryWords, templatesOf, type OrderLike } from './model'
import { parseOpnote } from './line'
import { OpNoteCard, SurgerySection, opNoteCardLine, opsOf } from './Parts'
import { saw, seen } from './seen'

const TYPES = ['surgery.opnote']
const ordersIn = (rec: { tables: { 'base.orders'?: { rows: unknown[] } } }) => (rec.tables['base.orders']?.rows ?? []) as OrderLike[]
registerSection({ key: 'surgery.surgery', title: 'Surgery', types: TYPES, fit: ANYONE, Body: SurgerySection,
  has: (x) => x.own.shown.length > 0 || opsOf(ordersIn(x.rec), x.ctx.org?.services ?? []).length > 0,
  word: (x) => { const orders = ordersIn(x.rec); saw(x.identity.id, orders, x.ctx.org?.services, templatesOf(x.ctx.org))
    const today = new Date().toISOString().slice(0, 10)
    if (x.own.shown.some((e) => e.occurred_at.slice(0, 10) === today)) return { word: 'today' }
    const before = (x.facts ?? []).filter((e) => e.type === 'procedure' && !e.hidden && e.occurred_at.slice(0, 10) !== today).length
    return before ? { word: `${before} before` } : opsOf(orders, x.ctx.org?.services ?? []).length ? { word: 'planned' } : null },
  summary: (x) => { const w = surgeryWords(ordersIn(x.rec), x.ctx.org?.services ?? [], [], new Date().toISOString().slice(0, 10)); return w[0] ?? null } })
registerBannerWords({ key: 'surgery.op', types: TYPES, words: (x) => { const today = new Date().toISOString().slice(0, 10)
  const notes = x.own.shown.filter((e) => e.occurred_at.slice(0, 10) === today).map((e) => String((e.data?.surgery as { operation?: string } | undefined)?.operation ?? ''))
  return surgeryWords(ordersIn(x.rec), x.ctx.org?.services ?? [], notes, today).map((word, i) => ({ word, rank: i + 1 })) } })

registerCommand({ name: 'opnote', pack: 'surgery', groupTitle: 'Surgery', title: 'Operation note', label: 'The operation note: the procedure, findings, steps, closure, drain, complications',
  example: '/opnote', action: 'write:surgery.opnote', writes: ['procedure', 'surgery.opnote'],
  parse: (rest, ctx) => parseOpnote(rest, ctx, seen(ctx.record?.patient?.id)),
  empty: (ctx) => { const r = parseOpnote('', ctx, seen(ctx.record?.patient?.id)); return r && 'ok' in r ? r.ok : [] } })
registerCard({ function: 'surgery.opnote', pack: 'surgery', Editor: OpNoteCard, line: opNoteCardLine })
export const key = 'surgery'
