// The composer's line (spec 05): "/" starts one of six commands, "#" a preset, anything else is today's note.
// Pure, so it can be tested without a screen. Core's commands are registered at the bottom, as a pack registers its own.
//   /v 148/92 84 37 86                   vitals by position (BP, pulse, temperature, weight, SpO₂) or by name (p 84 t 37.2)
//   /rx metformin 500mg bd 30d for dm    prescription (dose, route, frequency, days, "for <problem>", "; instructions")
//   /dx type 2 diabetes since 2019 ; poorly controlled   problem ("?" = suspected; since 2019 · 2019-03 · 3y · 6m)
//   /al penicillin: rash severe · /al none   allergy · no known allergies
//   /order hba1c, lipid · /order cardiology: chest pain on effort   services, or a department and its question (a consult)
//   /note                                the long note, inline under the line
//   hx: … · ex: … · plan: … · proc: …    a note line under that heading; anything else is today's progress note

export interface Ctx {
  services: { id: string; code: string; name: string; department_id: string | null; section_name?: string | null; steps?: string[] }[]
  templates: { id: string; name: string; items: { service_id: string }[]; shortcut?: string | null }[]
  departments: { id: string; name: string; packs?: string[] }[]     // packs: the ones each uses (a pack's order command orders from them)
  problems: { id: string; name: string }[]          // on the list and drafted this visit
  departmentId: string                                // this department: its own services are not requested from here
  now?: Date
  can?: (action: string) => boolean                   // the reader's role here: commands it lacks are not offered
  packs?: string[]                                    // the packs this department uses (ticked here, and on for the clinic): only theirs are offered
  usedIn?: (pack: string) => string[]                 // the departments that use a pack, for "/x is used in: …"
  noteKind?: string                                   // what an unlabelled line is: 'progress', or 'nurse' for a nurse
  departmentType?: string                             // this department's type: a pack may give it its own version of a command
  packCards?: boolean                                 // does this department use its packs' cards (departments.pack_cards)
  send?: SendWords | null                             // where a prescription goes from here, in its pack's words (visit/send.ts): /rx … send
  facts?: StandingFacts                               // the pregnancy, breastfeeding and alerts standing now: /preg, /bf, /alert change or end them
  scores?: ScoreTable[]                               // the score tables (read 'me'): /score and each score's alias (/gcs)
  record?: Pick<RecordView, 'patient' | 'values' | 'medications' | 'allergies' | 'allergy_review'>   // what the chart shows, read-only: a pack's order card may show it (spec §5.5, (b))
  org?: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'>   // the clinic's settings, for a pack's line under a base card (lines.ts, §5.8 C1)
  servedBy?: string[]                                 // the departments that work for this one (not itself): a pack's command offered by works for (§5.8 C3)
}
import { findAllergen, findDrug, findProblem } from './catalog'
import { allowed, commandNamed, notHere, registerCommand } from './commands'
import { alert, breastfeeding, emptyAlert, emptyBreastfeeding, emptyPregnancy, factLine, pregnancy, type StandingFacts } from './facts'
import { aliasLine, emptyScore, parseScore, scoreLine, type ScoreParams } from './score'
import type { Organization, RecordView, ScoreTable } from '../../db/types'
import { PLAIN_SEND, type SendWords } from './send'

/** typed: the fields the line said itself (the rest are defaults) · id: a draft id fixed in advance, so a later line of a preset can link to it */
export interface Parsed { function: string; params: Record<string, unknown>; line: string; kind: string; tag?: string; append?: boolean; typed?: string[]; id?: string; action?: string }
export type Result = { ok: Parsed[] } | { error: string } | null

