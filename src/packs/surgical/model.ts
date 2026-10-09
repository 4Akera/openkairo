// The surgical pack's words (spec/openCare.md §5.7; the pictures #surg-clinic, #surg-opnote): which of a patient's orders are
// operations (a service the department answering it moves through operating), the banner's "for op" and "op today", the surgeon's
// template for an operation, the operation note's line. Pure: a node test imports it.

export interface OrderLike { item: string; service_id: string | null; service_code: string | null; service_name: string | null; status: string; step_key: string | null; ordered_at: string; last_at?: string }
export interface ServiceLike { id: string; code: string; name: string; steps?: string[] }
/** an operation: an order whose service is moved through "operating" (the operating list's steps), by its shape, never a pack's name */
export const isOperation = (o: Pick<OrderLike, 'service_id'>, services: ServiceLike[]) => !!services.find((s) => s.id === o.service_id)?.steps?.includes('operating')
export const OPEN = new Set(['active', 'in-progress', 'on-hold'])
const TODAY_STEPS = new Set(['sent_for', 'arrived', 'anaesthetic', 'operating', 'recovery'])
/** the operation's name as a word or two: "Laparoscopic cholecystectomy" → "lap chole", else its first words */
export function shortOp(name: string | null | undefined): string {
  const n = (name ?? '').replace(/\s*\(.*\)$/, '')
  if (/laparoscopic cholecystectomy/i.test(n)) return 'lap chole'
  if (/inguinal hernia/i.test(n)) return 'inguinal hernia'
  return n.split(/[,·]/)[0].toLowerCase().trim()
}
/** the banner's words: "op today · lap chole" while the operation is under way or its note was written today; "for op · hernia" while one waits */
export function surgeryWords(orders: OrderLike[], services: ServiceLike[], notesToday: string[], today: string): string[] {
  const ops = orders.filter((o) => isOperation(o, services))
  const now = ops.find((o) => (o.step_key && TODAY_STEPS.has(o.step_key)) || ((o.status === 'completed') && (o.last_at ?? '').slice(0, 10) === today))
  if (now || notesToday.length) return [`op today · ${shortOp(now?.service_name ?? notesToday[0])}`]
  const waiting = ops.filter((o) => OPEN.has(o.status)).sort((a, b) => a.ordered_at.localeCompare(b.ordered_at))[0]
  return waiting ? [`for op · ${shortOp(waiting.service_name)}`] : []
}
export interface Template { surgeon?: string; operation: string; why?: string; findings?: string; steps?: string; closure?: string; postop?: string }
type SettingsOrg = { organization: { id: string }; settings: { key: string; thing_id: string; data: Record<string, unknown> }[] }
export const templatesOf = (org: SettingsOrg | null | undefined): Template[] =>
  ((org?.settings.find((s) => s.key === 'surgical.templates' && s.thing_id === org.organization.id)?.data ?? {}) as { templates?: Template[] }).templates ?? []
/** the surgeon's own template for this operation, else anyone's for it */
export const templateFor = (all: Template[], code: string | null | undefined, surgeon: string | null | undefined) =>
  all.find((t) => t.operation === code && t.surgeon === surgeon) ?? all.find((t) => t.operation === code && !t.surgeon) ?? all.find((t) => t.operation === code)
export interface OpNote { op?: string; operation: string; surgeon?: string; assistant?: string; anaesthetist?: string; technique?: string; times?: { from?: string; to?: string }
  why?: string; findings?: string; steps?: string; closure?: string; blood_loss?: number; drain?: string; complications?: string[]; specimen?: string; implants?: string }
/** the note's text (the base's note needs one): what the record shows when the pack is off */
export const noteText = (n: OpNote) => [n.why && `Why: ${n.why}`, n.findings && `Findings: ${n.findings}`, n.steps && `Steps:\n${n.steps}`, n.closure && `Closure: ${n.closure}`,
  `Blood loss ${n.blood_loss ?? 0} mL · ${!n.drain || n.drain === 'none' ? 'no drain' : n.drain} · ${n.complications?.length ? n.complications.join(', ') : 'no complications'}`].filter(Boolean).join('\n')
export const noteLine = (n: OpNote) => `Operation note · ${n.operation}${n.times?.from && n.times?.to ? ` · ${n.times.from}–${n.times.to}` : ''} · blood loss ${n.blood_loss ?? 0} mL · ${!n.drain || n.drain === 'none' ? 'no drain' : n.drain} · ${n.complications?.length ? n.complications.join(', ') : 'no complications'}`
/** minutes between two HH:MM */
export const minutesBetween = (a?: string, b?: string) => { if (!a || !b) return null; const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return h2 * 60 + m2 - (h1 * 60 + m1) }
