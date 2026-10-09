// The family pack's client (spec/openCare.md §5.7, Q16, Q49, Q50; pictures #family-folder, #family-day, #family-checks). Family medicine
// ticks five packs (its own, chronic care, immunisation, paediatrics, ObGyn), never copies of them. Its own: the household as the pack's own
// table — the Family section (the file and what each member is due, from the packs the department uses) and the Families screen; the
// checks due by age and sex (the Checks section, /checks, a banner word); and the desk's New patient asking to join a file or start one.
import { registerCommand } from '@core/screens/visit/commands'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerNewPatientStep } from '@core/shell/newPatientSteps'
import { PACK, dueWords, stepMissing } from './checks'
import { ChecksNote, parseChecks } from './Compose'
import { Families } from './Families'
import { ChecksSection, FamilySection, checkStates, fileSeen } from './Section'
import { FamilyStep, afterStep, showStep } from './Step'

registerCommand({ name: 'checks', pack: PACK, groupTitle: 'Family medicine', title: 'Checks due', label: 'The checks due by age and sex: the due ones ordered',
  example: '/checks', action: 'write:order', writes: ['order'], parse: (rest, ctx) => parseChecks(rest, ctx), note: (items, ctx) => <ChecksNote items={items} ctx={ctx} />,
  // the command alone is the whole of it: what is due now, the due ones a service here does drafted
  empty: (ctx) => { const r = parseChecks('', ctx); return r && 'ok' in r ? r.ok : [] } })
registerSection({ key: 'familycare.file', title: 'Family', types: [], fit: ANYONE, Body: FamilySection,
  word: (x) => { const f = fileSeen(x.identity.id); return f ? { word: String(f.members.length) } : null } })
registerSection({ key: 'familycare.checks', title: 'Checks', types: [], fit: ANYONE, Body: ChecksSection,
  word: (x) => { const w = dueWords(checkStates(x)); return w ? { word: w.replace(/ checks? due$/, ' due') } : null }, summary: (x) => dueWords(checkStates(x)) })
registerBannerWords({ key: 'familycare.checks', types: [], words: (x) => { const w = dueWords(checkStates({ ...x, facts: undefined })); return w ? [{ word: w, rank: 2, tone: 'warn' }] : [] } })
registerScreen('familycare.files', Families)
registerNewPatientStep(PACK, { show: showStep, Part: FamilyStep, missing: stepMissing, after: afterStep })
export const key = PACK