const VITALS: Record<string, [string, string]> = {
  p: ['pulse', 'P'], hr: ['pulse', 'P'], pulse: ['pulse', 'P'], t: ['temperature', 'T'], temp: ['temperature', 'T'],
  w: ['weight', 'Wt'], wt: ['weight', 'Wt'], weight: ['weight', 'Wt'], h: ['height', 'Ht'], ht: ['height', 'Ht'], height: ['height', 'Ht'],
  spo2: ['spo2', 'SpO₂'], sat: ['spo2', 'SpO₂'], sats: ['spo2', 'SpO₂'], o2: ['spo2', 'SpO₂'], rr: ['respiratory_rate', 'RR'],
  // a child's length (lying; the base's height, method lying) and head (the base's head): core change C2 (§5.8, Q22)
  len: ['length', 'Length'], length: ['length', 'Length'], hc: ['head', 'Head'], head: ['head', 'Head'], ofc: ['head', 'Head'],
}
const FREQ: Record<string, string> = {
  od: 'OD', qd: 'OD', daily: 'OD', bd: 'BD', bid: 'BD', tds: 'TDS', tid: 'TDS', qds: 'QDS', qid: 'QDS', q4h: 'q4h', q6h: 'q6h', q8h: 'q8h', q12h: 'q12h',
  weekly: 'weekly', monthly: 'monthly', prn: 'PRN', once: 'once', stat: 'stat', nocte: 'OD', mane: 'OD', hs: 'OD',
}
const FREQ_NOTE: Record<string, string> = { nocte: 'at night', hs: 'at night', mane: 'in the morning' }
const ROUTE: Record<string, string> = { po: 'oral', oral: 'oral', sc: 'sc', sq: 'sc', im: 'im', iv: 'iv', top: 'topical', topical: 'topical', inh: 'inhaled', inhaled: 'inhaled', pr: 'pr', pv: 'pv', sl: 'sl', nasal: 'nasal' }
const UNITS = ['mg', 'g', 'mcg', 'ug', 'ml', 'iu', 'u', 'units', 'tab', 'tabs', 'cap', 'caps', 'puff', 'puffs', 'drop', 'drops', 'sachet']

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "2019" · "2019-03" · "3y" · "6m" · "2w" → a partial date the server accepts */
export function partialDate(s: string, now = new Date()): string | null {
  const t = s.trim().toLowerCase()
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) return t
  const m = t.match(/^(\d+)\s*(y|yr|yrs|years?|m|mo|months?|w|wk|weeks?|d|days?)$/)
  if (!m) return null
  const n = Number(m[1]); const d = new Date(now)
  if (m[2].startsWith('y')) return String(d.getFullYear() - n)
  if (m[2].startsWith('m')) { d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7) }
  d.setDate(d.getDate() - (m[2].startsWith('w') ? 7 * n : n)); return d.toISOString().slice(0, 10)
}

// common clinical shorthand → words a problem name contains
const ABBR: Record<string, string> = { dm: 'diabet', t2dm: 'diabet', t1dm: 'diabet', htn: 'hypertens', ht: 'hypertens', ihd: 'ischaemic heart', cad: 'coronary', ckd: 'kidney',
  af: 'atrial fibrillation', hf: 'heart failure', chf: 'heart failure', copd: 'obstructive pulmonary', ba: 'asthma', gerd: 'reflux', gord: 'reflux', uti: 'urinary tract', ra: 'rheumatoid', oa: 'osteoarthritis',
  hld: 'lipid', dyslip: 'lipid', ida: 'iron deficiency', cva: 'stroke', tia: 'ischaemic attack', bph: 'prostat', dvt: 'thrombosis', pe: 'embolism', hypo: 'hypothyroid' }
/** best match of a typed word or phrase among named things: exact code, exact name, name starts with, word starts with */
export function findNamed<T extends { name: string; code?: string }>(items: T[], q: string): T | null {
  const s = norm(q); if (!s) return null
  return items.find((x) => x.code && norm(x.code) === s) ?? items.find((x) => norm(x.name) === s)
    ?? items.find((x) => norm(x.name).startsWith(s)) ?? items.find((x) => norm(x.name).split(/[\s/,()-]+/).some((w) => w.startsWith(s) && s.length >= 3))
    ?? (ABBR[s] ? items.find((x) => norm(x.name).includes(ABBR[s])) : undefined)
    ?? (s.length >= 2 && !s.includes(' ') ? items.find((x) => norm(x.name).split(/[\s/,()-]+/).map((w) => w[0]).join('').includes(s)) : undefined) ?? null   // "dm" → diabetes mellitus
}

/** every best match of a typed word or phrase, at the first of findNamed's steps that finds any (a code, a name, its start, a word's
 *  start, a shorthand, the initials): one is the thing meant; more than one is asked, never guessed */
