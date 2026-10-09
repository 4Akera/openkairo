// The composer's commands and cards (spec 05, 06): "/" starts a command; anything else is note text.
// Core registers its commands here the same way a pack registers its own (in src/packs/<key>): a pack's command
// writes the pack's own type through its own write function. The "/" menu lists the commands the reader's role
// may write in this department, and a pack's only where this department uses the pack (§5.1 rule 1; elsewhere typing it says where);
// a pack's order command (/lab) where a department using the pack works for this one (rule 1, added 2026-10-07); a pack's command
// that is not an order, declared worksFor (/transfuse), there too, as well as where the pack is ticked (§5.7 C3, 2026-10-08).
// A pack never takes a command over for the whole clinic: a name that is taken is refused. It may give its own
// department type its own version of a core command (overrideCommand) and its own card (registerCard) — which still
// write what the core command writes, so the record keeps one medication list, one problem list — and each
// department may decline them (departments.pack_cards).
import type { ComponentType, ReactNode } from 'react'
import type { Ctx, Parsed, Result } from './parse'

export interface Command {
  name: string                      // typed as /name
  aliases?: string[]
  label: string                     // what it writes, in the clinic's words
  example: string                   // a line that shows how it is typed
  action: string                    // the action a role needs to see it, e.g. write:prescription
  pack?: string                     // a pack's command shows only in a department that uses the pack
  orders?: boolean                  // …or, a pack's order command: where a department using the pack works for this one, searching its services only
  section?: string                  // …and only this section of them (an imaging pack's /ct: CT; spec §5.1 rule 1, "each its section")
  worksFor?: boolean                // …or, a pack's command that is not an order: where this department uses the pack, or a department using it works for this one (§5.7 C3, /transfuse)
  group?: 'record' | 'orders' | 'safety'   // where the / list shows it (a pack's commands sit under the pack's own name)
  groupTitle?: string               // a pack's group in the / list, in its words ("Laboratory")
  title?: string                    // its name in the / list, in a word or two ("Vitals", "Diagnosis"); else its label
  writes?: string[]                 // the write functions its drafts call: a department's version must call the same
  /** the text after the command → drafts (null: nothing typed yet) */
  parse: (rest: string, ctx: Ctx) => Result
  /** the command alone: an empty card to fill field by field, or the long note under the line */
  empty?: (ctx: Ctx) => Parsed[] | { drawer: { kind: string; text: string } }
  /** an order command's word on each service it suggests (the tube a test is drawn into), and its colour beside it */
  hint?: (s: Ctx['services'][number]) => string | null
  swatch?: (s: Ctx['services'][number]) => string | null
  /** a line under what the card holds (the tubes, fasting to tell the patient) */
  note?: (items: Parsed[], ctx: Ctx) => ReactNode
}
/** a pack's version of a command in its own department type: its label, parser and empty card */
export interface CommandOverride { pack: string; departmentType: string; name: string; label?: string; example?: string; parse?: Command['parse']; empty?: Command['empty'] }
type Where = Pick<Ctx, 'departmentType' | 'packCards' | 'packs'> & Partial<Pick<Ctx, 'departments' | 'departmentId' | 'servedBy'>>

const commands = new Map<string, Command>(); const names = new Map<string, string>(); const overrides: CommandOverride[] = []
export function registerCommand(c: Command) {
  const taken = [c.name, ...(c.aliases ?? [])].find((n) => names.has(n.toLowerCase()))
  if (taken) { console.error(`openCare: /${taken} is taken — a pack adds its command under a new name, or overrides one for its own department type`); return }
  commands.set(c.name, c); for (const n of [c.name, ...(c.aliases ?? [])]) names.set(n.toLowerCase(), c.name)
}
export function overrideCommand(o: CommandOverride) { overrides.push(o) }
/** the pack's version, in a department of its type that uses pack cards, while the pack is on */
const overrideFor = (name: string, w?: Where) => w?.departmentType && w.packCards !== false
  ? overrides.find((o) => o.name === name && o.departmentType === w.departmentType && (!w.packs || w.packs.includes(o.pack))) : undefined
