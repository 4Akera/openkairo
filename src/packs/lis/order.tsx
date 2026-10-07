// The laboratory's order word (spec/openCare.md §5.1 rule 1, added 2026-10-07; the pictures "Ordering"): /lab, offered wherever a
// department using the pack works for this one, searching only its tests — by code, name, a preset's name or shortcut, "stat" and
// "? the question"; a word that fits more than one is asked, never guessed (the base's orderRequests). Each test it suggests says
// its tube; under the card, the tubes the patient will give and the fasting to tell them. It offers every service of those
// departments; one that takes no sample (an X-ray a laboratory offers) shows no tube. Pure (npm run test:lis).
import { ordersFrom, registerCommand } from '@core/screens/visit/commands'
import { orderRequests, type Ctx, type Parsed } from '@core/screens/visit/parse'
import { Cap } from './Cap'
import { needsFasting, takesSpecimen, tubeOf, tubesFor } from './tubes'

/** a test a sample is collected for, so it has a tube (its steps say so; with none known, a test of a specimen section) */
export const sampled = (s: Pick<Ctx['services'][number], 'code' | 'section_name' | 'steps'>) => s.steps ? s.steps.includes('collected') : takesSpecimen(s)
const word = (s: Pick<Ctx['services'][number], 'code' | 'section_name' | 'steps'>) => { if (!sampled(s)) return null
  const t = tubeOf(s); return t.cap === 'cup' ? 'cup' : `${t.word.split(' ·')[0].toLowerCase()} tube` }
/** the tests the card holds now (a word still asked is left out until chosen) */
const testsOf = (items: Parsed[], ctx: Ctx) => items.flatMap((p) => { const s = p.function === 'order' && ctx.services.find((x) => x.id === p.params.service_id); return s ? [s] : [] })

/** under the card: the tubes by colour, and the fasting to tell the patient */
export function TubesNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const tests = testsOf(items, ctx).filter(sampled); if (!tests.length) return null
  const groups = tubesFor(tests); const fasting = tests.filter((t) => needsFasting(t.code))
  return <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
    <span>{groups.length} {groups.length === 1 ? 'tube' : 'tubes'} ·</span>
    {groups.map(({ tube }) => <span key={tube.cap} className="inline-flex items-center gap-1"><Cap cap={tube.cap} />{tube.word.split(' ·')[0].toLowerCase()}</span>)}
    {fasting.length > 0 && <span className="font-medium text-warn">· fasting 8 hours for {fasting.map((t) => t.name).join(' and ')}: tell the patient</span>}
  </p>
}

registerCommand({ name: 'lab', pack: 'lis', orders: true, groupTitle: 'Laboratory', title: 'Lab tests', label: 'Lab tests — from the Laboratory',
  example: '/lab cbc, lipid, hba1c · /lab dm follow-up · /lab troponin stat ? chest pain', action: 'write:order', writes: ['order'],
  parse: (rest, ctx) => { if (!rest) return null; const from = ordersFrom('lis', ctx); return orderRequests(rest, ctx, (s) => from.has(s.department_id ?? ''), 'lab test') },
  hint: word, note: (items, ctx) => <TubesNote items={items} ctx={ctx} /> })
