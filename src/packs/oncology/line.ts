// Oncology's two words on the composer's line (spec/openCare.md §5.7; the pictures #onc-plan, #onc-cycle). Pure.
//   /cancer ecog 1                     the cancer's card: a new cancer when none is on record; on one, ECOG (the base's observation)
//   /chemo ac 3 · /chemo pac 4 reduce 20 · /chemo folfox delay 7 · /chemo ac 3 fn3 nausea2 muc1 neu0 peg
// /chemo is the pack's order to the day unit (it extends the base's order): the regimen from the clinic's list, the cycle (the next one
// when not typed), today's height and weight, BSA by Mosteller, each dose worked out and rounded, the checks against the latest values
// (shown, never a stop), Give · Delay · Reduce, the toxicity since the last cycle graded (CTCAE v5, each the base's observation), each
// drug the base's medication, sent where prescriptions go. It is offered wherever the day unit works for this department (rule 1).
import { ordersFrom } from '@core/screens/visit/commands'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { ASKED, TOXICITIES, anthracycline, cancersOf, checksOf, ckdEpi2021, cyclesOf, dosesOf, mg, nextCycle, regimenNamed, type CycleWords, type Entry, type Regimen, type Regimens, type Value } from './model'

export const ECOG = { system: 'loinc', code: '89247-1', display: 'ECOG performance status' }
type Rec = NonNullable<Ctx['record']>
const valuesOf = (r: Rec | undefined): Value[] => (r?.values ?? []).map((v) => ({ key: v.key, code: v.code, value: Number(v.value), at: v.at }))
const latest = (vals: Value[], key: string) => vals.filter((v) => v.key === key).sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null

// ── /cancer ──
const STAGE = /^(0|i{1,3}[abc]?|iv[abc]?)$/i
export function parseCancer(rest: string, ctx: Ctx, entries: Entry[]): Result {
  const words = rest.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const on = cancersOf(entries).find((c) => c.active)
  let ecog: number | null = null; let stage: string | null = null; let intent: string | null = null; let side: string | null = null; const other: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === 'ecog' && /^[0-4]$/.test(words[i + 1] ?? '')) { ecog = Number(words[++i]); continue }
    if (/^ecog[0-4]$/.test(w)) { ecog = Number(w.slice(4)); continue }
    if (STAGE.test(w)) { stage = w.toUpperCase(); continue }
    if (w === 'curative' || w === 'palliative') { intent = w; continue }
    if (w === 'left' || w === 'right' || w === 'both') { side = w; continue }
    other.push(w)
  }
  const out: Parsed[] = []
  const was = latestEcog(ctx)
  if (on) {
    // a cancer on record: today ECOG is a new observation; the cancer itself is changed only by a correction of its entry
    if (stage || intent || side || other.length) return { error: `The cancer on record (${on.name}) is changed by correcting its entry: the line adds today's ECOG — /cancer ecog 1` }
    if (ecog == null) return words.length ? null : { ok: [] }
    out.push(ecogItem(ecog, was))
    return { ok: out }
  }
  const site = other.join(' ')
  out.push({ function: 'oncology.cancer', action: 'write:oncology.cancer', kind: 'problem', line: cancerLine(site, stage, intent),
    params: { concept: { text: site ? site.charAt(0).toUpperCase() + site.slice(1) : '', codings: [] }, category: 'problem-list-item', clinical_status: 'active', verification: 'confirmed',
      ...(side ? { laterality: side } : {}), oncology: { ...(site ? { site: other[0] } : {}), ...(side ? { side } : {}), ...(stage ? { stage } : {}), ...(intent ? { intent } : {}) } } })
  if (ecog != null) out.push(ecogItem(ecog, was))
  return { ok: out }
}
export const cancerLine = (name: string, stage?: string | null, intent?: string | null) => ['Cancer', name, stage, intent].filter(Boolean).join(' · ')
function latestEcog(ctx: Ctx): { value: number; at: string } | null {
  const v = (ctx.record?.values ?? []).filter((x) => x.code?.replace(/^loinc:/, '') === ECOG.code || x.key === 'ecog').sort((a, b) => b.at.localeCompare(a.at))[0]
  return v ? { value: Number(v.value), at: v.at } : null
}
const shortDay = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export function ecogItem(n: number, was: { value: number; at: string } | null): Parsed {
  return { function: 'observation', action: 'write:observation', kind: 'observation', line: `ECOG ${n}${was ? ` · was ${was.value} on ${shortDay(was.at)}` : ''}`,
    params: { code: { text: ECOG.display, codings: [{ ...ECOG }] }, value: { quantity: { value: String(n), unit: 'score', ucum: '{score}' } } } }
}

