// Ward nursing's NEWS2 on the base's /v (spec/openCare.md §5.6; the owner's C3, 2026-10-08): where a department uses the pack, a /v with
// NEWS2's five measured signs (BP, pulse, RR, SpO₂, temperature) gives a second draft, the base's score for NEWS2, derived from the
// vitals draft — air or oxygen and ACVPU are the base vitals' own (the owner's Q5), copied one to one; s2 on the line is SpO₂ scale 2.
// The server adds NEWS2 up; the core's score card asks for what the vitals leave out. Under the cards, one line says what to do (RCP
// 2017's response: a notice, never a stop). Pure: npm run test:bedside.
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { current, draft, keyOf, offered, tableOf, type Inputs, type ScoreParams } from '@core/screens/visit/score'
import { ruleNote, type Rules } from './response'
import { fits, type Who } from '@core/screens/chart/sections'
import { ymd } from '@core/ui/time'
import { NEWS2_FIT } from './news2'
export const NEWS2 = 'bedside.news2'
export const NEWS2_S2 = 'bedside.news2_s2'
export type Oxygen = 'air' | 'oxygen'
export type Acvpu = 'a' | 'c' | 'v' | 'p' | 'u'

/** SpO₂ scale 2's answer for a saturation: from 93 % up it depends on air or oxygen (not yet known: undefined, the card asks) */
export function scale2Choice(spo2: number, oxygen?: Oxygen): string | undefined {
  if (spo2 < 84) return 'le83'
  if (spo2 < 86) return '84_85'
  if (spo2 < 88) return '86_87'
  if (spo2 < 93) return '88_92'
  if (oxygen === 'air') return 'ge93_air'
  if (oxygen !== 'oxygen') return undefined
  return spo2 < 95 ? '93_94_o2' : spo2 < 97 ? '95_96_o2' : 'ge97_o2'
}

/** NEWS2's five measured signs: with all of them on the vitals, the ward's /v writes NEWS2 beside them (the picture's "six numbers") */
export const SIGNS = ['systolic', 'pulse', 'respiratory_rate', 'spo2', 'temperature'] as const
const SIGN_WORD: Record<(typeof SIGNS)[number], string> = { systolic: 'BP', pulse: 'P', respiratory_rate: 'RR', temperature: 'T', spo2: 'SpO₂' }
const SAID = ['systolic', 'pulse', 'respiratory_rate', 'temperature', 'spo2'] as const
const given = (x: unknown) => x != null && x !== ''
const isNews2 = (p: Parsed) => p.function === 'score' && (p.params.score === NEWS2 || p.params.score === NEWS2_S2)

/** the ward's /v (the owner's C3): NEWS2 from the vitals draft — rr, spo2 (or spo2_s2 by scale2Choice), oxygen, sbp, pulse,
 *  consciousness, temp, each as text; s2 said on the line, or kept from the NEWS2 before it, is scale 2 */
