// The composer's pure half (spec 05): a /command or a #preset expands to drafts, and the word being typed gets suggestions.
import type { Template } from '../../db/types'
import { suggestAllergens, suggestDrugs, suggestProblems } from './catalog'
import { allowed, byGroup, commandNamed, commandsFor, groupName, groupOf, notHere, ordersFrom } from './commands'
import { lineOf, parse, splitCommand, type Ctx, type Parsed, type Result } from './parse'
import { aliasLine } from './score'

/** errors stop the line; skipped are a preset's lines this patient's record cannot take — the rest of the preset still goes in */
/** hint: a card that is not an error — a pack's command typed where its pack is not used says where it is (§5.1 rule 1) */
export interface Expanded { items: Parsed[]; errors: string[]; skipped?: string[]; drawer?: { kind: string; text: string }; label?: string; hint?: string }
/** swatch: a colour beside it (a test's tube); a list of them (orders) is drawn one per row, as it narrows while typing */
export interface Suggestion { key: string; label: string; detail?: string; insert: string; title?: string; group?: string; swatch?: string }

// note commands that became labels: a preset line saved as "/plan review" still reads as "plan: review"
const WAS_NOTE: Record<string, string> = { hx: 'hx', ex: 'ex', exam: 'ex', plan: 'plan', proc: 'proc' }
/** a preset line is a command even when written without its slash ("rx metformin 500 bd" in Settings is /rx) */
export const presetLine = (l: string) => {
  const t = l.trim(); const [w, rest] = splitCommand(t)
  if (t.startsWith('/') && WAS_NOTE[w.toLowerCase()] && !commandNamed(w)) return `${WAS_NOTE[w.toLowerCase()]}: ${rest}`
  return t.startsWith('/') || !commandNamed(w) ? t : `/${t}`
}
/** a preset of headings only ("S:", "O:", "A:", "P:") is a note to fill: it opens under the line */
const HEADING = /^[\p{L}/ ]{1,24}:\s*$/u
export const readPresetLine = (l: string, ctx: Ctx): Result => { const line = presetLine(l); const r = parse(line, ctx)
  return r ?? (line.startsWith('/') ? { error: `${splitCommand(line)[0] ? `/${splitCommand(line)[0]}` : 'A command'} needs its text in a preset — e.g. ${commandNamed(splitCommand(line)[0])?.example ?? '/rx metformin 500 bd'}` } : null) }

/** a line: note text, a /command (with text: filled; alone: an empty card or the long note under the line), or a #preset */
export function expand(text: string, ctx: Ctx, presets: Template[]): Expanded | null {
  const s = text.trim(); if (!s) return null
  const wrap = (r: Result): Expanded | null => !r ? null : 'error' in r ? { items: [], errors: [r.error] } : { items: r.ok, errors: [] }
  if (s.startsWith('#')) return preset(s.slice(1).trim().split(/\s+/)[0].toLowerCase(), ctx, presets)
  if (!s.startsWith('/')) return wrap(parse(s, ctx))
  const [word, rest] = aliasLine(splitCommand(s), ctx, !!commandNamed(splitCommand(s)[0], ctx)); if (!word) return null   // /gcs … is /score gcs …
  const cmd = commandNamed(word, ctx)
  if (!cmd && presets.some((x) => x.shortcut === word.toLowerCase())) return { items: [], errors: [`${word} is a preset — type #${word.toLowerCase()}`] }
  if (cmd) {
    const away = notHere(cmd, ctx); if (away) return { items: [], errors: [], hint: away }   // where it is used, or where it orders from
    if (!allowed(cmd, ctx)) return { items: [], errors: [`/${cmd.name} is not open to your role here`] }
    const r = rest ? cmd.parse(rest, ctx) : null
    if (r) return wrap('ok' in r ? { ok: r.ok.map((p) => ({ action: cmd.action, ...p })) } : r)
    const e = cmd.empty?.(ctx)
    if (!e) return { items: [], errors: [], label: `Type what to write — ${cmd.example}` }
    if (!Array.isArray(e) && rest) return { items: [], errors: [], drawer: { ...e.drawer, text: e.drawer.text + rest }, label: cmd.label }   // /soap cough 3 days: the text goes in
    return Array.isArray(e) ? { items: e, errors: [], label: `${cmd.label} — fill the card, or type it: ${cmd.example}` } : { items: [], errors: [], drawer: e.drawer, label: cmd.label }
  }
  return { items: [], errors: [`No command /${word} — type / to see the six`] }
}