// ── /chemo ──
export interface ChemoSaid { regimen: string; cycle: number | null; day: number; decision: 'give' | 'delay' | 'reduce'; delay: number; reduce: number; tox: Record<string, number>; peg: boolean }
export function chemoWords(rest: string): ChemoSaid | { error: string } | null {
  const words = rest.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const s: ChemoSaid = { regimen: '', cycle: null, day: 1, decision: 'give', delay: 7, reduce: 0, tox: {}, peg: false }
  const name: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === 'give') { s.decision = 'give'; continue }
    if (w === 'delay') { s.decision = 'delay'; if (/^\d+$/.test(words[i + 1] ?? '')) s.delay = Number(words[++i]); continue }
    if (w === 'reduce') { s.decision = 'reduce'; const n = (words[i + 1] ?? '').replace('%', ''); if (/^\d+$/.test(n)) { s.reduce = Number(n); i++ } continue }
    if (w === 'day' && /^\d+$/.test(words[i + 1] ?? '')) { s.day = Number(words[++i]); continue }
    if (/^d\d+$/.test(w)) { s.day = Number(w.slice(1)); continue }
    if (w === 'peg' || w === 'pegfilgrastim') { s.peg = true; continue }
    const tox = w.match(/^([a-z]{2,})([0-5])$/)
    const t = tox ? TOXICITIES.find((x) => x.key.startsWith(tox[1]) || x.term.toLowerCase().startsWith(tox[1])) : undefined
    if (tox && t && !name.length) return { error: 'Type the regimen first: /chemo ac 3 …' }
    if (tox && t) { s.tox[t.key] = Number(tox[2]); continue }
    if (/^(c)?\d+$/.test(w) && name.length && s.cycle == null) { s.cycle = Number(w.replace('c', '')); continue }
    if (s.cycle != null || Object.keys(s.tox).length) return { error: `Not understood: “${w}”. Try /chemo ac 3 · reduce 20 · delay 7 · fn3 nausea2` }
    name.push(w)
  }
  s.regimen = name.join(' ')
  if (!s.regimen) return { error: 'Type the regimen after /chemo: /chemo ac 3' }
  if (s.decision === 'reduce' && ![10, 20, 25].includes(s.reduce)) return { error: 'Reduce by 10, 20 or 25 %: /chemo ac 3 reduce 20' }
  return s
}
/** the line again from what was said, changed: the card's chips rewrite it, so the line always says what the drafts hold */
export function chemoLine(s: ChemoSaid, change: Partial<ChemoSaid> = {}): string {
  const x = { ...s, ...change, tox: { ...s.tox, ...(change.tox ?? {}) } }
  return ['/chemo', x.regimen, x.cycle ?? '', x.day !== 1 ? `day ${x.day}` : '', x.decision === 'delay' ? `delay ${x.delay}` : x.decision === 'reduce' ? `reduce ${x.reduce}` : '',
    ...Object.entries(x.tox).map(([k, g]) => `${k}${g}`), x.peg ? 'peg' : ''].filter((w) => w !== '').join(' ') + ' '
}
const today = (now = new Date()) => now.toISOString().slice(0, 10)
const addDays = (n: number, now = new Date()) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString() }
const ROUTE = (how?: string) => /mouth|oral/i.test(how ?? '') ? 'oral' : /\bsc\b|subcut/i.test(how ?? '') ? 'sc' : 'iv'

export function parseChemo(rest: string, ctx: Ctx, seen: { regimens: Regimens; entries: Entry[] }): Result {
  const s = chemoWords(rest)
  if (!s || 'error' in s) return s
  const from = ordersFrom('oncology', ctx)
  const svc = ctx.services.find((x) => x.department_id && from.has(x.department_id) && x.code === 'chemo')
  if (!svc) return { error: 'No chemotherapy day unit takes cycles from this department' }
  if (!seen.regimens.regimens.length) return { error: 'The clinic has no regimens yet (Settings → Packs → Oncology), or the chart is still reading them' }
  const found = regimenNamed(seen.regimens.regimens, s.regimen)
  if (!found) return { error: `No regimen “${s.regimen}” in the clinic's list` }
  if (Array.isArray(found)) return { error: `“${s.regimen}” fits ${found.map((r) => r.name).join(', ')}: type more of it` }
  return { ok: cycleItems(found, s, ctx, seen.entries, ctx.now ?? new Date()) }
}

