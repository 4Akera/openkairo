// How to take it, in Arabic, as the patient hears it at the window (spec/openCare.md §5.3): "قرص واحد مرتين يومياً بعد الأكل لمدة ٧
// أيام". Built from what the prescription says — the dose, how often, how many days, as needed, and its own words (with meals) when
// they are among the few known here; words not known here are left out (the English line stays beside it). And the amount to give
// (a dose per take × takes a day × days). Pure (npm run test:pharmacy).

const DIGITS = '٠١٢٣٤٥٦٧٨٩'
/** Arabic-Indic digits: 7 → ٧, 0.5 → ٠٫٥ */
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => DIGITS[Number(d)]).replace('.', '٫')

/** a counted form: one, two (dual), 3–10 (plural), 11 and more (accusative singular) */
type Counted = { one: string; two: string; few: string; many: string; half?: string }
const FORMS: Record<string, Counted> = {
  tab: { one: 'قرص واحد', two: 'قرصين', few: 'أقراص', many: 'قرصاً', half: 'نصف قرص' },
  cap: { one: 'كبسولة واحدة', two: 'كبسولتين', few: 'كبسولات', many: 'كبسولة' },
  drop: { one: 'نقطة واحدة', two: 'نقطتين', few: 'نقاط', many: 'نقطة' },
  puff: { one: 'بخة واحدة', two: 'بختين', few: 'بخات', many: 'بخة' },
  sachet: { one: 'كيس واحد', two: 'كيسين', few: 'أكياس', many: 'كيساً' },
}
const FORM_OF: Record<string, keyof typeof FORMS> = { tab: 'tab', tabs: 'tab', tablet: 'tab', tablets: 'tab', cap: 'cap', caps: 'cap', capsule: 'cap', capsules: 'cap',
  drop: 'drop', drops: 'drop', puff: 'puff', puffs: 'puff', sachet: 'sachet', sachets: 'sachet' }
/** a measured dose: the number and the unit */
const UNITS: Record<string, string> = { mg: 'مجم', g: 'جم', mcg: 'ميكروجرام', ug: 'ميكروجرام', µg: 'ميكروجرام', ml: 'مل', l: 'لتر', unit: 'وحدة', units: 'وحدة', iu: 'وحدة', '%': '%' }
const counted = (n: number, f: Counted) => n === 0.5 && f.half ? f.half : n === 1 ? f.one : n === 2 ? f.two : n >= 3 && n <= 10 && Number.isInteger(n) ? `${ar(n)} ${f.few}` : `${ar(n)} ${f.many}`

const HOW_OFTEN: Record<string, string> = { OD: 'مرة واحدة يومياً', QD: 'مرة واحدة يومياً', BD: 'مرتين يومياً', BID: 'مرتين يومياً', TDS: '٣ مرات يومياً', TID: '٣ مرات يومياً',
  QDS: '٤ مرات يومياً', QID: '٤ مرات يومياً', q4h: 'كل ٤ ساعات', q6h: 'كل ٦ ساعات', q8h: 'كل ٨ ساعات', q12h: 'كل ١٢ ساعة', once: 'مرة واحدة', stat: 'فوراً',
  HS: 'قبل النوم', nocte: 'قبل النوم', PRN: 'عند اللزوم' }
/** takes a day, for the amount to give (none for as needed, once, stat) */
export const PER_DAY: Record<string, number> = { OD: 1, QD: 1, BD: 2, BID: 2, TDS: 3, TID: 3, QDS: 4, QID: 4, q4h: 6, q6h: 4, q8h: 3, q12h: 2, HS: 1, nocte: 1, once: 1, stat: 1 }
const WORDS: [RegExp, string][] = [[/\b(with|during) (meals?|food)\b/i, 'مع الأكل'], [/\bafter (meals?|food|eating)\b/i, 'بعد الأكل'], [/\bbefore breakfast\b/i, 'قبل الفطار'],
  [/\bbefore (meals?|food|eating)\b/i, 'قبل الأكل'], [/\b(at )?bed ?time\b/i, 'قبل النوم'], [/\bempty stomach\b/i, 'على معدة فارغة'], [/\bwith (plenty of )?water\b/i, 'مع كوب ماء']]
const days = (n: number) => n === 1 ? 'لمدة يوم واحد' : n === 2 ? 'لمدة يومين' : n <= 10 ? `لمدة ${ar(n)} أيام` : `لمدة ${ar(n)} يوماً`

/** "500 mg" → 500 mg; "1 tab" → one tablet; a dose with no unit is a count of the medicine's own form */
export function parseDose(dose: string | null | undefined) {
  const m = (dose ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  return m ? { value: Number(m[1]), unit: m[2].trim().toLowerCase() } : null
}

export interface Prescribed { dose?: string | null; frequency?: string | null; days?: number | null; prn?: boolean; instructions?: string | null }
/** the directions in Arabic: dose, how often, the prescription's own words, how long */
export function arabicDirections(p: Prescribed): string {
  const d = parseDose(p.dose)
  const form = d ? FORM_OF[d.unit] : undefined
  const dose = !d ? null : form ? counted(d.value, FORMS[form]) : UNITS[d.unit] ? `${ar(d.value)} ${UNITS[d.unit]}` : d.unit ? null : counted(d.value, FORMS.tab)
  const often = p.frequency ? HOW_OFTEN[p.frequency] ?? null : null
  const asNeeded = p.prn && p.frequency !== 'PRN' ? 'عند اللزوم' : null
  const words = [...new Set(WORDS.filter(([re]) => re.test(p.instructions ?? '')).map(([, w]) => w))]
  return [dose, often, asNeeded, ...words, p.days ? days(p.days) : null].filter(Boolean).join(' ')
}

/** how many to give: a dose per take (one unit when the dose is a strength, 500 mg) × takes a day × days; null when not countable */
export function amountToGive(p: Prescribed): { value: number; unit: string } | null {
  const d = parseDose(p.dose); const perDay = p.frequency ? PER_DAY[p.frequency] : undefined
  if (!perDay || !p.days || p.prn) return null
  const form = d ? FORM_OF[d.unit] : undefined
  const each = form || (d && !d.unit) ? d!.value : 1
  const unit = form === 'cap' ? 'capsules' : form === 'sachet' ? 'sachets' : form === 'drop' || form === 'puff' ? (form === 'drop' ? 'drops' : 'puffs') : 'tablets'
  return { value: Math.ceil(each * perDay * p.days), unit }
}
