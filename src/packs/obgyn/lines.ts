// ObGyn's composer lines (spec/openCare.md §5.7, the pictures #anc-visit, #ob-scan, #ob-gyn, #ob-postnatal), each turned into drafts of
// base entries where the base has the idea and the pack's own types where it has not:
//   /anc bp 118/74 wt 71 sfh 29 fhr 144 ceph nil      the base's vitals (BP, weight) and the pack's antenatal check (the rest)
//   /obus bpd 78 hc 288 ac 245 fl 57 dvp 1.8 post ceph fhr 146   the clinic's scan: the base's result with no order, the fetal weight worked out
//   /fp hormonal iud                                  the method (a base observation by the pack's code); an IUD or implant put in: the base's procedure
//   /periods lmp 2026-09-21 26-28 8-9 heavy clots moderate   the periods' pattern (the pack's own)
//   /pn bp 122/78 bleeding none wound healed breast   the base's vitals, the visit after the birth, breastfeeding (the base's fact)
// The weeks come from the standing pregnancy (its LMP), never typed. Pure.
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { efw, efwCentile, centileWord, fitsWeeks, gestOf, gestText, type Gest } from './pregnancy'

type Q = Record<string, unknown>
const q = (value: number, unit: string, ucum = unit) => ({ value: String(value), unit, ucum })
const num = (s: string | undefined) => s !== undefined && /^\d+(\.\d+)?$/.test(s) ? Number(s) : null
const words = (rest: string) => rest.trim().toLowerCase().split(/\s+/).filter(Boolean)
/** the standing pregnancy's weeks today, when it has an LMP (weeks said without one: the card fills them from the record) */
export const weeksNow = (ctx: Pick<Ctx, 'facts' | 'now'>): Gest | null => {
  const d = ctx.facts?.pregnancy?.data as { pregnant?: boolean; lmp?: { value?: string } } | undefined
  return d?.pregnant && d.lmp?.value ? gestOf({ lmp: d.lmp.value }, ctx.now ?? new Date()) : null
}

// ── the antenatal check ──
export const ANC = 'obgyn.anc'
export interface AncO { weeks?: number; days?: number; sfh?: number; fhr?: number; lie?: string; moves?: string; protein?: string; oedema?: string
  booking?: Record<string, unknown>; taken?: string[]; next_weeks?: number }
const LIE: Record<string, string> = { ceph: 'cephalic', cephalic: 'cephalic', breech: 'breech', br: 'breech', transverse: 'transverse', tr: 'transverse' }
const PROTEIN = new Set(['nil', 'trace', '+', '++', '+++'])
export const ancLine = (o: AncO) => ['Antenatal visit', o.weeks !== undefined ? `${o.weeks}+${o.days ?? 0} w` : null, o.sfh !== undefined ? `fundus ${o.sfh}` : null,
  o.fhr !== undefined ? `FHR ${o.fhr}` : null, o.lie ?? null, o.protein ? `urine ${o.protein}` : null, o.oedema && o.oedema !== 'none' ? `oedema ${o.oedema}` : null,
  o.taken?.length ? `taken: ${o.taken.join(', ')}` : null].filter(Boolean).join(' · ')