export function matchesOf<T extends { name: string; code?: string }>(items: T[], q: string): T[] {
  const s = norm(q); if (!s) return []
  const words = (x: T) => norm(x.name).split(/[\s/,()-]+/)
  const steps: ((x: T) => boolean)[] = [(x) => !!x.code && norm(x.code) === s, (x) => norm(x.name) === s, (x) => norm(x.name).startsWith(s),
    (x) => s.length >= 3 && words(x).some((w) => w.startsWith(s)), (x) => !!ABBR[s] && norm(x.name).includes(ABBR[s]),
    (x) => s.length >= 2 && !s.includes(' ') && words(x).map((w) => w[0]).join('').includes(s)]
  for (const f of steps) { const hit = items.filter(f); if (hit.length) return hit }
  return []
}

const POSITIONAL: [string, string, number, number][] = [['pulse', 'P', 20, 250], ['temperature', 'T', 30, 45], ['weight', 'Wt', 1, 400], ['spo2', 'SpO₂', 50, 100]]
function vitals(words: string[]): Result {
  const params: Record<string, number> = {}; const parts: string[] = []; let pos = -1
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    if (w === 'v' || w === 'vitals') continue
    if (pos >= 0 && /^\d+(\.\d+)?$/.test(w)) {           // 148/92 84 37 86: after a BP, bare numbers go in order
      const n = Number(w)
      while (pos < POSITIONAL.length && params[POSITIONAL[pos][0]] !== undefined) pos++
      if (pos >= POSITIONAL.length) return { error: `Too many numbers after the BP: ${w}` }
      const [k, l, lo, hi] = POSITIONAL[pos]
      if (n < lo || n > hi) return { error: `${l} ${n} is not plausible — type it with its name (e.g. ${l.toLowerCase().replace('₂', '2')} ${n})` }
      params[k] = n; parts.push(`${l} ${n}`); pos++; continue
    }
    const bp = (w === 'bp' ? words[++i] ?? '' : w).match(/^(\d{2,3})\/(\d{2,3})$/)
    if (bp) { params.systolic = +bp[1]; params.diastolic = +bp[2]; parts.push(`BP ${bp[1]}/${bp[2]}`); pos = 0; continue }
    const glued = w.match(/^([a-z]+[a-z0-9]*?)(\d+(?:\.\d+)?)$/)          // p84 · t37.2 · spo2 is a key, so check key first
    const key = VITALS[w] ? w : glued && VITALS[glued[1]] ? glued[1] : null
    if (!key) return { error: `Not a vital: “${words[i]}”. Try bp 140/90 p 80 t 37 w 70 h 170 spo2 98 rr 16` }
    const raw = VITALS[w] ? words[++i] : glued![2]
    const n = Number(raw); if (raw === undefined || Number.isNaN(n)) return { error: `${VITALS[key][1]} needs a number` }
    params[VITALS[key][0]] = n; parts.push(`${VITALS[key][1]} ${n}`)
  }
  if (!parts.length) return null
  if (params.height !== undefined && params.length !== undefined) return { error: 'Length (lying) or height (standing), not both' }
  return { ok: [{ function: 'vitals', params, line: parts.map((x) => x.startsWith('Length ') ? `${x} (lying)` : x).join(' · '), kind: 'vitals' }] }
}