export function news2From(drafts: Parsed[], ctx: Pick<Ctx, 'scores' | 'packs' | 'can'> & Partial<Pick<Ctx, 'record' | 'now'>>, more: { said: string[]; prev: Parsed[] }): Parsed[] {
  const v = drafts.find((x) => x.function === 'vitals')?.params
  if (!v || !SIGNS.every((k) => given(v[k]))) return []
  // NEWS2 is for 16 and over: a child's /v (the children's ward ticks the pack, 2026-10-10) writes the vitals alone; an age not known fits
  const p = ctx.record?.patient
  if (p && !fits(NEWS2_FIT, { sex: p.sex as Who['sex'], birth: p.born_on ?? null, today: ymd((ctx.now ?? new Date()).toISOString()) })) return []
  if (ctx.can && !ctx.can('write:score')) return []
  const prev = more.prev.find(isNews2); const was = prev?.params as unknown as ScoreParams | undefined
  const s2 = more.said.some((w) => w === 's2' || w === 'scale2') || was?.score === NEWS2_S2
  const t = offered(ctx.scores, ctx.packs).find((x) => x.key === (s2 ? NEWS2_S2 : NEWS2)); if (!t) return []
  const same = !!was && was.score === t.key && was.version === t.version
  // air or oxygen and ACVPU: the vitals', else what was chosen on NEWS2's own card (the vitals win once they say it)
  const keep = (k: string, x: unknown) => typeof x === 'string' && x ? x : same && typeof was!.inputs[k] === 'string' ? was!.inputs[k] as string : undefined
  const oxygen = keep('oxygen', v.oxygen === 'air' || v.oxygen === 'oxygen' ? v.oxygen : undefined) as Oxygen | undefined
  const acvpu = keep('consciousness', v.consciousness)
  const inputs: Inputs = { rr: String(v.respiratory_rate) }
  if (!s2) inputs.spo2 = String(v.spo2)
  else {
    // scale 2 from the saturation as it is now; an answer chosen on the card is kept only while it still fits that saturation
    const n = Number(v.spo2); const c = scale2Choice(n, oxygen) ?? (same ? was!.inputs.spo2_s2 : undefined)
    if (typeof c === 'string' && (c === scale2Choice(n, 'air') || c === scale2Choice(n, 'oxygen'))) inputs.spo2_s2 = c
  }
  if (oxygen) inputs.oxygen = oxygen
  inputs.sbp = String(v.systolic); inputs.pulse = String(v.pulse)
  if (acvpu) inputs.consciousness = acvpu
  inputs.temp = String(v.temperature)
  if (prev && was && keyOf(was) === keyOf({ score: t.key, version: t.version, inputs })) return [prev]   // the same: the server's answer is kept
  return [draft(t, inputs)]
}

export interface ObsNote { text: string; tone?: 'warn' | 'danger' }
/** the score input each vitals key answers, and its word in the differ line */
const SAME: [string, string, string][] = [['respiratory_rate', 'rr', 'Respiration rate'], ['systolic', 'sbp', 'Systolic BP'], ['pulse', 'pulse', 'Pulse'],
  ['temperature', 'temp', 'Temperature'], ['spo2', 'spo2', 'SpO₂'], ['oxygen', 'oxygen', 'Air or oxygen'], ['consciousness', 'consciousness', 'ACVPU']]
const WORDS = new Set(['oxygen', 'consciousness'])
const en = (l?: Record<string, string>) => l?.en ?? ''
/** "P, RR and SpO₂" */
const and = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join('')

/** the lines under the cards: why there is no NEWS2, scale 2's reminder, pregnancy's caution, what NEWS2 still needs, a value the two
 *  cards no longer agree on, and once the server has added it up, RCP 2017's response for the total (the ward's own, given its rules) */