/** the check's data: the base observation's code and value (the visit in words), the pack's words under obgyn */
export const ancData = (o: AncO) => ({ code: { text: 'Antenatal visit' }, value: { text: ancLine(o) }, obgyn: o })
export function parseAnc(rest: string, ctx: Pick<Ctx, 'facts' | 'now'>): Result {
  const ws = words(rest); const v: Q = {}; const o: AncO = {}; const said: string[] = []
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]; const next = ws[i + 1]
    const bp = (w === 'bp' ? next ?? '' : w).match(/^(\d{2,3})\/(\d{2,3})$/)
    if (bp) { v.systolic = +bp[1]; v.diastolic = +bp[2]; said.push(`BP ${bp[1]}/${bp[2]}`); if (w === 'bp') i++; continue }
    if ((w === 'wt' || w === 'w' || w === 'weight') && num(next) !== null) { v.weight = num(next); said.push(`Wt ${next}`); i++; continue }
    if ((w === 'sfh' || w === 'fundus') && num(next) !== null) { o.sfh = num(next)!; i++; continue }
    if ((w === 'fhr' || w === 'fh') && num(next) !== null) { o.fhr = Math.round(num(next)!); i++; continue }
    if (LIE[w]) { o.lie = LIE[w]; continue }
    if (w === 'urine' || w === 'protein') continue
    if (PROTEIN.has(w)) { o.protein = w; continue }
    if ((w === 'oedema' || w === 'edema') && next) { o.oedema = next.startsWith('f') && next !== 'face' ? 'feet' : next === 'none' || next === 'nil' ? 'none' : 'face, hands'; i++; continue }
    if (w === 'moves') { o.moves = next === 'less' || next === 'reduced' ? 'less' : 'felt'; if (next) i++; continue }
    if (w === 'next' && num(next?.replace(/w$/, '')) !== null) { o.next_weeks = num(next!.replace(/w$/, ''))!; i++; continue }
    return { error: `Not an antenatal word: “${w}”. Try bp 118/74 wt 71 sfh 29 fhr 144 ceph nil` }
  }
  const g = weeksNow(ctx); if (g) { o.weeks = g.weeks; o.days = g.days }
  const out: Parsed[] = []
  if (v.systolic !== undefined || v.weight !== undefined) out.push({ function: 'vitals', kind: 'vitals', params: v, line: said.join(' · ') })
  out.push({ function: ANC, kind: 'antenatal', params: ancData(o), line: ancLine(o), action: 'write:obgyn.anc' })
  return { ok: out }
}

// ── the clinic's scan: a base result with no order ──
export interface ScanIn { bpd?: number; hc?: number; ac?: number; fl?: number; dvp?: number; afi?: number; placenta?: string; presentation?: string; fhr?: number; moves?: boolean; weeks?: Gest | null }
const PLACENTA: Record<string, string> = { ant: 'anterior', anterior: 'anterior', post: 'posterior', posterior: 'posterior', fundal: 'fundal', low: 'low-lying', 'low-lying': 'low-lying' }
export function parseScan(rest: string, ctx: Pick<Ctx, 'facts' | 'now'>): Result {
  const ws = words(rest); const s: ScanIn = { weeks: weeksNow(ctx) }
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]; const n = num(ws[i + 1])
    if (['bpd', 'hc', 'ac', 'fl', 'dvp', 'afi', 'fhr'].includes(w) && n !== null) { (s as Record<string, unknown>)[w] = n; i++; continue }
    if (PLACENTA[w]) { s.placenta = PLACENTA[w]; continue }
    if (LIE[w]) { s.presentation = LIE[w]; continue }
    if (w === 'moves') { s.moves = true; continue }
    return { error: `Not a scan word: “${w}”. Try bpd 78 hc 288 ac 245 fl 57 dvp 1.8 post ceph fhr 146` }
  }
  return { ok: [{ function: 'result', kind: 'scan', params: scanData(s), line: scanLine(s), action: 'write:result' }] }
}
/** what the scan says, worked out: the fetal weight (Hadlock, from the four), its centile for the weeks, the weeks each measure fits */
export function scanOut(s: ScanIn) {
  const grams = efw(s); const c = grams && s.weeks ? efwCentile(grams, s.weeks) : null
  return { grams, centile: c, fits: { bpd: s.bpd ? fitsWeeks('bpd', s.bpd) : null, hc: s.hc ? fitsWeeks('hc', s.hc) : null, ac: s.ac ? fitsWeeks('ac', s.ac) : null, fl: s.fl ? fitsWeeks('fl', s.fl) : null } }
}
export const scanLine = (s: ScanIn) => { const o = scanOut(s)
  return ['Scan in the clinic', s.weeks ? gestText(s.weeks) : null, o.grams ? `EFW ${o.grams.toLocaleString('en-GB').replace(',', ' ')} g${o.centile !== null ? `, ${centileWord(o.centile)} centile` : ''}` : null,
    s.ac ? `AC ${s.ac} mm` : null, s.dvp !== undefined ? `deepest pool ${s.dvp} cm` : s.afi !== undefined ? `AFI ${s.afi} cm` : null, s.placenta ?? null, s.presentation ?? null, s.fhr ? `FHR ${s.fhr}` : null].filter(Boolean).join(' · ') }
