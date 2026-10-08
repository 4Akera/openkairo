// How to take a medicine, in Arabic, as the base can say it (spec §4.6 the chart, §3.13 Printing; the owner's prescription on A5,
// 2026-10-08): "قرص واحد بالفم مرتين يومياً بعد الأكل لمدة ٧ أيام". From what the prescription says — the dose, the route, how often,
// as needed, its own words where a whole phrase of them is among the few known here, and for how long — with Arabic-Indic digits; what
// the base cannot say in Arabic is left out, never guessed (the English line stays above it): a dose with no unit names no form, and
// the doctor's own words are said only phrase by phrase where a phrase is wholly a known one, so "do not take with food" is never
// turned into "with food". The base's own words, beside a pack's (chosen in the build, awaiting the owner: one list later). Pure
// (npm run test:chart).
import type { MedLine } from './record'

const DIGITS = '٠١٢٣٤٥٦٧٨٩'
/** Arabic-Indic digits: 7 → ٧, 0.5 → ٠٫٥ */
export const arabicDigits = (n: number | string) => String(n).replace(/\d/g, (d) => DIGITS[Number(d)]).replace('.', '٫')

/** a counted form: one, two (dual), 3–10 (plural), 11 and more (singular); a half where it is said */
type Counted = { one: string; two: string; few: string; many: string; half?: string }
const FORMS: Record<string, Counted> = {
  tablet: { one: 'قرص واحد', two: 'قرصين', few: 'أقراص', many: 'قرصاً', half: 'نصف قرص' },
  capsule: { one: 'كبسولة واحدة', two: 'كبسولتين', few: 'كبسولات', many: 'كبسولة' },
  drop: { one: 'نقطة واحدة', two: 'نقطتين', few: 'نقاط', many: 'نقطة' },
  puff: { one: 'بخة واحدة', two: 'بختين', few: 'بخات', many: 'بخة' },
  sachet: { one: 'كيس واحد', two: 'كيسين', few: 'أكياس', many: 'كيساً' },
  spoon: { one: 'ملعقة واحدة', two: 'ملعقتين', few: 'ملاعق', many: 'ملعقة', half: 'نصف ملعقة' },
  ampoule: { one: 'أمبول واحد', two: 'أمبولين', few: 'أمبولات', many: 'أمبولاً' },
  suppository: { one: 'لبوس واحد', two: 'لبوسين', few: 'لبوسات', many: 'لبوساً' },
}
const FORM_OF: Record<string, string> = { tab: 'tablet', tabs: 'tablet', tablet: 'tablet', tablets: 'tablet', cap: 'capsule', caps: 'capsule', capsule: 'capsule', capsules: 'capsule',
  drop: 'drop', drops: 'drop', puff: 'puff', puffs: 'puff', sachet: 'sachet', sachets: 'sachet', spoon: 'spoon', spoons: 'spoon', tsp: 'spoon',
  amp: 'ampoule', ampoule: 'ampoule', ampoules: 'ampoule', supp: 'suppository', suppository: 'suppository', suppositories: 'suppository' }
const UNITS: Record<string, string> = { mg: 'مجم', g: 'جم', mcg: 'ميكروجرام', ug: 'ميكروجرام', µg: 'ميكروجرام', ml: 'مل', l: 'لتر', unit: 'وحدة', units: 'وحدة', iu: 'وحدة', '%': '%' }
const counted = (n: number, f: Counted) => n === 0.5 && f.half ? f.half : n === 1 ? f.one : n === 2 ? f.two
  : n >= 3 && n <= 10 && Number.isInteger(n) ? `${arabicDigits(n)} ${f.few}` : `${arabicDigits(n)} ${f.many}`
/** the route as the patient is told it */
export const ROUTE_AR: Record<string, string> = { oral: 'بالفم', sc: 'حقن تحت الجلد', im: 'حقن في العضل', iv: 'حقن في الوريد', topical: 'دهان موضعي على الجلد',
  inhaled: 'استنشاق', pr: 'عن طريق الشرج', pv: 'مهبلي', sl: 'تحت اللسان', nasal: 'في الأنف' }
/** how often, by the prescription's code (labels.ts FREQUENCY) */
export const OFTEN_AR: Record<string, string> = { OD: 'مرة واحدة يومياً', BD: 'مرتين يومياً', TDS: '٣ مرات يومياً', QDS: '٤ مرات يومياً', q4h: 'كل ٤ ساعات',
  q6h: 'كل ٦ ساعات', q8h: 'كل ٨ ساعات', q12h: 'كل ١٢ ساعة', weekly: 'مرة واحدة أسبوعياً', monthly: 'مرة واحدة شهرياً', PRN: 'عند اللزوم', once: 'مرة واحدة',
  stat: 'فوراً مرة واحدة', HS: 'قبل النوم', nocte: 'قبل النوم' }
// the prescription's own words the base can say: each a whole phrase (a part of the words between commas, semicolons or full stops,
// "take" before it or not), never a phrase found inside other words, which may say not to (the rest stay in English, as written). The
// composer's own notes are among them: nocte and hs write "at night", mane "in the morning" (visit/parse.ts)
const WORDS: [RegExp, string][] = [[/^(with|during) (meals?|food)$/, 'مع الأكل'], [/^after (meals?|food|eating)$/, 'بعد الأكل'], [/^before breakfast$/, 'قبل الفطار'],
  [/^before (meals?|food|eating)$/, 'قبل الأكل'], [/^(at )?bed ?time$/, 'قبل النوم'], [/^at night$/, 'ليلاً'], [/^in the morning$/, 'صباحاً'],
  [/^(on an? )?empty stomach$/, 'على معدة فارغة'], [/^with (a glass of |plenty of )?water$/, 'مع كوب ماء']]
/** the doctor's words the base can say in Arabic, phrase by phrase in their order; a phrase not wholly a known one says nothing */
const phrases = (text: string | null | undefined) => (text ?? '').toLowerCase().split(/[;,.\n]/).map((p) => p.trim().replace(/\s+/g, ' ').replace(/^take /, ''))
  .flatMap((p) => WORDS.filter(([re]) => re.test(p)).map(([, w]) => w))
const days = (n: number) => n === 1 ? 'لمدة يوم واحد' : n === 2 ? 'لمدة يومين' : n <= 10 ? `لمدة ${arabicDigits(n)} أيام` : `لمدة ${arabicDigits(n)} يوماً`

/** the dose in Arabic: a count of its form (one tablet, two puffs), a measure (٥٠٠ مجم), or nothing the base can say — a number with no
 *  unit names no form (it may be a syrup's), so it is left out */
export function arabicDose(dose: string | null | undefined): string | null {
  const m = (dose ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (!m) return null
  const value = Number(m[1]); const unit = m[2].trim().toLowerCase(); const form = FORM_OF[unit]
  return form ? counted(value, FORMS[form]) : UNITS[unit] ? `${arabicDigits(value)} ${UNITS[unit]}` : null
}
/** the directions in Arabic: dose, route, how often, as needed, the prescription's own known words, how long */
export function arabicSig(l: Pick<MedLine, 'dose' | 'route' | 'frequency' | 'prn' | 'days' | 'instructions'>): string {
  const often = l.frequency ? OFTEN_AR[l.frequency] ?? null : null
  const asNeeded = l.prn && l.frequency !== 'PRN' ? 'عند اللزوم' : null
  const words = [...new Set(phrases(l.instructions))]
  return [arabicDose(l.dose), l.route ? ROUTE_AR[l.route] ?? null : null, often, asNeeded, ...words, l.days ? days(l.days) : null].filter(Boolean).join(' ')
}