const DUR_UNIT = /^(d|days?|w|wk|wks|weeks?|m|mo|months?)$/
const days = (n: number, u = 'd') => u.startsWith('w') ? n * 7 : u.startsWith('m') ? n * 30 : n
function prescription(rest: string, ctx: Ctx): Result {
  const [main, ...instr] = rest.split(';'); let instructions = instr.join(';').trim() || null
  const words = main.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  if (words[0].toLowerCase() === 'for') return { error: 'Type the drug name after /rx' }
  const drug: string[] = []; let dose: number | null = null; let unit: string | null = null; let route: string | null = null; let freq: string | null = null
  let duration: number | null = null; let prn = false; let prnFor: string[] | null = null; let forProblem: { id: string; name: string } | null = null; let send = false
  const typed = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase(); const next = words[i + 1]?.toLowerCase() ?? ''
    const d = w.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/)
    const glued = w.match(/^x?(\d+)(d|days?|w|wk|wks|weeks?|m|mo|months?)$/) ?? (w === 'x' || w === 'for' ? null : w.match(/^x(\d+)$/))
    if (drug.length && w === 'send') { send = true; typed.add('send'); continue }                          // … send: on, to where prescriptions go
    if (drug.length && glued) { duration = days(+glued[1], glued[2]); continue }                       // 7d · x7 · 2w
    if (drug.length && (w === 'for' || w === 'x') && /^\d+[a-z]*$/.test(next)) {                        // for 7 days · for 7d · x 2 weeks
      const m = next.match(/^(\d+)([a-z]+)?$/)!
      if (!m[2] || DUR_UNIT.test(m[2])) { const u = m[2] ?? (DUR_UNIT.test(words[i + 2]?.toLowerCase() ?? '') ? words[i + 2].toLowerCase() : 'd'); duration = days(+m[1], u); i += m[2] || !DUR_UNIT.test(words[i + 2]?.toLowerCase() ?? '') ? 1 : 2; continue }
    }
    if (drug.length && dose !== null && d && !d[2] && DUR_UNIT.test(next)) { duration = days(+d[1], next); i++; continue }   // 500 tds 7 days
    if (prnFor && !FREQ[w] && !ROUTE[w] && !(d && dose === null) && !(w === 'for' && prnFor.length)) { if (w !== 'for') prnFor.push(words[i]); continue }   // prn pain · prn for pain · … for dm
    if (w === 'for' && drug.length && i + 1 < words.length) { forProblem = findNamed(ctx.problems, words.slice(i + 1).join(' ')); if (!forProblem) return { error: `No problem “${words.slice(i + 1).join(' ')}” on the list — add it with /dx first` }; break }
    if (d && drug.length && dose === null && (!d[2] || UNITS.includes(d[2]))) { dose = +d[1]; typed.add('dose_number'); if (d[2]) unit = d[2]; else if (UNITS.includes(next)) { unit = next; i++ } if (unit) typed.add('dose_unit'); continue }
    if (FREQ[w] && drug.length) { if (w === 'prn') { prn = true; prnFor = []; typed.add('prn') } if (!freq || w !== 'prn') { freq = FREQ[w]; typed.add('frequency') } if (FREQ_NOTE[w]) instructions = [FREQ_NOTE[w], instructions].filter(Boolean).join('; '); continue }
    if (ROUTE[w] && drug.length) { route = ROUTE[w]; typed.add('route'); continue }
    if (dose === null && !freq) drug.push(words[i]); else instructions = [instructions, words[i]].filter(Boolean).join(' ')
  }
  if (!drug.length) return { error: 'Type the drug name after /rx' }
  const known = findDrug(drug.join(' '))
  const name = known?.name ?? drug.map(cap).join(' ')
  if (dose !== null && !unit && known) unit = known.unit                                                // a bare number takes the drug's own unit; the card checks it against its strengths
  if (!route && known) route = known.route
  const prnReason = prnFor?.join(' ').trim() || null
  if (prn && !prnReason) return { error: 'Say what PRN is for: … prn pain · prn fever · prn wheeze' }
  if (instructions) typed.add('instructions_text'); if (duration) typed.add('duration_days')
  const line = [name, dose !== null ? `${dose}${unit ? ` ${unit}` : ''}` : null, route && route !== 'oral' ? route : null, freq, prn ? `${freq !== 'PRN' ? 'PRN ' : ''}for ${prnReason}` : null, duration ? `× ${duration}d` : null, forProblem ? `for ${forProblem.name}` : null, send ? `→ ${(ctx.send ?? PLAIN_SEND).to}` : null].filter(Boolean).join(' ')
  return { ok: [{ function: 'medication', kind: 'prescription', line, typed: [...typed], params: { action: 'start', drug: known ? { name, code: `atc:${known.atc}` } : { name }, dose_number: dose, dose_unit: dose !== null ? unit : null, route, frequency: freq, prn, prn_reason_text: prnReason, duration_days: duration, instructions_text: instructions, problems: forProblem ? [{ id: forProblem.id, name: forProblem.name }] : [], send } }] }
}

/** services asked for on one line: their codes or names, a preset's name (or shortcut) for its services, "stat" or "urgent", and "? the
 *  question" for them all. scope: only these services (a pack's order command, /lab: the Laboratory's); a word that fits more than one
 *  is asked (its choices, in the card), never guessed (§5.1 rule 1, added 2026-10-07) */
