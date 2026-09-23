// The speed line (spec 05, Today as drafts): one typed line → one draft. Pure, so it can be tested without a screen.
//   bp 148/92 p 84 t 37.2 w 86        vitals (any vital first; "v" optional)
//   rx metformin 500mg bd 30d for dm   prescription (dose, route, frequency, days, prn, "for <problem>", "; instructions")
//   lab hba1c, lipid  · lab urgent cbc  requests by service code or name, or a preset
//   ref cardiology chest pain on effort consult: a department, then the question
//   dx type 2 diabetes since 2019 ; poorly controlled   problem ("?" or "susp" = suspected; since 2019 · 2019-03 · 3y · 6m)
//   al penicillin: rash severe          allergy ("intol" = intolerance)
//   hx … · ex … · plan … · proc …      a note of that kind;  anything else is added to today's progress note

export interface Ctx {
  services: { id: string; code: string; name: string; department_id: string | null; section_name?: string | null }[]
  templates: { id: string; name: string; items: { service_id: string }[] }[]
  departments: { id: string; name: string }[]
  problems: { id: string; name: string }[]          // on the list and drafted this visit
  departmentId: string                                // this department: its own services are not requested from here
  now?: Date
}
export interface Parsed { function: string; params: Record<string, unknown>; line: string; kind: string; tag?: string; append?: boolean }
export type Result = { ok: Parsed[] } | { error: string } | null

const VITALS: Record<string, [string, string]> = {
  p: ['pulse', 'P'], hr: ['pulse', 'P'], pulse: ['pulse', 'P'], t: ['temperature', 'T'], temp: ['temperature', 'T'],
  w: ['weight', 'Wt'], wt: ['weight', 'Wt'], weight: ['weight', 'Wt'], h: ['height', 'Ht'], ht: ['height', 'Ht'], height: ['height', 'Ht'],
  spo2: ['spo2', 'SpO₂'], sat: ['spo2', 'SpO₂'], sats: ['spo2', 'SpO₂'], o2: ['spo2', 'SpO₂'], rr: ['respiratory_rate', 'RR'],
}
const FREQ: Record<string, string> = {
  od: 'OD', qd: 'OD', daily: 'OD', bd: 'BD', bid: 'BD', tds: 'TDS', tid: 'TDS', qds: 'QDS', qid: 'QDS', q4h: 'q4h', q6h: 'q6h', q8h: 'q8h', q12h: 'q12h',
  weekly: 'weekly', monthly: 'monthly', prn: 'PRN', once: 'once', stat: 'stat', nocte: 'OD', mane: 'OD', hs: 'OD',
}
const FREQ_NOTE: Record<string, string> = { nocte: 'at night', hs: 'at night', mane: 'in the morning' }
const ROUTE: Record<string, string> = { po: 'oral', oral: 'oral', sc: 'sc', sq: 'sc', im: 'im', iv: 'iv', top: 'topical', topical: 'topical', inh: 'inhaled', inhaled: 'inhaled', pr: 'pr', pv: 'pv', sl: 'sl' }
const UNITS = ['mg', 'g', 'mcg', 'ug', 'ml', 'iu', 'u', 'units', 'tab', 'tabs', 'cap', 'caps', 'puff', 'puffs', 'drop', 'drops', 'sachet']
const NOTE_KINDS: Record<string, [string, string]> = { hx: ['history_physical', 'History'], ex: ['history_physical', 'Examination'], exam: ['history_physical', 'Examination'], plan: ['plan', 'Plan'], pl: ['plan', 'Plan'], proc: ['procedure', 'Procedure'], nurse: ['nurse', 'Nurse'], letter: ['letter', 'Letter'] }

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

function vitals(words: string[]): Result {
  const params: Record<string, number> = {}; const parts: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    if (w === 'v' || w === 'vitals') continue
    const bp = (w === 'bp' ? words[++i] ?? '' : w).match(/^(\d{2,3})\/(\d{2,3})$/)
    if (bp) { params.systolic = +bp[1]; params.diastolic = +bp[2]; parts.push(`BP ${bp[1]}/${bp[2]}`); continue }
    const glued = w.match(/^([a-z]+[a-z0-9]*?)(\d+(?:\.\d+)?)$/)          // p84 · t37.2 · spo2 is a key, so check key first
    const key = VITALS[w] ? w : glued && VITALS[glued[1]] ? glued[1] : null
    if (!key) return { error: `Not a vital: “${words[i]}”. Try bp 140/90 p 80 t 37 w 70 h 170 spo2 98 rr 16` }
    const raw = VITALS[w] ? words[++i] : glued![2]
    const n = Number(raw); if (raw === undefined || Number.isNaN(n)) return { error: `${VITALS[key][1]} needs a number` }
    params[VITALS[key][0]] = n; parts.push(`${VITALS[key][1]} ${n}`)
  }
  if (!parts.length) return null
  return { ok: [{ function: 'write_vitals', params, line: parts.join(' · '), kind: 'vitals' }] }
}

