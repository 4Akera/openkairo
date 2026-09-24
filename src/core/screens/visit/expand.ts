// The composer's pure half (spec 05): /shortcuts expand to drafts, and the word being typed gets suggestions.
import type { Template } from '../../db/types'
import { suggestAllergens, suggestDrugs, suggestProblems } from './catalog'
import { lineOf, parse, type Ctx, type Parsed } from './parse'

export const BUILTIN: Record<string, { label: string; drawer?: { kind: string; text: string }; items?: Parsed[] }> = {
  note: { label: 'A long note beside the record', drawer: { kind: 'progress', text: '' } },
  soap: { label: 'SOAP note', drawer: { kind: 'progress', text: 'S: \nO: \nA: \nP: ' } },
  hx: { label: 'History & examination note', drawer: { kind: 'history_physical', text: 'History: \n\nExamination: ' } },
  letter: { label: 'A letter', drawer: { kind: 'letter', text: '' } },
  nka: { label: 'No known allergies', items: [{ function: 'write_list_review', kind: 'review', params: { list: 'allergies', outcome: 'none_known' }, line: 'No known allergies' }] },
  vitals: { label: 'Vitals, field by field', items: [{ function: 'write_vitals', kind: 'vitals', params: {}, line: '' }] },
}
/** errors stop the line; skipped are a preset's lines this patient's record cannot take — the rest of the preset still goes in */
export interface Expanded { items: Parsed[]; errors: string[]; skipped?: string[]; drawer?: { kind: string; text: string }; label?: string }
export interface Suggestion { key: string; label: string; detail?: string; insert: string }

/** a line, or a /shortcut: a preset's services and speed lines, or a built-in */
export function expand(text: string, ctx: Ctx, presets: Template[]): Expanded | null {
  const s = text.trim(); if (!s) return null
  if (!s.startsWith('/')) { const r = parse(s, ctx); return !r ? null : 'error' in r ? { items: [], errors: [r.error] } : { items: r.ok, errors: [] } }
  const word = s.slice(1).split(/\s+/)[0].toLowerCase(); if (!word) return null
  const b = BUILTIN[word]; if (b) return { items: b.items ?? [], errors: [], drawer: b.drawer, label: b.label }
  const t = presets.find((x) => x.shortcut === word)
  if (!t) return { items: [], errors: [`No shortcut /${word} — presets get one in Settings`] }
  const items: Parsed[] = []; const skipped: string[] = []; let problems = ctx.problems
  for (const i of t.items) { const svc = ctx.services.find((x) => x.id === i.service_id && x.department_id !== ctx.departmentId); if (svc) items.push({ function: 'write_request', kind: 'request', params: { service_id: svc.id, priority: 'routine' }, line: lineOf({ function: 'write_request', kind: 'request', params: { service_id: svc.id }, line: '' }, ctx) }) }
  for (const l of t.lines) {
    let r = parse(l, { ...ctx, problems })
    // "for dm" links to the patient's problem (or one this preset adds); without it the line still goes in, unlinked
    if (r && 'error' in r && /^No problem/.test(r.error)) r = parse(unlinked(l), { ...ctx, problems })
    if (r && 'ok' in r) for (const p of r.ok) {
      if (p.function === 'write_problem') { p.id = crypto.randomUUID(); problems = [...problems, { id: p.id, name: String(p.params.name) }] }   // a later line can link to it
      items.push(p)
    } else if (r) skipped.push(`“${l}”: ${r.error}`)
  }
  return { items, errors: [], skipped, label: t.name }
}

/** the line without its last "for <problem>" (a PRN's "for pain" before it stays) */
const unlinked = (l: string) => { const [main, ...tail] = l.split(';'); const at = main.toLowerCase().lastIndexOf(' for '); return [at > 0 ? main.slice(0, at) : main, ...tail].join(';') }