export function orderRequests(rest: string, ctx: Ctx, scope?: (s: Ctx['services'][number]) => boolean, noun = 'service'): Result {
  let priority = 'routine'
  const at = rest.indexOf('?'); const question = at >= 0 ? rest.slice(at + 1).trim() : ''
  const text = (at >= 0 ? rest.slice(0, at) : rest).replace(/\b(urgent|stat)\b/gi, (m) => { priority = m.toLowerCase(); return '' })
  const offered = ctx.services.filter((s) => s.department_id !== ctx.departmentId && (!scope || scope(s)))
  const out: Parsed[] = []; const missing: string[] = []
  const extra = { priority, ...(question ? { question_text: question } : {}) }
  const tail = `${priority !== 'routine' ? ` (${priority})` : ''}${question ? ` ? ${question}` : ''}`
  const add = (s: Ctx['services'][number]) => { if (!out.some((o) => o.params.service_id === s.id)) out.push({ function: 'order', kind: 'request', params: { service_id: s.id, ...extra }, line: `${s.name}${tail} → ${ctx.departments.find((d) => d.id === s.department_id)?.name ?? '?'}` }) }
  const ask = (word: string, hits: Ctx['services']) => out.push({ function: 'order', kind: 'request', params: { choices: hits.map((s) => s.id), word, ...extra }, line: `“${word}”: ${hits.length} fit — choose one` })
  const take = (word: string): boolean => { const hits = matchesOf(offered, word); if (hits.length === 1) add(hits[0]); else if (hits.length > 1) ask(word, hits); return hits.length > 0 }
  for (const seg of text.split(',').map((x) => x.trim()).filter(Boolean)) {
    const tpl = ctx.templates.find((t) => t.shortcut && norm(t.shortcut) === norm(seg)) ?? (seg.length >= 3 ? ctx.templates.find((t) => norm(t.name).startsWith(norm(seg))) : undefined)
    const inTpl = tpl ? tpl.items.map((i) => offered.find((x) => x.id === i.service_id)).filter((x): x is Ctx['services'][number] => !!x) : []
    if (inTpl.length) { inTpl.forEach(add); continue }
    if (take(seg)) continue
    for (const w of seg.split(/\s+/)) if (!take(w)) missing.push(w)
  }
  if (missing.length) return { error: `No ${noun} “${missing.join('”, “')}”` }
  return out.length ? { ok: out } : null
}
const requests = (rest: string, ctx: Ctx) => orderRequests(rest, ctx)

function consult(rest: string, ctx: Ctx): Result {
  const words = rest.trim().split(/\s+/)
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const d = findNamed(ctx.departments.filter((x) => x.id !== ctx.departmentId), words.slice(0, n).join(' '))
    if (d) { const q = words.slice(n).join(' ').trim(); if (!q) return { error: `Type the question for ${d.name}` }
      return { ok: [{ function: 'order', kind: 'consult', params: { to_department_id: d.id, question_text: q, priority: 'routine' }, line: `Consult ${d.name}: ${q}` }] } }
  }
  return { error: 'Start with the department: /order cardiology: chest pain on effort' }
}

function problem(rest: string, now: Date): Result {
  const [first, ...note] = rest.split(';'); let main = first; const text = note.join(';').trim() || null
  let certainty = 'confirmed'; const typed: string[] = []
  main = main.replace(/(^|\s)(\?|susp(ected)?|r\/o|query)(\s|$)/gi, () => { certainty = 'suspected'; return ' ' }).replace(/\?/g, () => { certainty = 'suspected'; return '' })
  const m = main.match(/^(.*?)(?:\s+(?:since|from|x)\s+(\S+))?\s*$/i)
  const name = (m?.[1] ?? '').trim(); if (!name) return { error: 'Type the problem after /dx' }
  let onset: string | null = null
  if (m?.[2]) { onset = partialDate(m[2], now); if (!onset) return { error: `“${m[2]}”: since takes 2019 · 2019-03 · 3y · 6m` }; typed.push('onset_on') }
  if (certainty === 'suspected') typed.push('certainty'); if (text) typed.push('text')
  const known = findProblem(name)
  const n = known?.name ?? cap(name)
  return { ok: [{ function: 'problem', kind: 'problem', typed, params: { action: 'add', name: n, code: known ? `icd10:${known.icd10}` : null, status: 'active', certainty, onset_on: onset, text }, line: `${n}${certainty === 'suspected' ? ' (suspected)' : ''}${onset ? ` · since ${onset}` : ''}${text ? ` — ${text}` : ''}` }] }
}