function prescription(rest: string, ctx: Ctx): Result {
  const [main, ...instr] = rest.split(';'); let instructions = instr.join(';').trim() || null
  const words = main.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  if (words[0].toLowerCase() === 'for') return { error: 'Type the drug name after rx' }
  const drug: string[] = []; let dose: number | null = null; let unit: string | null = null; let route = 'oral'; let freq: string | null = null
  let days: number | null = null; let prn = false; let forProblem: { id: string; name: string } | null = null
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    const d = w.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/)
    const dur = w.match(/^x?(\d+)\s*(d|days?|w|wk|weeks?|m|mo|months?)$/) ?? (w === 'x' || w === 'for' ? null : w.match(/^x(\d+)$/))
    if (w === 'for' && drug.length && i + 1 < words.length && !/^\d/.test(words[i + 1])) { forProblem = findNamed(ctx.problems, words.slice(i + 1).join(' ')); if (!forProblem) return { error: `No problem “${words.slice(i + 1).join(' ')}” on the list — add it with dx first` }; break }
    if (dur && drug.length) { const n = +dur[1]; const u = dur[2] ?? 'd'; days = u.startsWith('w') ? n * 7 : u.startsWith('m') ? n * 30 : n; continue }
    if (d && drug.length && dose === null && (!d[2] || UNITS.includes(d[2]))) { dose = +d[1]; unit = d[2] ?? (UNITS.includes(words[i + 1]?.toLowerCase()) ? words[++i].toLowerCase() : 'mg'); continue }
    if (FREQ[w] && drug.length) { if (w === 'prn') prn = true; if (!freq || w !== 'prn') freq = FREQ[w]; if (FREQ_NOTE[w]) instructions = [FREQ_NOTE[w], instructions].filter(Boolean).join('; '); continue }
    if (ROUTE[w] && drug.length) { route = ROUTE[w]; continue }
    if (dose === null && !freq) drug.push(words[i]); else instructions = [instructions, words[i]].filter(Boolean).join(' ')
  }
  if (!drug.length) return { error: 'Type the drug name after rx' }
  const name = drug.map(cap).join(' ')
  const line = [name, dose !== null ? `${dose} ${unit}` : null, route !== 'oral' ? route : null, freq, prn && freq !== 'PRN' ? 'PRN' : null, days ? `× ${days}d` : null, forProblem ? `for ${forProblem.name}` : null].filter(Boolean).join(' ')
  return { ok: [{ function: 'write_prescription', kind: 'prescription', line, params: { action: 'start', drug: { name }, dose_number: dose, dose_unit: dose !== null ? unit : null, route, frequency: freq, prn, duration_days: days, instructions_text: instructions, problems: forProblem ? [{ id: forProblem.id, name: forProblem.name }] : [] } }] }
}

function requests(rest: string, ctx: Ctx): Result {
  let priority = 'routine'
  const text = rest.replace(/\b(urgent|stat)\b/gi, (m) => { priority = m.toLowerCase(); return '' })
  const offered = ctx.services.filter((s) => s.department_id !== ctx.departmentId)
  const out: Parsed[] = []; const missing: string[] = []
  const add = (s: Ctx['services'][number]) => { if (!out.some((o) => o.params.service_id === s.id)) out.push({ function: 'write_request', kind: 'request', params: { service_id: s.id, priority }, line: `${s.name}${priority !== 'routine' ? ` (${priority})` : ''} → ${ctx.departments.find((d) => d.id === s.department_id)?.name ?? '?'}` }) }
  for (const seg of text.split(',').map((x) => x.trim()).filter(Boolean)) {
    const tpl = findNamed(ctx.templates, seg)
    if (tpl && norm(tpl.name).startsWith(norm(seg)) && seg.length >= 3) { tpl.items.forEach((i) => { const s = offered.find((x) => x.id === i.service_id); if (s) add(s) }); continue }
    const whole = findNamed(offered, seg)
    if (whole) { add(whole); continue }
    for (const w of seg.split(/\s+/)) { const s = findNamed(offered, w); if (s) add(s); else missing.push(w) }
  }
  if (missing.length) return { error: `No service “${missing.join('”, “')}”` }
  return out.length ? { ok: out } : null
}