function resolve(c: Command, w?: Where): Command {
  const o = overrideFor(c.name, w); if (!o) return c
  // it may look and ask differently; it writes what the core command writes
  const same = (r: Result): Result => !r || 'error' in r || !c.writes || r.ok.every((p) => c.writes!.includes(p.function)) ? r : { error: `This department's /${c.name} must write what /${c.name} writes` }
  return { ...c, label: o.label ?? c.label, example: o.example ?? c.example, parse: o.parse ? (rest, x) => same(o.parse!(rest, x)) : c.parse, empty: o.empty ?? c.empty }
}
/** "rx", "RX", "plan:" → the command (this department's version), if one is registered under that name or alias */
export const commandNamed = (word: string, w?: Where) => { const n = names.get(word.toLowerCase().replace(/:$/, '')); const c = n ? commands.get(n) : undefined; return c ? resolve(c, w) : undefined }
type Here = Pick<Ctx, 'can' | 'packs'> & Partial<Pick<Ctx, 'services' | 'departments' | 'departmentId' | 'servedBy'>>
/** the departments using a pack that take orders from this one: a service of theirs is offered here (the composer's services are the ones that work for it) */
export const ordersFrom = (pack: string, ctx: Partial<Pick<Ctx, 'services' | 'departments' | 'departmentId'>>) => {
  const using = new Set((ctx.departments ?? []).filter((d) => d.packs?.includes(pack)).map((d) => d.id))
  return new Set((ctx.services ?? []).filter((s) => s.department_id && s.department_id !== ctx.departmentId && using.has(s.department_id)).map((s) => s.department_id!))
}
/** the departments using a pack that work for this one (C3): a pack's command that is not an order is offered by works for */
export const servedFrom = (pack: string, ctx: Partial<Pick<Ctx, 'departments' | 'departmentId' | 'servedBy'>>) =>
  (ctx.departments ?? []).filter((d) => d.id !== ctx.departmentId && d.packs?.includes(pack) && (ctx.servedBy ?? []).includes(d.id))
/** a pack's command is here: an order command where a department using the pack takes orders from this one; a works-for command
 *  where this department uses the pack or one using it works for this one; any other where this department uses the pack */
const packHere = (c: Pick<Command, 'pack' | 'orders' | 'worksFor'>, ctx: Here) => !c.pack || !ctx.packs || (c.orders ? !ctx.services || ordersFrom(c.pack, ctx).size > 0
  : c.worksFor ? ctx.packs.includes(c.pack) || !ctx.servedBy || servedFrom(c.pack, ctx).length > 0 : ctx.packs.includes(c.pack))
/** may this reader use it here: their role holds its action, and its pack is here (no ctx.can: every command, as in tests and previews) */
export const allowed = (c: Command, ctx: Here) => (!ctx.can || ctx.can(c.action)) && packHere(c, ctx)
/** why a pack's command is not here: where it is used, or, an order command, where it orders from */
export function notHere(c: Pick<Command, 'name' | 'pack' | 'orders' | 'worksFor'>, ctx: Here & Pick<Partial<Ctx>, 'usedIn'>): string | null {
  if (packHere(c, ctx)) return null
  if (c.worksFor) { const using = (ctx.departments ?? []).filter((d) => d.packs?.includes(c.pack!)); const here = ctx.departments?.find((d) => d.id === ctx.departmentId)
    return using.length ? `/${c.name} is offered where ${using.map((d) => d.name).join(', ')} ${using.length > 1 ? 'work' : 'works'} for the department; ${using.length > 1 ? 'they do' : 'it does'} not work for ${here?.name ?? 'this department'}`
      : usedWhere(c.name, []) }
  if (!c.orders) return usedWhere(c.name, ctx.usedIn?.(c.pack!) ?? [])
  const using = (ctx.departments ?? []).filter((d) => d.packs?.includes(c.pack!))
  const here = ctx.departments?.find((d) => d.id === ctx.departmentId)
  if (using.length === 1 && using[0].id === ctx.departmentId) return `/${c.name} orders from this department: a test asked for here starts as a walk-in (+ Walk-in)`
  const from = using.filter((d) => d.id !== ctx.departmentId)
  return from.length ? `/${c.name} orders from ${from.map((d) => d.name).join(', ')}, which ${from.length > 1 ? 'do' : 'does'} not take orders from ${here?.name ?? 'this department'}. /order shows what this department can order.`
    : usedWhere(c.name, [])
}
/** where a pack's command works, for a department that does not use its pack */
export const usedWhere = (name: string, departments: string[]) => departments.length ? `/${name} is used in: ${departments.join(', ')}`
  : `/${name} is not used in any department here — a department ticks its pack in Settings → Departments`
