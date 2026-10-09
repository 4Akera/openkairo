// Chronic care's words in the composer (spec/openCare.md §5.8; picture #chronic-visit): /review dm — the yearly review of a condition:
// the feet and the eyes as the base's observations (coded chroniccare.check:feet, :eyes; their card chooses what was found), and the tests
// its checks say are due drafted as the base's orders, each one left out with ×; /target htn bp < 150/90 ; 81, falls — a patient's own
// target with its reason (the pack's one type). Pure.
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { MEASURES, TARGET_TYPE, checkOf, conditionsOf, type Condition, type Op } from './model'

export const CHECK_SYSTEM = 'chroniccare.check'
const findCondition = (cs: Condition[], w: string) => { const s = w.toLowerCase().trim()
  return cs.find((c) => c.key.toLowerCase() === s) ?? cs.find((c) => c.name.toLowerCase().startsWith(s)) ?? (s === 'diabetes' || s === 't2dm' ? cs.find((c) => c.key === 'dm') : undefined) }

/** a review observation's draft: the base's observation, coded by the pack's check */
export function reviewDraft(code: 'feet' | 'eyes', name: string, text = '', note = ''): Parsed {
  const data = { code: { text: name, codings: [{ system: CHECK_SYSTEM, code, display: name }] }, value: { text: text || 'not examined yet' }, ...(note ? { note } : {}) }
  return { function: 'observation', kind: 'review', action: 'write:observation', params: data, line: reviewLine(data) }
}
export const reviewLine = (d: { code?: { text?: string }; value?: { text?: string }; note?: string }) => `${d.code?.text ?? 'Review'}: ${d.value?.text ?? ''}${d.note ? ` (${d.note})` : ''}`

/** "/review dm": the condition's yearly review — feet and eyes where its checks have them, and its due tests as orders a service here
 *  offers (an analyte with the check's code) */
export function parseReview(rest: string, ctx: Ctx): Result {
  const cs = conditionsOf(ctx.org).conditions
  if (!rest.trim()) return { error: `Which condition? ${cs.map((c) => `/review ${c.key}`).join(' · ') || 'none set (Settings → Packs → Chronic care)'}` }
  const c = findCondition(cs, rest.split(/[;\s]+/)[0])
  if (!c) return { error: `No condition “${rest.trim()}” in the clinic's list: ${cs.map((x) => x.key).join(', ')}` }
  const items: Parsed[] = []
  const has = (code: string) => (c.checks ?? []).some((ch) => ch.codes.includes(`${CHECK_SYSTEM}:${code}`))
  if (has('feet')) items.push(reviewDraft('feet', 'Feet'))
  if (has('eyes')) items.push(reviewDraft('eyes', 'Eyes'))
  const values = (ctx.record?.values ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
  for (const ch of c.checks ?? []) {
    if (ch.codes.every((x) => x.startsWith(`${CHECK_SYSTEM}:`))) continue
    const st = checkOf(ch, values, [], false, ctx.now ?? new Date())
    if (!st.due) continue
    const svc = serviceFor(ch.codes, ctx)
    if (svc) items.push({ function: 'order', kind: 'request', action: 'write:order', params: { service_id: svc.id, priority: 'routine' }, line: `${svc.name} → ${ctx.departments.find((d) => d.id === svc.department_id)?.name ?? ''}`.trim() })
  }
  // each draft names the condition it reviews (its tag), so the words under the card know it
  return items.length ? { ok: items.map((i) => ({ ...i, tag: `chroniccare:${c.key}` })) } : { error: `${c.name} has no checks to review here` }
}
/** the service here that does a check: one whose results carry one of its codes (its own coding or an analyte's) */
export function serviceFor(codes: string[], ctx: Pick<Ctx, 'services'>) {
  const svcs = ctx.services as (Ctx['services'][number] & { coding?: { system: string; code: string } | null; fields?: { code: string }[] })[]
  return svcs.find((s) => (s.coding && codes.includes(`${s.coding.system}:${s.coding.code}`)) || (s.fields ?? []).some((f) => codes.includes(f.code)))
}

/** "/target htn bp < 150/90 ; 81, falls": a patient's own target for a condition, with its reason */
export function parseTarget(rest: string, ctx: Ctx): Result {
  if (!rest.trim()) return null
  const [main, ...why] = rest.split(';'); const reason = why.join(';').trim()
  const m = main.trim().match(/^(\S+)\s+(\S+)\s*(<=|>=|<|>|≤|≥)\s*(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/)
  if (!m) return { error: 'Type the condition, the measure and the target: /target htn bp < 150/90 ; why' }
  const cs = conditionsOf(ctx.org).conditions; const c = findCondition(cs, m[1])
  if (!c) return { error: `No condition “${m[1]}”: ${cs.map((x) => x.key).join(', ')}` }
  const measure = m[2].toLowerCase(); if (!MEASURES[measure]) return { error: `Not a measure: ${m[2]}. Try ${Object.keys(MEASURES).join(', ')}` }
  const op = ({ '≤': '<=', '≥': '>=' } as Record<string, Op>)[m[3]] ?? m[3] as Op
  const params = { condition: c.key, measure, op, value: Number(m[4]), ...(m[5] ? { value2: Number(m[5]) } : {}), ...(reason ? { reason } : {}), status: 'active' }
  return { ok: [{ function: TARGET_TYPE, kind: 'target', params, line: `Own target · ${MEASURES[measure].name} ${m[3]} ${m[4]}${m[5] ? `/${m[5]}` : ''} · ${c.name.toLowerCase()}${reason ? ` · ${reason}` : ''}` }] }
}