export function obsNotes(items: Parsed[], ctx: Pick<Ctx, 'scores' | 'facts' | 'can' | 'packs'>, rules?: Rules, now = Date.now()): ObsNote[] {
  const out: ObsNote[] = []
  const sp = items.find(isNews2)
  const p = sp?.params as unknown as ScoreParams | undefined
  const vit = items.find((x) => x.function === 'vitals')?.params as Record<string, unknown> | undefined
  const missing = vit ? SAID.filter((k) => !given(vit[k])) : []   // in the words' order: BP, P, RR, T, SpO₂
  if (vit && !p && !missing.length) {
    if (!offered(ctx.scores, ctx.packs).some((x) => x.key === NEWS2)) out.push({ text: 'NEWS2 is not declared here: Settings → Scores', tone: 'warn' })
    else if (ctx.can && !ctx.can('write:score')) out.push({ text: 'NEWS2 is not for your role here: the vitals go alone' })
  }
  if (vit && missing.length && missing.length < SIGNS.length)
    out.push({ text: `No NEWS2 yet: it comes with BP, P, RR, T and SpO₂ — ${and(missing.map((k) => SIGN_WORD[k]))} to go (/v 105/68 104 38.4 spo2 94 rr 22 air a)` })
  if (p?.score === NEWS2_S2) out.push({ text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' })
  if (p && ctx.facts?.pregnancy?.data.pregnant === true) out.push({ text: 'Pregnant: NEWS2 is not made for pregnancy — read it with care', tone: 'warn' })
  if (p) {
    const what = [['oxygen', 'air or oxygen'], ['consciousness', 'ACVPU']].filter(([k]) => p.inputs[k] === undefined && !given(vit?.[k])).map(([, w]) => w)
    if (what.length) out.push({ text: `NEWS2 needs ${and(what)}: choose on the vitals card, or say it on the line (air or oxygen · a, c, v, pain, u)` })
  }
  if (p && vit) for (const [vk, sk, label] of SAME) {
    if (sk === 'spo2' && p.score !== NEWS2) continue
    const a = given(vit[vk]) ? vit[vk] : undefined; const b = typeof p.inputs[sk] === 'string' ? p.inputs[sk] : undefined
    if (a === undefined && b === undefined) continue
    if (a === undefined) out.push({ text: `The ${label} is on NEWS2 (${b}) but not on the vitals: choose it on the vitals card too`, tone: 'warn' })
    else if (b === undefined) out.push({ text: `The ${label} is on the vitals (${a}) but not on NEWS2`, tone: 'warn' })
    else if (WORDS.has(sk) ? String(a) !== b : Number(a) !== Number(b)) out.push({ text: `The ${label} on the vitals (${a}) and on NEWS2 (${b}) differ: change it on the vitals card`, tone: 'warn' })
  }
  if (p?.score === NEWS2_S2) out.push(...scale2Notes(p, vit, ctx))
  if (p && current(p) && p.result?.complete) out.push(rules ? ruleNote(p, ctx, rules, now) : response(p, ctx))
  return out
}

/** scale 2's answer against air or oxygen, and against the saturation on the vitals: the one choice holds both, so they can part */
function scale2Notes(p: ScoreParams, vit: Record<string, unknown> | undefined, ctx: Pick<Ctx, 'scores'>): ObsNote[] {
  const out: ObsNote[] = []; const c = p.inputs.spo2_s2; const ox = p.inputs.oxygen
  const choice = typeof c === 'string' ? c : undefined
  const words = (k: string, value: string) => en(tableOf(ctx.scores, p.score, p.version)?.items.find((x) => x.key === k)?.choices?.find((x) => x.value === value)?.labels) || value
  if (choice && ((choice === 'ge93_air' && ox === 'oxygen') || (choice.endsWith('_o2') && ox === 'air')))
    return [{ text: `NEWS2's SpO₂ answer (${words('spo2_s2', choice)}) does not fit its air or oxygen answer (${words('oxygen', String(ox))}): choose again`, tone: 'warn' }]
  const n = vit && given(vit.spo2) ? Number(vit.spo2) : undefined
  if (n === undefined) { if (choice) out.push({ text: `The SpO₂ is on NEWS2 (${words('spo2_s2', choice)}) but not on the vitals: change it on the vitals card`, tone: 'warn' }) }
  else if (choice) {
    const want = scale2Choice(n, ox === 'air' || ox === 'oxygen' ? ox : undefined)
    if (want !== undefined && want !== choice)
      out.push({ text: `The SpO₂ on the vitals (${n}) and NEWS2's scale 2 answer (${words('spo2_s2', choice)}) differ: change it on the vitals card`, tone: 'warn' })
  }
  return out
}

/** RCP 2017's response to a total (no rules given: the node tests; the ward's own is ruleNote's) */
function response(p: ScoreParams, ctx: Pick<Ctx, 'scores'>): ObsNote {
  const r = p.result!; const t = r.total ?? 0; const band = r.band?.key
  if (band === 'high') return { text: `NEWS2 ${t} · high · emergency response: watch continuously; tell the doctor now; think of ICU`, tone: 'danger' }
  if (band === 'medium') return { text: `NEWS2 ${t} · medium · urgent response: obs every hour; tell the doctor now`, tone: 'warn' }
  const threes = r.items.filter((i) => i.points === 3)
  if (threes.length) {
    const table = tableOf(ctx.scores, p.score, p.version)
    const names = threes.map((i) => en(table?.items.find((x) => x.key === i.key)?.labels) || i.key)
    return { text: `3 in one sign (${names.join(', ')}) · obs every hour; tell the doctor caring for the patient`, tone: 'warn' }
  }
  if (t === 0) return { text: 'NEWS2 0 · obs at least every 12 hours' }
  return { text: `NEWS2 ${t} · low · obs every 4–6 hours; tell the nurse in charge` }
}