function allergy(rest: string): Result {
  let kind = 'allergy'; let severity: string | null = null; const extra: string[] = []
  let t = rest.replace(/\b(mild|moderate|severe)\b/gi, (m) => { severity = m.toLowerCase(); return ' ' })
  t = t.replace(/\banaphyla(xis|ctic)\b/gi, () => { severity = 'severe'; extra.push('anaphylaxis'); return ' ' })
  t = t.replace(/\bintol(erance)?\b/gi, () => { kind = 'intolerance'; return ' ' })
  let typed: string; let react: string
  const m = t.match(/^(.*?)(?::|\s[-–]\s)(.*)$/)                        // "co-amoxiclav: rash" · "penicillin - rash"; a hyphen inside a name stays
  if (m) { typed = m[1].trim(); react = m[2] }
  else {                                                                // "penicillin rash": the longest leading run the lists know is the substance
    const ws = t.trim().split(/\s+/).filter(Boolean); let k = ws.length
    while (k >= 1 && !findAllergen(ws.slice(0, k).join(' ')) && !findDrug(ws.slice(0, k).join(' '))) k--
    if (k < 1) k = ws.length
    typed = ws.slice(0, k).join(' '); react = ws.slice(k).join(' ')
  }
  const reactions = [react.replace(/\s+/g, ' ').trim(), ...extra].filter(Boolean).join(', ') || null
  if (!typed) return { error: 'Type the substance after /al' }
  const known = findAllergen(typed); const kd = findDrug(typed)
  const substance = known?.name ?? kd?.name ?? cap(typed); const cls = known?.allergy_class ?? kd?.allergy_class ?? null
  return { ok: [{ function: 'allergy', kind: 'allergy', params: { action: 'add', substance: cls ? { name: substance, class_code: cls } : { name: substance }, kind, reactions_text: reactions, severity }, line: `${kind === 'intolerance' ? 'Intolerance' : 'Allergy'}: ${substance}${reactions ? ` — ${reactions}` : ''}${severity ? ` (${severity})` : ''}` }] }
}

// a label at the start of a note line picks its heading: "hx: 3 months of thirst", "plan: review in 3 months"
const LABELS: [RegExp, string, string][] = [[/^(hx|history)\s*:\s*/i, 'history_physical', 'History'], [/^(ex|exam|examination|o\/e)\s*:\s*/i, 'history_physical', 'Examination'],
  [/^(plan|pl)\s*:\s*/i, 'plan', 'Plan'], [/^(proc|procedure)\s*:\s*/i, 'procedure', 'Procedure']]
export function noteLine(text: string, ctx?: Pick<Ctx, 'noteKind'>): Parsed {
  for (const [re, kind, heading] of LABELS) { const m = text.match(re); if (m && text.slice(m[0].length).trim()) { const t = `${heading}: ${text.slice(m[0].length).trim()}`
    return { function: 'note', kind: 'note', tag: `note:${kind}`, append: true, params: { kind, text: t }, line: t } } }
  const kind = ctx?.noteKind ?? 'progress'
  return { function: 'note', kind: 'note', tag: `note:${kind}`, append: true, params: { kind, text }, line: text }
}
/** "/rx metformin 500" → ['rx', 'metformin 500'] */
export const splitCommand = (s: string): [string, string] => { const m = s.trim().replace(/^\/\s*/, '').match(/^(\S*)\s*([\s\S]*)$/); return [m?.[1] ?? '', (m?.[2] ?? '').trim()] }

export function parse(input: string, ctx: Ctx): Result {
  const s = input.trim(); if (!s) return null
  if (!s.startsWith('/')) return { ok: [noteLine(s, ctx)] }                               // no slash: note text, never an order
  const [word, rest] = aliasLine(splitCommand(s), ctx, !!commandNamed(splitCommand(s)[0], ctx))   // /gcs … is /score gcs …
  const cmd = commandNamed(word, ctx)
  if (!cmd) return { error: `No command /${word} — type / to see them` }
  // the department before the role: a pack's command here says where it works, or where it orders from (a preset's line too)
  const away = notHere(cmd, ctx); if (away) return { error: away }
  if (!allowed(cmd, ctx)) return { error: `/${cmd.name} is not open to your role here` }
  const r = cmd.parse(rest, ctx)
  return r && 'ok' in r ? { ok: r.ok.map((p) => ({ action: cmd.action, ...p })) } : r     // a draft carries the action its command needs
}