/** the base result's data: each measure, the fetal weight and its centile, the liquor, placenta, presentation and heart an analyte */
export function scanData(s: ScanIn): Q {
  const o = scanOut(s); const a: Q[] = []
  for (const [k, n] of [['bpd', 'BPD'], ['hc', 'HC'], ['ac', 'AC'], ['fl', 'FL']] as const) if (s[k]) a.push({ key: k, name: n, value: q(s[k]!, 'mm') })
  if (o.grams) a.push({ key: 'efw', name: 'Estimated fetal weight (Hadlock)', value: q(o.grams, 'g'), ...(o.centile !== null && o.centile < 10 ? { interpretation: 'L' } : o.centile !== null && o.centile > 90 ? { interpretation: 'H' } : {}) })
  if (o.centile !== null) a.push({ key: 'efw_centile', name: 'Fetal weight centile (Hadlock 1991)', text: centileWord(o.centile) })
  if (s.dvp !== undefined) a.push({ key: 'dvp', name: 'Deepest pool', value: q(s.dvp, 'cm'), ...(s.dvp < 2 ? { interpretation: 'L' } : s.dvp > 8 ? { interpretation: 'H' } : {}) })
  if (s.afi !== undefined) a.push({ key: 'afi', name: 'Amniotic fluid index', value: q(s.afi, 'cm') })
  if (s.placenta) a.push({ key: 'placenta', name: 'Placenta', text: s.placenta })
  if (s.presentation) a.push({ key: 'presentation', name: 'Presentation', text: s.presentation })
  if (s.fhr) a.push({ key: 'fhr', name: 'Fetal heart', value: q(s.fhr, '/min') })
  if (s.weeks) a.push({ key: 'weeks', name: 'Weeks', text: gestText(s.weeks) })
  return { status: 'final', service: { name: 'Scan in the clinic' }, ...(a.length ? { analytes: a } : {}), conclusion: scanLine(s) }
}
/** what a scan's draft holds, read back from its analytes (the card edits it and writes it again) */
export function scanIn(p: Q): ScanIn {
  const a = (p.analytes as { key: string; value?: { value: string }; text?: string }[] | undefined) ?? []
  const n = (k: string) => { const x = a.find((y) => y.key === k)?.value?.value; return x !== undefined ? Number(x) : undefined }
  const t = (k: string) => a.find((y) => y.key === k)?.text
  const w = t('weeks')?.match(/^(\d+)\+(\d)/)
  return { bpd: n('bpd'), hc: n('hc'), ac: n('ac'), fl: n('fl'), dvp: n('dvp'), afi: n('afi'), fhr: n('fhr'), placenta: t('placenta'), presentation: t('presentation'),
    weeks: w ? { weeks: +w[1], days: +w[2] } : null }
}

// ── contraception and the periods ──
export const METHODS = ['Pills', 'Mini-pill', 'Injection', 'Implant', 'Copper IUD', 'Hormonal IUD', 'Condoms', 'Tubes tied', 'None'] as const
const METHOD_WORDS: [RegExp, string][] = [[/^(hormonal|lng|mirena)/, 'Hormonal IUD'], [/^(copper|cu|iud)/, 'Copper IUD'], [/^(mini|pop|exluton)/, 'Mini-pill'], [/^(pill|coc|ocp)/, 'Pills'],
  [/^(inj|dmpa|depo)/, 'Injection'], [/^(implant|implanon)/, 'Implant'], [/^condom/, 'Condoms'], [/^(tubes|btl|tied)/, 'Tubes tied'], [/^(none|nothing)/, 'None']]
