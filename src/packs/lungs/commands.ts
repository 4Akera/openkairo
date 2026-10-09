// Respiratory's words on the line (spec/openCare.md §5.8), where the department ticks the pack: /spiro (the base's result), /technique,
// /flare and /plan (the base's observations in the pack's terms). CAT, mMRC, ACT and the GOLD group are its declared scores, offered by
// their aliases (/cat /mmrc /act /gold). Pure.
import { registerCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { parseSpiro } from './spiro'
import { TERMS, ZONES } from './airways'

const term = (code: string, display: string) => ({ text: display, codings: [{ system: TERMS, code, display }] })
const heightOf = (ctx: Ctx) => (ctx.record?.values ?? []).filter((v) => v.key === 'height').sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null
/** the inhaler's technique: "breezhaler: correct" (correct · Breezhaler) or "breezhaler: breathed out into it" (what went wrong) */
export function technique(rest: string): Result {
  const at = rest.indexOf(':'); const device = (at >= 0 ? rest.slice(0, at) : rest.replace(/\bcorrect\b/i, '')).trim(); const said = at >= 0 ? rest.slice(at + 1).trim() : /\bcorrect\b/i.test(rest) ? 'correct' : ''
  if (!device && !said) return null
  const name = device ? device.charAt(0).toUpperCase() + device.slice(1) : 'Inhaler'
  const ok = !said || /^correct\b/i.test(said); const text = ok ? `correct · ${name}` : `${name}: ${said}`
  return { ok: [{ function: 'observation', kind: 'observation', params: { code: term('inhaler_technique', 'Inhaler technique'), value: { text } },
    line: `Inhaler technique · ${ok ? `${name} · correct today` : `${name}: ${said}`}` }] }
}
/** a flare: what it was treated with; "; where" (at home, admitted 4 days) */
export function flare(rest: string): Result {
  const [treated, where] = rest.split(';').map((x) => x.trim()); if (!treated) return null
  return { ok: [{ function: 'observation', kind: 'observation', params: { code: term('flare', 'Flare'), value: { text: treated }, ...(where ? { note: where } : {}) }, line: `Flare · ${treated}${where ? ` · ${where}` : ''}` }] }
}
/** the action plan: the clinic's three zones, in Arabic, edited on the card */
export const PLAN_START = [
  'every day: كل يوم: البخاخة الأساسية زي ما الدكتور كتب، والبخاخة السريعة لما تنهج',
  'worse: لو النهجان زاد أو البلغم كتر أو لونه اتغيّر: البخاخة السريعة بختين كل ٤ ساعات، وكلّم العيادة',
  'emergency: لو مش قادر تتكلم من النهجان، أو شفايفك زرقا، أو مش قادر تنام: روح الطوارئ على طول'].join('\n')
export const planDraft = (text = PLAN_START): Parsed => ({ function: 'observation', kind: 'observation', params: { code: term('action_plan', 'Action plan'), value: { text } }, line: 'Action plan · Arabic' })

export function registerCommands() {
  registerCommand({ name: 'spiro', pack: 'lungs', title: 'Spirometry', label: 'Spirometry — before and after, against GLI-2012', example: '/spiro fev1 1.62 fvc 2.86 post 1.72 2.98 ht 170',
    action: 'write:result', writes: ['result'], parse: (rest, ctx) => rest ? parseSpiro(rest, heightOf(ctx)) : null })
  registerCommand({ name: 'technique', pack: 'lungs', title: 'Inhaler technique', label: 'Inhaler technique — correct, or what went wrong', example: '/technique breezhaler: correct · /technique mdi: no spacer',
    action: 'write:observation', writes: ['observation'], parse: (rest) => technique(rest) })
  registerCommand({ name: 'flare', pack: 'lungs', title: 'Flare', label: 'A flare — treated with; where', example: '/flare prednisolone 5 days ; at home',
    action: 'write:observation', writes: ['observation'], parse: (rest) => flare(rest) })
  registerCommand({ name: 'plan', pack: 'lungs', title: 'Action plan', label: 'The action plan in Arabic — every day, worse, emergency', example: '/plan',
    action: 'write:observation', writes: ['observation'], parse: () => ({ ok: [planDraft()] }), empty: () => [planDraft()] })
}
export const zones = ZONES