/** the one-line summary of a draft, from its fields (the card edits the fields; the line follows) */
export function lineOf(p: Parsed, ctx?: Pick<Ctx, 'services' | 'departments'> & Pick<Partial<Ctx>, 'send'>): string {
  const q = p.params as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (p.function) {
    case 'vitals': return ([['systolic', 'BP'], ['pulse', 'P'], ['temperature', 'T'], ['weight', 'Wt'], ['height', 'Ht'], ['length', 'Length'], ['head', 'Head'], ['spo2', 'SpO₂'], ['respiratory_rate', 'RR']] as const)
      .flatMap(([k, l]) => k === 'systolic' ? (q.systolic != null ? [`BP ${q.systolic}/${q.diastolic ?? '?'}`] : []) : q[k] != null ? [`${l} ${q[k]}${k === 'length' ? ' (lying)' : ''}`] : []).join(' · ')
    case 'medication': return q.action === 'stop' ? `Stop ${q.drug?.name}${q.stop_reason_text ? ` — ${q.stop_reason_text}` : ''}`
      : [q.action === 'change' ? 'Change:' : q.action === 'repeat' ? 'Repeat' : null, q.drug?.name, q.dose_number != null ? `${q.dose_number} ${q.dose_unit ?? ''}`.trim() : null,
         q.route && q.route !== 'oral' ? q.route : null, q.frequency, q.prn ? `${q.frequency !== 'PRN' ? 'PRN ' : ''}${q.prn_reason_text ? `for ${q.prn_reason_text}` : ''}`.trim() || null : null, q.duration_days ? `× ${q.duration_days}d` : null,
         q.problems?.[0]?.name ? `for ${q.problems[0].name}` : null, q.send ? `→ ${(ctx?.send ?? PLAIN_SEND).to}` : null].filter(Boolean).join(' ')
    case 'problem': return `${q.action === 'resolve' ? 'Resolved: ' : q.action === 'update' ? 'Update: ' : ''}${q.name}${q.certainty === 'suspected' ? ' (suspected)' : ''}${q.onset_on ? ` · since ${q.onset_on}` : ''}${q.text ? ` — ${q.text}` : ''}`
    case 'allergy': return q.action === 'refute' ? `Refuted: ${q.substance?.name}` : `${q.kind === 'intolerance' ? 'Intolerance' : 'Allergy'}: ${q.substance?.name}${q.reactions_text ? ` — ${q.reactions_text}` : ''}${q.severity ? ` (${q.severity})` : ''}`
    case 'order': {
      const dname = (id: string | null | undefined) => ctx?.departments.find((d) => d.id === id)?.name ?? '?'
      if (!q.service_id && Array.isArray(q.choices)) return `“${q.word}”: ${q.choices.length} fit — choose one`
      if (!q.service_id) return `Consult ${dname(q.to_department_id)}: ${q.question_text ?? ''}`
      const svc = ctx?.services.find((x) => x.id === q.service_id)
      return `${svc?.name ?? 'Request'}${q.priority && q.priority !== 'routine' ? ` (${q.priority})` : ''}${q.question_text ? ` ? ${q.question_text}` : ''} → ${dname(svc?.department_id)}`
    }
    case 'note': return String(q.text ?? '')
    case 'pregnancy': case 'breastfeeding': case 'alert': return factLine(p)
    case 'score': return scoreLine(q as ScoreParams)
    default: return p.line
  }
}

// ── core's six commands, one per building block; a pack registers its own the same way ──
registerCommand({ name: 'v', group: 'record', title: 'Vitals', aliases: ['vitals', 'bp'], label: 'Vitals — a child’s length and head too (len, hc)', example: '/v 148/92 84 37 86 · /v wt 7.5 len 72.4 hc 45.4', action: 'write:vitals', writes: ['vitals'],
  parse: (rest) => rest ? vitals(rest.split(/\s+/)) : null, empty: () => [{ function: 'vitals', kind: 'vitals', params: {}, line: '' }] })
registerCommand({ name: 'rx', group: 'orders', title: 'Prescription', aliases: ['med'], label: 'Prescription', example: '/rx metformin 500 bd 30d for dm', action: 'write:medication', writes: ['medication'],
  parse: (rest, ctx) => prescription(rest, ctx),
  empty: () => [{ function: 'medication', kind: 'prescription', line: '', params: { action: 'start', drug: { name: '' }, dose_number: null, dose_unit: null, route: null, frequency: null, prn: false, prn_reason_text: null, duration_days: null, instructions_text: null, problems: [] } }] })
