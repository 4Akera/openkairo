// The chronic care pack's client (spec/openCare.md §5.8, Q28–Q30; pictures #chronic-visit, #chronic-list): a shared pack. Registers come
// from the problem list's codes; each condition's targets and checks are the clinic's (a patient's own target, the pack's one type, wins);
// the Chronic care section shows each condition's measures and checks, the banner what is off target and how many checks are due. /review
// dm drafts the yearly review (the feet and the eyes as the base's observations, the due tests as orders); /target sets an own target. The
// Chronic care tab lists who is off target or overdue.
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { PACK, TARGET_TYPE } from './model'
import { parseReview, parseTarget } from './line'
import { ReviewCard, ReviewNote, reviewCardLine } from './Review'
import { ChronicSection } from './Section'
import { ChronicList } from './List'
import { bannerWords, chipWord, summaryLine } from './words'

registerCommand({ name: 'review', pack: PACK, groupTitle: 'Chronic care', title: 'Yearly review', label: 'The yearly review of a condition: feet, eyes and the tests due',
  example: '/review dm', action: 'write:observation', writes: ['observation', 'order'], parse: (rest, ctx) => parseReview(rest, ctx), note: (items, ctx) => <ReviewNote items={items} ctx={ctx} /> })
registerCommand({ name: 'target', pack: PACK, groupTitle: 'Chronic care', title: 'Own target', label: 'A patient’s own target, with its reason',
  example: '/target htn bp < 150/90 ; 81, falls', action: 'write:chroniccare.target', writes: [TARGET_TYPE], parse: (rest, ctx) => parseTarget(rest, ctx) })
// the review's observations: their card where the department ticks chronic care (the feet's and the eyes' chips)
registerCard({ function: 'observation', Editor: ReviewCard, line: reviewCardLine, pack: PACK })
registerSection({ key: 'chroniccare.care', title: 'Chronic care', types: [TARGET_TYPE], fit: ANYONE, Body: ChronicSection,
  has: (x) => chipWord(x) !== null, word: (x) => chipWord(x), summary: (x) => summaryLine(x) })
registerBannerWords({ key: 'chroniccare.care', types: [TARGET_TYPE], words: (x) => bannerWords({ ...x, facts: undefined }) })
registerScreen('chroniccare.list', ChronicList)
export const key = PACK