export const methodOf = (rest: string) => { const ws = words(rest); for (const [re, m] of METHOD_WORDS) if (ws.some((w) => re.test(w))) return ws.includes('hormonal') ? 'Hormonal IUD' : m; return null }
export const isDevice = (m: string | null | undefined) => !!m && /IUD|Implant/.test(m)
export const METHOD_CODE = { system: 'obgyn.codes', code: 'contraception', display: 'Contraception method' }
export const methodData = (m: string, note?: string): Q => ({ code: { text: 'Contraception method', codings: [METHOD_CODE] }, value: { text: m }, ...(note ? { note } : {}) })
export function parseFp(rest: string): Result {
  const m = methodOf(rest); if (!m) return rest.trim() ? { error: `Which method? ${METHODS.join(', ')}` } : null
  const out: Parsed[] = [{ function: 'observation', kind: 'contraception', params: methodData(m), line: `Contraception · ${m.toLowerCase()} from today`, action: 'write:observation' }]
  if (isDevice(m)) out.push({ function: 'procedure', kind: 'procedure', params: { concept: { text: `${m} inserted` }, status: 'completed', outcome: 'no problems' }, line: `${m} inserted · no problems`, action: 'write:procedure' })
  return { ok: out }
}
export const PERIODS = 'obgyn.periods'
export interface PeriodsO { lmp?: string; cycle_from?: number; cycle_to?: number; days_from?: number; days_to?: number; flow?: 'light' | 'normal' | 'heavy'; clots?: boolean; pads?: number; pain?: 'none' | 'mild' | 'moderate' | 'severe'; note?: string }
export const periodsLine = (o: PeriodsO) => ['Periods', o.lmp ? `LMP ${o.lmp}` : null, o.cycle_from ? `every ${o.cycle_from}${o.cycle_to && o.cycle_to !== o.cycle_from ? `–${o.cycle_to}` : ''} days` : null,
  o.days_from ? `${o.days_from}${o.days_to && o.days_to !== o.days_from ? `–${o.days_to}` : ''} days` : null, [o.flow, o.clots ? 'clots' : null].filter(Boolean).join(', ') || null, o.pain ? `pain ${o.pain}` : null].filter(Boolean).join(' · ')
export const periodsData = (o: PeriodsO) => ({ code: { text: 'Periods', codings: [{ system: 'loinc', code: '8665-2', display: 'Last menstrual period start date' }] }, value: { text: periodsLine(o) }, obgyn: o })
export function parsePeriods(rest: string): Result {
  const ws = words(rest); const o: PeriodsO = {}; const ranges: [number, number][] = []
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]
    if (w === 'lmp' && /^\d{4}-\d{2}-\d{2}$/.test(ws[i + 1] ?? '')) { o.lmp = ws[++i]; continue }
    const r = w.match(/^(\d{1,3})(?:[-–](\d{1,3}))?$/); if (r) { ranges.push([+r[1], +(r[2] ?? r[1])]); continue }
    if (['light', 'normal', 'heavy'].includes(w)) { o.flow = w as PeriodsO['flow']; continue }
    if (w === 'clots') { o.clots = true; continue }
    if (['mild', 'moderate', 'severe'].includes(w)) { o.pain = w as PeriodsO['pain']; continue }
    if (w === 'painless' || w === 'no-pain') { o.pain = 'none'; continue }
    if (w === 'pain') continue
    return { error: `Not a periods word: “${w}”. Try lmp 2026-09-21 26-28 8-9 heavy clots moderate` }
  }
  for (const [a, b] of ranges) { if (a >= 15 && o.cycle_from === undefined) { o.cycle_from = a; o.cycle_to = b } else if (o.days_from === undefined) { o.days_from = a; o.days_to = b } }
  if (!Object.keys(o).length) return null
  return { ok: [{ function: PERIODS, kind: 'periods', params: periodsData(o), line: periodsLine(o), action: 'write:obgyn.periods' }] }
}