registerCommand({ name: 'dx', group: 'record', title: 'Diagnosis', label: 'Problem', example: '/dx hypertension since 3y · /dx ? pneumonia', action: 'write:problem', writes: ['problem'],
  parse: (rest, ctx) => rest ? problem(rest, ctx.now ?? new Date()) : null,
  empty: () => [{ function: 'problem', kind: 'problem', line: '', params: { action: 'add', name: '', code: null, status: 'active', certainty: 'confirmed', onset_on: null, text: null } }] })
const NONE = /^(none|nka|nkda|no known (drug )?allerg(y|ies))$/i
registerCommand({ name: 'al', group: 'record', title: 'Allergy', aliases: ['allergy'], label: 'Allergy', example: '/al penicillin: rash severe · /al none', action: 'write:allergy', writes: ['allergy', 'list_review'],
  parse: (rest) => !rest ? null : NONE.test(rest.trim()) ? { ok: [{ function: 'list_review', kind: 'review', params: { list: 'allergies', outcome: 'none_known' }, line: 'No known allergies' }] } : allergy(rest),
  empty: () => [{ function: 'allergy', kind: 'allergy', line: '', params: { action: 'add', substance: { name: '' }, kind: 'allergy', reactions_text: null, severity: null } }] })
registerCommand({ name: 'order', group: 'orders', title: 'Order', label: 'Request — a service, or a department with a question', example: '/order hba1c, lipid · /order cxr ? pneumonia · /order cardiology: chest pain', action: 'write:order', writes: ['order'],
  parse: (rest, ctx) => {
    if (!rest) return null
    const m = rest.match(/^([^:,]+):\s*([\s\S]+)$/)                                   // "cardiology: chest pain on effort" is a consult
    if (m && findNamed(ctx.departments.filter((d) => d.id !== ctx.departmentId), m[1].trim())) return consult(`${m[1].trim()} ${m[2]}`, ctx)
    const r = requests(rest, ctx)
    if (r && 'error' in r) { const c = consult(rest, ctx); if (c && 'ok' in c) return c }  // "cardiology chest pain": no such test, but a department
    return r
  } })
registerCommand({ name: 'note', group: 'record', title: 'Long note', label: 'Long note under the line', example: '/note · or just type: hx: … · ex: … · plan: …', action: 'write:note', writes: ['note'],
  parse: (rest, ctx) => rest ? { ok: [noteLine(rest, ctx)] } : null, empty: (ctx) => ({ drawer: { kind: ctx.noteKind ?? 'progress', text: '' } }) })
// the base facts the banner shows (facts.ts)
registerCommand({ name: 'preg', group: 'safety', title: 'Pregnancy', aliases: ['pregnant'], label: 'Pregnant or not', example: '/preg 12w · /preg lmp 2026-08-01 · /preg no · /preg end', action: 'write:pregnancy', writes: ['pregnancy'],
  parse: (rest, ctx) => pregnancy(rest, ctx), empty: emptyPregnancy })
registerCommand({ name: 'bf', group: 'safety', title: 'Breastfeeding', aliases: ['breastfeeding'], label: 'Breastfeeding or not', example: '/bf · /bf no · /bf end', action: 'write:breastfeeding', writes: ['breastfeeding'],
  parse: (rest, ctx) => breastfeeding(rest, ctx), empty: emptyBreastfeeding })
registerCommand({ name: 'alert', group: 'safety', title: 'Alert', label: 'Alert — DNR, isolation (HBV, HCV), fall risk', example: '/alert dnr · /alert hbv · /alert fall · /alert end dnr', action: 'write:alert', writes: ['alert'],
  parse: (rest, ctx) => alert(rest, ctx), empty: emptyAlert })
// a score, worked out by the server as the card fills (score.ts); each score's alias too (/gcs)
registerCommand({ name: 'score', group: 'safety', title: 'Score', label: 'Score — GCS and the rest, added up by the server', example: '/score gcs 4 5 6 · /gcs e4 v5 m6', action: 'write:score', writes: ['score'],
  parse: (rest, ctx) => parseScore(rest, ctx), empty: emptyScore })