/** a preset: its services as requests and its lines as drafts, or its headings as a note to fill */
function preset(word: string, ctx: Ctx, presets: Template[]): Expanded | null {
  if (!word) return null
  const t = presets.find((x) => x.shortcut === word)
  if (!t) return { items: [], errors: [`No preset #${word} — presets are made in Settings`] }
  if (!t.items.length && t.lines.length && t.lines.every((l) => HEADING.test(l.trim())))
    return { items: [], errors: [], drawer: { kind: /^history|^examination/i.test(t.lines[0]) ? 'history_physical' : ctx.noteKind ?? 'progress', text: t.lines.map((l) => `${l.trim()} `).join('\n') }, label: t.name }
  const items: Parsed[] = []; const skipped: string[] = []; let problems = ctx.problems
  for (const i of t.items) { const svc = ctx.services.find((x) => x.id === i.service_id && x.department_id !== ctx.departmentId); if (svc) items.push({ function: 'order', kind: 'request', params: { service_id: svc.id, priority: 'routine' }, line: lineOf({ function: 'order', kind: 'request', params: { service_id: svc.id }, line: '' }, ctx) }) }
  for (const l of t.lines) {
    let r = readPresetLine(l, { ...ctx, problems })
    // "for dm" links to the patient's problem (or one this preset adds); without it the line still goes in, unlinked
    if (r && 'error' in r && /^No problem/.test(r.error)) r = readPresetLine(unlinked(l), { ...ctx, problems })
    if (r && 'ok' in r) for (const p of r.ok) {
      if (p.function === 'problem') { p.id = crypto.randomUUID(); problems = [...problems, { id: p.id, name: String(p.params.name) }] }   // a later line can link to it
      items.push(p)
    } else if (r) skipped.push(`“${l}”: ${r.error}`)
  }
  return { items, errors: [], skipped, label: t.name }
}

/** the line without its last "for <problem>" (a PRN's "for pain" before it stays) */
const unlinked = (l: string) => { const [main, ...tail] = l.split(';'); const at = main.toLowerCase().lastIndexOf(' for '); return [at > 0 ? main.slice(0, at) : main, ...tail].join(';') }

/** one short example for the / list: the first that is more than the bare command ("/bf · /bf no" → "/bf no") */
const shortExample = (c: { name: string; example: string }) => { const parts = c.example.split(' · ').map((x) => x.trim())
  return parts.find((x) => x !== `/${c.name}`) ?? parts[0] }