/** the cycle, each drug sent on, each toxicity graded: the drafts one /chemo line writes */
export function cycleItems(r: Regimen, s: ChemoSaid, ctx: Ctx, entries: Entry[], now = new Date()): Parsed[] {
  const vals = valuesOf(ctx.record); const cycles = cyclesOf(entries); const female = ctx.record?.patient?.sex === 'female'
  const cycle = s.cycle ?? nextCycle(cycles, r.key)
  const percent = s.decision === 'reduce' ? 100 - s.reduce : 100
  const height = latest(vals, 'height'); const weight = latest(vals, 'weight')
  const worked = dosesOf(r, { height, weight, age: ctx.record?.patient?.age ?? null, female, creat: latest(vals, 'creat') }, percent)
  const creat = latest(vals, 'creat'); const age = ctx.record?.patient?.age ?? null
  const checks = checksOf(r, vals, creat != null && age != null && age >= 18 ? ckdEpi2021(creat, age, female) : null)
  const tox = Object.entries(s.tox).map(([k, g]) => ({ t: TOXICITIES.find((x) => x.key === k)!, g })).filter((x) => x.t)
  const from = ordersFrom('oncology', ctx)
  const svc = ctx.services.find((x) => x.department_id && from.has(x.department_id) && x.code === 'chemo')!
  const unit = ctx.departments.find((d) => d.id === svc.department_id)?.name ?? 'Chemotherapy day unit'
  const words: CycleWords = { regimen: r.key, name: r.name, cycle, ...(r.cycles ? { of: r.cycles } : {}), day: s.day, ...(height ? { height } : {}), ...(weight ? { weight } : {}),
    ...(worked.bsa ? { bsa: worked.bsa } : {}), percent, decision: s.decision, ...(s.decision === 'delay' ? { delay_days: s.delay } : {}),
    doses: worked.doses.map((d) => ({ drug: d.drug, per: d.per, basis: d.basis, worked: d.worked, dose: d.dose, unit: d.unit, ...(d.how ? { how: d.how } : {}) })),
    checks: checks.map((c) => ({ text: c.text, ...(c.ok != null ? { ok: c.ok } : {}) })), ...(tox.length ? { toxicity: tox.map((x) => ({ term: x.t.term, grade: x.g })) } : {}),
    ...(r.premeds?.length ? { premeds: r.premeds } : {}), ...(s.peg ? { added: ['Pegfilgrastim 6 mg SC, 24–72 h after'] } : {}) }
  const due = s.decision === 'delay' ? addDays(s.delay, now) : now.toISOString()
  const decided = s.decision === 'give' ? 'Give' : s.decision === 'delay' ? `Delay ${s.delay} days` : `Reduce ${s.reduce} %`
  const items: Parsed[] = [{ function: 'oncology.cycle', action: 'write:order', kind: 'order', tag: 'oncology:cycle',
    line: `${r.name} · cycle ${cycle} day ${s.day}${worked.bsa ? ` · BSA ${worked.bsa} (${height} cm, ${weight} kg)` : ''} · ${percent} % · ${decided} → ${unit}`,
    params: { service: { id: svc.id, code: svc.code, name: svc.name }, department_id: svc.department_id, priority: 'routine', status: 'active', due, oncology: words } }]
  if (s.decision !== 'delay') for (const d of worked.doses) items.push({ function: 'medication', action: 'write:medication', kind: 'prescription',
    line: `${d.drug} ${mg(d.dose)} mg ${ROUTE(d.how).toUpperCase()} · ${r.name} ${cycle}${ctx.send ? ` → ${ctx.send.chip.replace(/^Send to /i, '')}` : ''}`,
    params: { action: 'start', drug: { name: d.drug, ...(d.atc ? { code: `atc:${d.atc}` } : {}) }, dose_number: d.dose, dose_unit: 'mg', route: ROUTE(d.how), frequency: 'once', duration_days: 1,
      instructions_text: `${r.name} cycle ${cycle} day ${s.day} · ${d.why} = ${d.worked} → ${mg(d.dose)} mg${d.how ? ` · ${d.how}` : ''}`, send: !!ctx.send } })
  if (s.peg && s.decision !== 'delay') items.push({ function: 'medication', action: 'write:medication', kind: 'prescription', line: 'Pegfilgrastim 6 mg SC · 24–72 h after the cycle',
    params: { action: 'start', drug: { name: 'Pegfilgrastim', code: 'atc:L03AA13' }, dose_number: 6, dose_unit: 'mg', route: 'sc', frequency: 'once', duration_days: 1,
      instructions_text: `24–72 hours after ${r.name} ${cycle} · for febrile neutropenia after the last cycle`, send: !!ctx.send } })
  for (const x of tox) items.push({ function: 'observation', action: 'write:observation', kind: 'observation', line: `${x.t.term} · grade ${x.g} · CTCAE v5`,
    params: { code: { text: x.t.term, codings: [{ system: 'oncology.ctcae', code: x.t.code, display: x.t.term }] }, value: { quantity: { value: String(x.g), unit: 'grade', ucum: '{score}' } }, method: 'CTCAE v5' } })
  return items
}
/** the toxicities to ask about on the card: the four the picture asks, then any already said */
export const toxAsked = (s: ChemoSaid) => [...ASKED, ...Object.keys(s.tox).filter((k) => !ASKED.includes(k))].map((k) => TOXICITIES.find((t) => t.key === k)!).filter(Boolean)
export { anthracycline, today }