function consult(rest: string, ctx: Ctx): Result {
  const words = rest.trim().split(/\s+/)
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const d = findNamed(ctx.departments.filter((x) => x.id !== ctx.departmentId), words.slice(0, n).join(' '))
    if (d) { const q = words.slice(n).join(' ').trim(); if (!q) return { error: `Type the question for ${d.name}` }
      return { ok: [{ function: 'write_request', kind: 'consult', params: { to_department_id: d.id, question_text: q, priority: 'routine' }, line: `Consult ${d.name}: ${q}` }] } }
  }
  return { error: 'Start with the department: ref cardiology …' }
}

function problem(rest: string, now: Date): Result {
  const [first, ...note] = rest.split(';'); let main = first; const text = note.join(';').trim() || null
  let certainty = 'confirmed'
  main = main.replace(/(^|\s)(\?|susp(ected)?|r\/o|query)(\s|$)/gi, () => { certainty = 'suspected'; return ' ' }).replace(/\?/g, () => { certainty = 'suspected'; return '' })
  const m = main.match(/^(.*?)(?:\s+(?:since|from|x)\s+(\S+))?\s*$/i)
  const name = (m?.[1] ?? '').trim(); if (!name) return { error: 'Type the problem after dx' }
  let onset: string | null = null
  if (m?.[2]) { onset = partialDate(m[2], now); if (!onset) return { error: `“${m[2]}”: since takes 2019 · 2019-03 · 3y · 6m` } }
  const n = cap(name)
  return { ok: [{ function: 'write_problem', kind: 'problem', params: { action: 'add', name: n, status: 'active', certainty, onset_on: onset, text }, line: `${n}${certainty === 'suspected' ? ' (suspected)' : ''}${onset ? ` · since ${onset}` : ''}${text ? ` — ${text}` : ''}` }] }
}

function allergy(rest: string): Result {
  let kind = 'allergy'; let severity: string | null = null
  let t = rest.replace(/\b(mild|moderate|severe|anaphylaxis)\b/gi, (m) => { severity = m.toLowerCase() === 'anaphylaxis' ? 'severe' : m.toLowerCase(); return m.toLowerCase() === 'anaphylaxis' ? 'anaphylaxis' : '' })
  t = t.replace(/\bintol(erance)?\b/gi, () => { kind = 'intolerance'; return '' })
  const [sub, ...react] = t.split(/[:\-–]/); const substance = cap(sub.trim()); const reactions = react.join(' ').trim() || null
  if (!substance) return { error: 'Type the substance after al' }
  return { ok: [{ function: 'write_allergy', kind: 'allergy', params: { action: 'add', substance: { name: substance }, kind, reactions_text: reactions, severity }, line: `${kind === 'intolerance' ? 'Intolerance' : 'Allergy'}: ${substance}${reactions ? ` — ${reactions}` : ''}${severity ? ` (${severity})` : ''}` }] }
}

export function parse(input: string, ctx: Ctx): Result {
  const s = input.trim(); if (!s) return null
  const [head, ...tail] = s.split(/\s+/); const h = head.toLowerCase(); const rest = tail.join(' ')
  if (h === 'v' || h === 'vitals' || h === 'bp' || VITALS[h] || /^\d{2,3}\/\d{2,3}$/.test(h) || /^(p|hr|t|w|wt|rr|spo2|sat)\d/.test(h)) {
    const r = vitals(s.split(/\s+/)); if (r && 'ok' in r) return r
    if (h === 'v' || h === 'vitals' || h === 'bp' || /^\d{2,3}\/\d{2,3}$/.test(h)) return r
  }
  if (['rx', 'med', 'drug', 'start'].includes(h)) return prescription(rest, ctx)
  if (['lab', 'labs', 'req', 'order', 'inv', 'img', 'xr', 'test'].includes(h)) return requests(rest, ctx)
  if (['ref', 'consult', 'cons', 'refer'].includes(h)) return consult(rest, ctx)
  if (['dx', 'pb', 'prob', 'problem', 'ddx'].includes(h)) return problem(h === 'ddx' ? `? ${rest}` : rest, ctx.now ?? new Date())
  if (['al', 'alg', 'allergy', 'allergic'].includes(h)) return allergy(rest)
  const nk = NOTE_KINDS[h.replace(/:$/, '')]
  if (nk) return rest ? { ok: [{ function: 'write_note', kind: 'note', tag: `note:${nk[0]}`, append: true, params: { kind: nk[0], text: `${nk[1]}: ${rest}` }, line: `${nk[1]}: ${rest}` }] } : null
  const text = s.replace(/^(note|n):\s*/i, '')
  return { ok: [{ function: 'write_note', kind: 'note', tag: 'note:progress', append: true, params: { kind: 'progress', text }, line: text }] }
}