/** what the word being typed could be: a drug, a problem, an allergen, a service, a department, a shortcut */
export function suggest(text: string, ctx: Ctx, presets: Template[], onList: Set<string>): { items: Suggestion[] } | null {
  if (text.startsWith('/') && !/\s/.test(text.trim())) {
    const w = text.slice(1).toLowerCase()
    const all: Suggestion[] = [...presets.filter((t) => t.shortcut).map((t) => ({ key: `p${t.id}`, label: `/${t.shortcut}`, detail: `${t.name} · ${t.items.length + t.lines.length} items`, insert: `/${t.shortcut}` })),
      ...Object.entries(BUILTIN).map(([k, b]) => ({ key: `b${k}`, label: `/${k}`, detail: b.label, insert: `/${k}` }))]
    const hits = all.filter((x) => x.label.slice(1).startsWith(w) && x.label !== `/${w}`)
    return hits.length ? { items: hits } : null
  }
  const m = text.match(/^(\S+)\s+(.*)$/); if (!m) return null
  const head = m[1].toLowerCase(); const rest = m[2]
  if (['rx', 'med', 'drug', 'start'].includes(head)) {
    if (rest.trim().length < 2 || /\s$/.test(rest) || rest.split(/\s+/).some((w) => /^\d/.test(w) || /^(od|bd|tds|qds|prn|po|iv|im|sc|for)$/i.test(w))) return null
    const hits = suggestDrugs(rest, 7).filter((d) => d.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.map((d) => ({ key: d.atc + d.name, label: d.name, detail: `${d.group}${d.strengths.length ? ` · ${d.strengths.join(' / ')} ${d.unit}` : ''}${d.synonyms[0] && d.synonyms[0].toLowerCase().startsWith(rest.trim().toLowerCase()) ? ` · ${d.synonyms[0]}` : ''}`, insert: `${m[1]} ${d.name} ` })) } : null
  }
  if (['dx', 'pb', 'prob', 'problem', 'ddx'].includes(head)) {
    if (rest.trim().length < 2 || /\s$/.test(rest) || /[;?]|\s(since|from)\s/i.test(rest)) return null
    const hits = suggestProblems(rest, 7).filter((p) => p.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.map((p) => ({ key: p.icd10 + p.name, label: p.name, detail: `ICD-10 ${p.icd10}${onList.has(p.name.toLowerCase()) ? ' · already on the list' : ''}`, insert: `${m[1]} ${p.name} ` })) } : null
  }
  if (['al', 'alg', 'allergy', 'allergic'].includes(head)) {
    if (rest.trim().length < 2 || /[:\-–]/.test(rest) || /\s$/.test(rest)) return null
    const seen = new Set<string>(); const hits = [...suggestAllergens(rest, 5).map((a) => ({ name: a.name, detail: a.allergy_class ? `class: ${a.allergy_class.replace(/_/g, ' ')}` : a.kind })),
      ...suggestDrugs(rest, 4).map((d) => ({ name: d.name, detail: d.allergy_class ? `drug · class: ${d.allergy_class.replace(/_/g, ' ')}` : 'drug' }))].filter((x) => !seen.has(x.name) && seen.add(x.name) && x.name.toLowerCase() !== rest.trim().toLowerCase())
    return hits.length ? { items: hits.slice(0, 7).map((x) => ({ key: x.name, label: x.name, detail: x.detail, insert: `${m[1]} ${x.name}: ` })) } : null
  }
  if (['lab', 'labs', 'req', 'order', 'inv', 'img', 'xr', 'test'].includes(head)) {
    const partial = text.split(/[,\s]+/).pop() ?? ''
    if (!partial || /^(urgent|stat)$/i.test(partial)) return null
    const p = partial.toLowerCase()
    const hits = ctx.services.filter((s) => s.department_id !== ctx.departmentId && (s.code.startsWith(p) || s.name.toLowerCase().includes(p))).slice(0, 7)
    return hits.length ? { items: hits.map((s) => ({ key: s.id, label: s.name, detail: `${s.code} · ${ctx.departments.find((d) => d.id === s.department_id)?.name ?? ''}`, insert: `${text.slice(0, text.length - partial.length)}${s.code}, ` })) } : null
  }
  if (['ref', 'consult', 'cons', 'refer'].includes(head) && !/\s/.test(rest)) {
    const hits = ctx.departments.filter((d) => d.id !== ctx.departmentId && d.name.toLowerCase().includes(rest.toLowerCase()))
    return hits.length && rest ? { items: hits.slice(0, 6).map((d) => ({ key: d.id, label: d.name, insert: `${m[1]} ${d.name} ` })) } : null
  }
  return null
}