// ── the visit after the birth ──
export const PN = 'obgyn.postnatal'
export interface Birth { on: string; weeks?: number; days?: number; where: 'here' | 'elsewhere'; place?: string; how: 'normal' | 'vacuum' | 'forceps' | 'caesarean'; why?: string; baby?: 'boy' | 'girl'; grams?: number }
export interface PnO { days?: number; bleeding?: 'none' | 'light' | 'heavy'; wound?: 'healed' | 'red' | 'oozing' | 'opened'; birth?: Birth }
export const pnLine = (o: PnO) => ['Visit after the birth', o.days !== undefined ? `${Math.floor(o.days / 7)} w` : null, o.bleeding ? (o.bleeding === 'none' ? 'no bleeding' : `${o.bleeding} bleeding`) : null,
  o.wound ? `wound ${o.wound}` : null, o.birth ? `the birth: ${o.birth.on} · ${o.birth.where === 'here' ? 'here' : o.birth.place || 'another hospital'} · ${o.birth.how}${o.birth.baby ? ` · ${o.birth.baby}${o.birth.grams ? ` ${o.birth.grams} g` : ''}` : ''}` : null].filter(Boolean).join(' · ')
export const pnData = (o: PnO) => ({ code: { text: 'Visit after the birth' }, value: { text: pnLine(o) }, obgyn: o })
export function parsePn(rest: string, ctx: Pick<Ctx, 'facts'>): Result {
  const ws = words(rest); const v: Q = {}; const o: PnO = {}; let breast: boolean | null = null
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]; const next = ws[i + 1]
    const bp = (w === 'bp' ? next ?? '' : w).match(/^(\d{2,3})\/(\d{2,3})$/)
    if (bp) { v.systolic = +bp[1]; v.diastolic = +bp[2]; if (w === 'bp') i++; continue }
    if (w === 'bleeding' && ['none', 'light', 'heavy', 'nil'].includes(next ?? '')) { o.bleeding = next === 'nil' ? 'none' : next as PnO['bleeding']; i++; continue }
    if (w === 'wound' && ['healed', 'red', 'oozing', 'opened'].includes(next ?? '')) { o.wound = next as PnO['wound']; i++; continue }
    if (w === 'breast' || w === 'breastfeeding' || w === 'bf') { breast = true; continue }
    if (w === 'formula') { breast = false; continue }
    return { error: `Not a word for the visit after the birth: “${w}”. Try bp 122/78 bleeding none wound healed breast` }
  }
  const out: Parsed[] = []
  if (v.systolic !== undefined) out.push({ function: 'vitals', kind: 'vitals', params: v, line: `BP ${v.systolic}/${v.diastolic}` })
  out.push({ function: PN, kind: 'postnatal', params: pnData(o), line: pnLine(o), action: 'write:obgyn.postnatal' })
  // a pregnancy still standing ends here, once (a birth signed on our labour ward ends it there): the birth's words are the card's
  const preg = ctx.facts?.pregnancy
  if (preg && (preg.data as { pregnant?: boolean }).pregnant) out.push({ function: 'pregnancy', kind: 'pregnancy', params: { action: 'end', entry_id: preg.entry_id, was: preg.data, words: preg.words, reason: 'Delivered' }, line: 'Pregnancy ended · delivered' })
  if (breast !== null) {
    const now = ctx.facts?.breastfeeding
    out.push({ function: 'breastfeeding', kind: 'feeding', params: { breastfeeding: breast, ...(now ? { entry_id: now.entry_id } : {}) }, line: breast ? 'Breastfeeding' : 'Not breastfeeding' })
  }
  return { ok: out }
}
