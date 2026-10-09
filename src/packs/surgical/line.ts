// /opnote on the composer's line (spec/openCare.md §5.8, Q46; the picture #surg-opnote): in the operating room, after the operation. Two drafts:
// the base's procedure (what, done, today) and the pack's operation note (extending the base's note), started from the surgeon's
// template for this operation; the card fills the times, the anaesthetic and blood loss from the anaesthetic record and the specimen
// and implants from Sign out. "#postop …" on the next line brings the surgeon's post-op preset (the base's), each line removable. Pure.
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { OPEN, isOperation, noteLine, noteText, templateFor, type OpNote, type OrderLike, type ServiceLike, type Template } from './model'

export function parseOpnote(_rest: string, ctx: Ctx, seen: { orders: OrderLike[]; services: ServiceLike[]; templates: Template[] }): Result {
  const today = (ctx.now ?? new Date()).toISOString().slice(0, 10)
  const ops = seen.orders.filter((o) => isOperation(o, seen.services)).sort((a, b) => (b.last_at ?? b.ordered_at).localeCompare(a.last_at ?? a.ordered_at))
  const op = ops.find((o) => OPEN.has(o.status)) ?? ops.find((o) => (o.last_at ?? '').slice(0, 10) === today)
  if (!op) return { error: 'No operation on the record for this patient: /opnote is written for an operation on the operating list' }
  const t = templateFor(seen.templates, op.service_code, null)
  const n: OpNote = { op: op.item, operation: (op.service_name ?? 'Operation').replace(/\s*\(.*\)$/, ''), ...(t?.why ? { why: t.why } : {}), ...(t?.findings ? { findings: t.findings } : {}),
    ...(t?.steps ? { steps: t.steps } : {}), ...(t?.closure ? { closure: t.closure } : {}), blood_loss: 0, drain: 'none', complications: [] }
  const items: Parsed[] = [
    { function: 'procedure', action: 'write:procedure', kind: 'procedure', line: `Procedure · ${n.operation} · done`,
      params: { concept: { text: n.operation, codings: [] }, status: 'completed', performed: { value: today, precision: 'day' } } },
    { function: 'surgical.opnote', action: 'write:surgical.opnote', kind: 'note', line: noteLine(n),
      params: { kind: 'operation', heading: 'Operation note', text: noteText(n), surgical: n } }]
  return { ok: items }
}