/** what is being typed could be: a command or preset (after "/"), then a drug, a problem, an allergen, a service or a department */
export function suggest(text: string, ctx: Ctx, presets: Template[], onList: Set<string>): { items: Suggestion[]; list?: boolean } | null {
  const t = text.trimStart()
  if (t.startsWith('/') && !/\s/.test(t)) {                                 // "/": the commands only
    const w = t.slice(1).toLowerCase()
    const cmds = byGroup(commandsFor(ctx).filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => n.startsWith(w))))
    return cmds.length ? { items: cmds.map((c) => ({ key: `c${c.name}`, label: `/${c.name}`, title: c.title ?? c.label, detail: shortExample(c),
      group: c.groupTitle ?? groupName(groupOf(c)), insert: `/${c.name} ` })) } : null
  }
  if (t.startsWith('#') && !/\s/.test(t)) {                                 // "#": the presets only
    const w = t.slice(1).toLowerCase()
    const mine = presets.filter((p) => p.shortcut && p.shortcut.startsWith(w) && p.shortcut !== w)
    return mine.length ? { items: mine.map((p) => ({ key: `p${p.id}`, label: `#${p.shortcut}`, detail: `${p.name} · ${p.items.length + p.lines.length} items`, insert: `#${p.shortcut}` })) } : null
  }
  if (t.startsWith('#')) return null
  if (!t.startsWith('/')) {                                                  // a command word without its slash is note text: offer the command
    const [w, rest] = splitCommand(t); const c = w && /\s/.test(t) ? commandNamed(w, ctx) : undefined
    return c && allowed(c, ctx) ? { items: [{ key: 'slash', label: `/${c.name} ${rest}`, detail: `${c.label} — without “/” this line is a note`, insert: `/${c.name} ${rest}` }] } : null
  }
  const m = t.match(/^(\S+)\s+([\s\S]*)$/); if (!m) return null
  const cmd = commandNamed(m[1].slice(1), ctx)?.name; const rest = m[2]
  if (cmd === 'rx') {
    if (rest.trim().length < 2 || /\s$/.test(rest) || rest.split(/\s+/).some((w) => /^\d/.test(w) || /^(od|bd|tds|qds|prn|po|iv|im|sc|for)$/i.test(w))) return null
    const hits = suggestDrugs(rest, 7).filter((d) => d.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.map((d) => ({ key: d.atc + d.name, label: d.name, detail: `${d.group}${d.strengths.length ? ` · ${d.strengths.join(' / ')} ${d.unit}` : ''}${d.synonyms[0] && d.synonyms[0].toLowerCase().startsWith(rest.trim().toLowerCase()) ? ` · ${d.synonyms[0]}` : ''}`, insert: `${m[1]} ${d.name} ` })) } : null
  }
  if (cmd === 'dx' || cmd === 'ddx') {
    if (rest.trim().length < 2 || /\s$/.test(rest) || /[;?]|\s(since|from)\s/i.test(rest)) return null
    const hits = suggestProblems(rest, 7).filter((p) => p.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.map((p) => ({ key: p.icd10 + p.name, label: p.name, detail: `ICD-10 ${p.icd10}${onList.has(p.name.toLowerCase()) ? ' · already on the list' : ''}`, insert: `${m[1]} ${p.name} ` })) } : null
  }
  if (cmd === 'al') {
    if (rest.trim().length < 2 || /:|\s[-–]\s/.test(rest) || /\s$/.test(rest)) return null
    const seen = new Set<string>(); const hits = [...suggestAllergens(rest, 5).map((a) => ({ name: a.name, detail: a.allergy_class ? `class: ${a.allergy_class.replace(/_/g, ' ')}` : a.kind })),
      ...suggestDrugs(rest, 4).map((d) => ({ name: d.name, detail: d.allergy_class ? `drug · class: ${d.allergy_class.replace(/_/g, ' ')}` : 'drug' }))].filter((x) => !seen.has(x.name) && seen.add(x.name) && x.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.slice(0, 7).map((x) => ({ key: x.name, label: x.name, detail: x.detail, insert: `${m[1]} ${x.name}: ` })) } : null
  }
  const oc = commandNamed(m[1].slice(1), ctx)
  if (cmd === 'order' || oc?.orders) {                                      // /order: every service another department offers; a pack's (/lab): its own
    if (rest.includes('?')) return null                                     // "? the question": free words
    const partial = rest.split(/[,\s]+/).pop() ?? ''
    if (/^(urgent|stat)$/i.test(partial)) return null
    const p = partial.toLowerCase(); if (!p) return null                     // from the first letter typed: a catalogue grows long
    const from = oc?.orders && oc.pack ? ordersFrom(oc.pack, ctx) : null
    const pool = ctx.services.filter((s) => s.department_id !== ctx.departmentId && (!from || from.has(s.department_id ?? '')))
    // best first: its code, then its name, then a word of it, starting with what is typed; then anywhere in the name
    const rank = (s: Ctx['services'][number]) => { const n = s.name.toLowerCase()
      return s.code === p ? 0 : s.code.startsWith(p) ? 1 : n.startsWith(p) ? 2 : n.split(/[\s/,()·-]+/).some((w) => w.startsWith(p)) ? 3 : n.includes(p) ? 4 : 9 }
    const hits = pool.map((s) => ({ s, r: rank(s) })).filter((x) => x.r < 9).sort((a, b) => a.r - b.r).slice(0, 7).map((x) => x.s)
    // a preset by its name or shortcut, for what it orders here
    const sets = p.length >= 2 ? ctx.templates.filter((x) => (x.shortcut?.startsWith(p) || x.name.toLowerCase().startsWith(p)) && x.items.some((i) => pool.some((s) => s.id === i.service_id))).slice(0, 2) : []
    // a department is asked with a question: "/order cardiology: …" (only as the first thing ordered; not from a pack's command)
    const depts = !from && !/[,:]/.test(rest) ? ctx.departments.filter((d) => d.id !== ctx.departmentId && d.name.toLowerCase().startsWith(p)).slice(0, 3) : []
    const where = (s: Ctx['services'][number]) => from ? s.section_name ?? ctx.departments.find((d) => d.id === s.department_id)?.name ?? '' : ctx.departments.find((d) => d.id === s.department_id)?.name ?? ''
    const items = [...sets.map((x) => ({ key: `t${x.id}`, label: x.name, detail: `preset · ${x.items.filter((i) => pool.some((s) => s.id === i.service_id)).length} tests`, insert: `${t.slice(0, t.length - partial.length)}${x.name.toLowerCase()}, ` })),
      ...hits.map((s) => ({ key: s.id, label: s.name, detail: [s.code, where(s), oc?.hint?.(s)].filter(Boolean).join(' · '), swatch: oc?.swatch?.(s) ?? undefined,
        insert: `${t.slice(0, t.length - partial.length)}${s.code}, ` })),
      ...depts.map((d) => ({ key: `d${d.id}`, label: `${d.name}: …`, detail: 'a consult — type the question', insert: `${m[1]} ${d.name}: ` }))]
    return items.length ? { items, list: true } : null
  }
  return null
}