/** the / list's groups, in order (owner, 2026-10-07): the base's three, then each pack's own */
export const GROUPS: Record<string, string> = { record: 'Record', orders: 'Orders and medicines', safety: 'Safety and scores' }
export const groupOf = (c: Pick<Command, 'group' | 'pack'>) => c.pack ?? c.group ?? 'record'
export const groupName = (g: string) => GROUPS[g] ?? g.charAt(0).toUpperCase() + g.slice(1)
const rank = (g: string) => { const i = Object.keys(GROUPS).indexOf(g); return i < 0 ? 99 : i }
/** the commands in the / list's order: by group (the base's first, then packs by name), each group as registered */
export const byGroup = <C extends Pick<Command, 'group' | 'pack'>>(cs: C[]) => cs.map((c, i) => ({ c, i }))
  .sort((a, b) => rank(groupOf(a.c)) - rank(groupOf(b.c)) || groupOf(a.c).localeCompare(groupOf(b.c)) || a.i - b.i).map((x) => x.c)
export const commandsFor = (ctx: Here & Pick<Ctx, 'departmentType' | 'packCards'>) => [...commands.values()].filter((c) => allowed(c, ctx)).map((c) => resolve(c, ctx))
/** does any pack offer this department type its own commands or cards (Settings shows the switch only then) */
export const offersFor = (departmentType: string) => overrides.some((o) => o.departmentType === departmentType) || cards.some((c) => c.departmentType === departmentType)

// ── cards: the fields under the line. Core draws its own types; a pack registers the card for its own write function,
//    or its department type's card for a core one (never the clinic's) ──
export interface CardEditorProps { q: Record<string, any>; set: (patch: Record<string, unknown>) => void; ctx: Ctx }   // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CardRegistration { function: string; Editor: ComponentType<CardEditorProps>; line?: (params: Record<string, unknown>) => string; pack: string; departmentType?: string }
const CORE = new Set(['vitals', 'medication', 'problem', 'allergy', 'order', 'note', 'list_review', 'score'])
const cards: CardRegistration[] = []
export function registerCard(r: CardRegistration) {
  if (CORE.has(r.function) && !r.departmentType) { console.error(`openCare: a pack cannot replace the ${r.function} card for the whole clinic — give it its department type`); return }
  cards.push(r)
}
/** a pack whose works-for command is offered here (C3): a department using it works for this one, so its cards draw here too */
const servesHere = (pack: string, w: Where) => [...commands.values()].some((c) => c.pack === pack && c.worksFor) && servedFrom(pack, w).length > 0
/** the card for a draft here: its department type's (if the department uses pack cards), else the pack's own — where the department
 *  uses the pack, or the pack serves it by a works-for command (the Blood bank's /transfuse on a ward); undefined: core draws it */
export const cardFor = (fn: string, w?: Where) =>
  (w?.departmentType && w.packCards !== false ? cards.find((c) => c.function === fn && c.departmentType === w.departmentType && (!w.packs || w.packs.includes(c.pack))) : undefined)
  ?? cards.find((c) => c.function === fn && !c.departmentType && !CORE.has(fn) && (!w?.packs || w.packs.includes(c.pack) || servesHere(c.pack, w)))

// ── (k) a pack's line saved by its own operation at Done (§5.7, owner 2026-10-08): a draft whose function a pack registers here is never a
//    record entry; right after the entries land (or alone, when nothing else was written), the pack saves it through its own door. If it
//    fails, the visit is still saved and the draft stays, saying what went wrong ──
export interface DraftWhere { patientId: string; departmentId: string; visitId: string | null }
export interface DraftSave { function: string; pack: string; save: (params: Record<string, unknown>, where: DraftWhere) => Promise<unknown> }
const saves = new Map<string, DraftSave>()
export function registerDraftSave(d: DraftSave) {
  // only a pack's own function (<pack>.<name>), once: never a base line (an alert, a pregnancy) nor another pack's
  if (!/^[a-z][a-z0-9_]*$/.test(d.pack) || d.pack === 'core' || d.pack === 'base' || !d.function.startsWith(`${d.pack}.`) || CORE.has(d.function) || saves.has(d.function)) {
    console.error(`openCare: ${d.function} is not ${d.pack}'s own line to save`); return
  }
  saves.set(d.function, d)
}
/** the pack that saves this draft's function itself, or none (a record entry) */
export const draftSaveFor = (fn: string) => saves.get(fn) ?? null
