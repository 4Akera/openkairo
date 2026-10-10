// The clinics packs' printouts (spec/openCare.md §5.8; built 2026-10-10 on the core's print facility, §3.13), with no browser: each
// pack registers its own under its own key on a paper the core has; each draws what its screen hands it — the child's vaccination card
// in Arabic (the doses by the day given, * from the MOHP card, what is due now or next), the Chronic care list, the chest action plan's
// three zones, her INR table day by day, the operating list, the consent form (theatre's under /op, surgery's from the Surgery section,
// the order's words read by their shape), the patient's sheet before the operation; each "thing" short enough for the read log (at most
// 200 characters) and naming its patient where it is one patient's; a list prints with no single patient (each logged before it).
// Run by npm run test:print after test-print.ts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { printer, type PrintEnv } from '../src/core/print/session'
import { registerPrintout, type PrintoutProps } from '../src/core/print/registry'
import { PAPERS } from '../src/core/print/paper'
import type { Organization, ServerEntry } from '../src/core/db/types'
import { addDays, scheduleOf, type Dose, type Row } from '../src/packs/vaccines/schedule'
import { CARD_KEY, VaxCardSheet, arAge, arDate, arDay, arName, vaxCardOf } from '../src/packs/vaccines/printout'
import { LIST_KEY as CHRONIC_KEY, ChronicListSheet, listThing as chronicThing, type ListSheet } from '../src/packs/chroniccare/printout'
import { PLAN_KEY, PlanSheetView, type PlanSheet } from '../src/packs/lungs/printout'
import { InrTableSheet, TABLE_KEY, medicineAr, tableThing, type InrTable } from '../src/packs/haemato/printout'
import { CONSENT_KEY as THEATRE_CONSENT, ConsentSheet, LIST_KEY as OPLIST_KEY, OpListSheetView, listThing as opThing, type ConsentForm, type OpListSheet } from '../src/packs/theatre/printout'
import { CONSENT_KEY as SURGICAL_CONSENT, ConsentPaper, wordsOf, type Consent } from '../src/packs/surgical/printout'
import { PreopSheetView, SHEET_KEY, sentences, sheetThing, stopOf, type PreopSheet } from '../src/packs/anaesthesia/printout'
import { arabicSheet } from '../src/packs/anaesthesia/model'
import { setClinicTimeZone } from '../src/core/ui/time'

setClinicTimeZone('Africa/Cairo')

let n = 0
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const header = { name: 'Nile Clinic', logo: null, address: '12 Nile St, Cairo', phone: '0100', tax_number: null }
const draw = <D,>(C: ComponentType<PrintoutProps<D>>, data: D, reprint: string | null = null) => renderToStaticMarkup(createElement(C, { data, header, reprint }))

await test('each pack registers its printout in its index, under its own key, on a paper the core has', () => {
  const at: [string, string, string][] = [['vaccines', CARD_KEY, 'VaxCard'], ['chroniccare', CHRONIC_KEY, ''], ['lungs', PLAN_KEY, 'PlanSheet'], ['haemato', TABLE_KEY, 'InrTable'],
    ['theatre', OPLIST_KEY, 'OpListSheet'], ['theatre', THEATRE_CONSENT, 'ConsentForm'], ['surgical', SURGICAL_CONSENT, 'Consent'], ['anaesthesia', SHEET_KEY, 'PreopSheet']]
  for (const [pack, key] of at) {
    assert.ok(key.startsWith(`${pack}.`), `${key} in ${pack}'s prefix`)
    const src = readFileSync(`src/packs/${pack}/index.tsx`, 'utf8')
    const m = src.match(new RegExp(`registerPrintout<\\w+>\\((\\w+), \\{ paper: '(\\w+)'`, 'g')); assert.ok(m?.length, `${pack} registers a printout`)
    for (const r of m!) assert.ok(r.match(/paper: '(\w+)'/)![1] in PAPERS, `${pack}: a paper the core has`)
  }
  // the chronic care list is registered in its index too (the list screen prints it)
  assert.match(readFileSync('src/packs/chroniccare/index.tsx', 'utf8'), /registerPrintout<ListSheet>\(LIST_KEY, \{ paper: 'a5', Component: ChronicListSheet \}\)/)
  // and none of them twice: one component a key
  const keys = [CARD_KEY, CHRONIC_KEY, PLAN_KEY, TABLE_KEY, OPLIST_KEY, THEATRE_CONSENT, SURGICAL_CONSENT, SHEET_KEY]
  assert.equal(new Set(keys).size, keys.length)
})

// ── vaccines: the child's card ──
const NATIONAL: Omit<Row, 'national'>[] = [
  { key: 'hepb0', vaccine: 'hepb', name: 'Hepatitis B 0', dose: 0, age: 'Birth', earliest_days: 0 }, { key: 'opv0', vaccine: 'opv', name: 'OPV 0', dose: 0, age: 'Birth', earliest_days: 0 },
  { key: 'bcg', vaccine: 'bcg', name: 'BCG', dose: 1, age: 'Birth', earliest_days: 0 },
  { key: 'opv1', vaccine: 'opv', name: 'OPV 1', dose: 1, age: '2 mo', earliest_days: 42 }, { key: 'penta1', vaccine: 'penta', name: 'Penta 1', dose: 1, age: '2 mo', earliest_days: 42 },
  { key: 'opv2', vaccine: 'opv', name: 'OPV 2', dose: 2, age: '4 mo', earliest_days: 70, interval_days: 28 }, { key: 'ipv1', vaccine: 'ipv', name: 'IPV', dose: 1, age: '4 mo', earliest_days: 98 },
  { key: 'penta2', vaccine: 'penta', name: 'Penta 2', dose: 2, age: '4 mo', earliest_days: 70, interval_days: 28 },
  { key: 'opv3', vaccine: 'opv', name: 'OPV 3', dose: 3, age: '6 mo', earliest_days: 98, interval_days: 28 }, { key: 'penta3', vaccine: 'penta', name: 'Penta 3', dose: 3, age: '6 mo', earliest_days: 98, interval_days: 28 },
  { key: 'dtp4', vaccine: 'dtp', name: 'DTP booster', dose: 4, age: '18 mo', earliest_days: 545 }]
const OPTIONAL = [{ vaccine: 'pcv', name: 'Pneumococcal', dose: 1, age: '2 mo', earliest_days: 42 }, { vaccine: 'pcv', name: 'Pneumococcal', dose: 2, age: '4 mo', earliest_days: 70, interval_days: 28 }]
const org = { settings: [{ key: 'vaccines.national', thing_id: null, data: { version: 'Dec 2024', source: 'MOHP', rows: NATIONAL } },
  { key: 'vaccines.optional', thing_id: null, data: { rows: OPTIONAL } }], settingKeys: [], datatypes: {} } as unknown as Organization
const sched = scheduleOf(org)
const today = '2026-10-08'; const birth = '2026-06-08'   // Seif, 4 months
const dose = (vaccine: string, d: number, on: string, more: Partial<Dose> = {}): Dose => ({ item: `${vaccine}${d}`, vaccine, dose: d, status: 'completed', given_at: on, source: 'here', ...more })
const seif: Dose[] = [dose('hepb', 0, '2026-06-08', { source: 'card' }), dose('opv', 0, '2026-06-08', { source: 'card' }), dose('bcg', 1, '2026-06-08', { source: 'card' }),
  dose('opv', 1, '2026-08-09', { source: 'card' }), dose('penta', 1, '2026-08-09', { source: 'card' }), dose('pcv', 1, '2026-08-09'),
  dose('opv', 2, '2026-10-08'), dose('ipv', 1, '2026-10-08'), dose('penta', 2, '2026-10-08'), dose('opv', 3, '2026-10-08', { status: 'not-done', reason: 'too early' })]

await test('the card\'s Arabic: the schedule\'s ages, the vaccines\' names with their number (OPV 0 صفرية, a booster said), dates with Arabic-Indic digits', () => {
  assert.deepEqual(['Birth', '2 mo', '4 mo', '12 mo', '2 y', 'in pregnancy'].map(arAge), ['الولادة', 'شهران', '٤ شهور', '١٢ شهرًا', 'سنتان', 'أثناء الحمل'])
  assert.equal(arName({ vaccine: 'opv', name: 'OPV 0' }), 'شلل الأطفال صفرية'); assert.equal(arName({ vaccine: 'hepb', name: 'Hepatitis B 0' }), 'الكبدي ب')
  assert.equal(arName({ vaccine: 'penta', name: 'Penta 2' }), 'الخماسي ٢'); assert.equal(arName({ vaccine: 'ipv', name: 'IPV' }), 'السولك')
  assert.equal(arName({ vaccine: 'dtp', name: 'DTP booster' }), 'الثلاثي البكتيري (جرعة منشطة)'); assert.equal(arName({ vaccine: 'xyz', name: 'Typhoid 1' }), 'Typhoid ١', 'a vaccine with no Arabic name: as written')
  assert.equal(arDate('2026-06-08'), '٨ يونيو ٢٠٢٦'); assert.equal(arDay('2026-12-08'), 'الثلاثاء ٨ ديسمبر')
})
await test('the card: one row a day given, named by its national doses\' age, * where copied from the MOHP card; a dose not given is not on it; the next visit worked out', () => {
  const c = vaxCardOf(sched, seif, { name: 'سيف يحيى', birth, record: 20533 }, 'Vaccination room', today)
  assert.deepEqual(c.rows.map((r) => [r.age, r.vaccines, r.date, r.card]), [
    ['الولادة', 'الكبدي ب، شلل الأطفال صفرية، الدرن', '٨/٦', true],
    ['شهران', 'شلل الأطفال ١، الخماسي ١، المكورات الرئوية ١', '٩/٨', true],
    ['٤ شهور', 'شلل الأطفال ٢، السولك، الخماسي ٢', '٨/١٠', false]])
  assert.equal(c.now, null); assert.deepEqual(c.next, { age: '٦ شهور', on: arDay(addDays('2026-10-08', 28)), names: 'شلل الأطفال ٣، الخماسي ٣' })
  assert.equal(c.thing, '#20533 · 9 doses')
  const t = text(draw(VaxCardSheet, c))
  assert.match(t, /^Nile Clinic .* كارت التطعيمات Vaccination room الاسم: سيف يحيى · الميلاد ٨ يونيو ٢٠٢٦ · ملف 20533/)
  assert.match(t, /الولادة الكبدي ب، شلل الأطفال صفرية، الدرن ٨\/٦ \*/); assert.match(t, /٤ شهور شلل الأطفال ٢، السولك، الخماسي ٢ ٨\/١٠ /)
  assert.match(t, /الموعد القادم: ٦ شهور · .* شلل الأطفال ٣، الخماسي ٣ \* من كارت وزارة الصحة$/)
  assert.doesNotMatch(t, /Reprint/); assert.match(text(draw(VaxCardSheet, c, '10:42')), /Reprint · 10:42/)
  assert.match(draw(VaxCardSheet, c), /^<article dir="rtl" lang="ar"/)
  // overdue: what is due now instead of the next; a year before this one says its year
  const late = vaxCardOf(sched, seif.slice(0, 6), { name: 'Seif', birth, record: 20533 }, 'Room', '2027-01-20')
  assert.equal(late.now, 'شلل الأطفال ٢، السولك، الخماسي ٢، شلل الأطفال ٣، الخماسي ٣'); assert.equal(late.next, null)
  assert.equal(late.rows[0].date, '٨/٦/٢٦'); assert.match(text(draw(VaxCardSheet, late)), /مستحق الآن: شلل الأطفال ٢/)
  const none = vaxCardOf(sched, [], { name: 'X', birth: null, record: 1 }, 'Room', today)
  assert.deepEqual([none.rows, none.now, none.next], [[], null, null]); assert.match(text(draw(VaxCardSheet, none)), /لا توجد تطعيمات مسجلة بعد/)
})

// ── chronic care: the list ──
await test('the Chronic care list: the view and condition, a row a patient as the screen shows it; the same view on the same day is the same thing', () => {
  const s: ListSheet = { department: 'Diabetes clinic', view: 'Off target', condition: 'Diabetes', at: '2026-10-08T08:30:00Z', rows: [
    { number: 20114, name: 'Ashraf Mokhtar', age: '61 M', conditions: 'diabetes · hypertension · ckd', off: 'HbA1c 8.2 (< 7)', due: 'eyes · feet · urine acr', last: 'today' },
    { number: 20077, name: 'Fawzia Darwish', age: '81 F', conditions: 'hypertension', off: '', due: '', last: '2 Sep' }] }
  const t = text(draw(ChronicListSheet, s))
  assert.match(t, /Chronic care · Off target Diabetes clinic · Diabetes .* · 2 patients/)
  assert.match(t, /20114 Ashraf Mokhtar 61 M diabetes · hypertension · ckd HbA1c 8\.2 \(< 7\) eyes · feet · urine acr today/)
  assert.match(t, /20077 Fawzia Darwish 81 F hypertension — — 2 Sep/)
  assert.equal(chronicThing(s), 'Diabetes clinic · Off target · Diabetes · 2026-10-08'); assert.equal(chronicThing({ ...s, condition: null, at: '2026-10-08T18:00:00Z' }), 'Diabetes clinic · Off target · any · 2026-10-08')
  assert.match(text(draw(ChronicListSheet, { ...s, rows: [] })), /Nobody in this view/)
})

// ── lungs: the action plan ──
await test('the action plan: the three zones in Arabic, each framed (heavier the worse), the inhalers by name, the patient and the plan\'s date', () => {
  const s: PlanSheet = { name: 'Abdelhamid Mansy', record: 10422, at: '2026-09-02T09:00:00Z', thing: '#10422 · 2026-09-02', inhalers: ['Ultibro Breezhaler 1 capsule OD'],
    zones: [{ zone: 'every day', text: 'البخاخة الأساسية' }, { zone: 'worse', text: 'البخاخة السريعة بختين' }, { zone: 'emergency', text: 'روح الطوارئ' }] }
  const html = draw(PlanSheetView, s); const t = text(html)
  assert.match(t, /خطة التعامل مع الصدر ٢ سبتمبر ٢٠٢٦ الاسم: Abdelhamid Mansy · ملف 10422 كل يوم البخاخة الأساسية لو التعب زاد البخاخة السريعة بختين طوارئ روح الطوارئ بخاخاتك: Ultibro Breezhaler 1 capsule OD$/)
  assert.deepEqual([...html.matchAll(/border:([^;"]+)/g)].map((m) => m[1].trim()).filter((b) => /solid|dashed/.test(b)).slice(0, 3), ['0.3mm solid var(--fg)', '0.6mm dashed var(--fg)', '1mm solid var(--fg)'])
})

// ── haemato: her INR table ──
await test('her INR table: the week from Saturday in tablets in Arabic, the total, the medicine and the next INR in Arabic, today\'s INR against her target', () => {
  const days = [5, 5, 5, 5, 5, 2.5, 5]
  const s: InrTable = { name: 'Ensaf Rizk', record: 10297, medicine: 'warfarin', tablet_mg: 5, days, next_inr: '2026-10-15', inr: 1.7, target: { low: 2, high: 3 }, thing: tableThing(10297, days, '2026-10-15') }
  const t = text(draw(InrTableSheet, s))
  assert.match(t, /جدول جرعات السيولة الاسم: Ensaf Rizk · ملف 10297 نسبة السيولة اليوم 1\.7 المطلوب 2\.0–3\.0/)
  assert.match(t, /السبت الأحد الاثنين الثلاثاء الأربعاء الخميس الجمعة قرص قرص قرص قرص قرص نصف قرص قرص مجموع الأسبوع 32\.5 مجم/)
  assert.match(t, /وارفارين \(ماريفان\) ٥ مجم · مرة واحدة يومياً الساعة ٦ مساءً · تحليل السيولة القادم: الخميس ١٥ أكتوبر/)
  assert.equal(s.thing, '#10297 · 32.5 mg a week · 5,5,5,5,5,2.5,5 · next 2026-10-15'); assert.equal(medicineAr('acenocoumarol'), 'acenocoumarol')
  assert.doesNotMatch(text(draw(InrTableSheet, { ...s, inr: null, target: null, next_inr: null })), /نسبة السيولة|المطلوب|القادم/)
})

// ── theatre: the operating list and the consent form ──
await test('the operating list: the day, each room\'s cases in order with the side, surgeon and anaesthetist, ASA and where each stands; emergencies first', () => {
  const s: OpListSheet = { theatre: 'Theatre', day: 'Thu 8 Oct', at: '2026-10-08T08:30:00Z', rooms: [
    { name: 'Emergency · not yet in a room', sub: '', cases: [{ time: '—', patient: 'Ziad Hafez', age_sex: '34 y M', operation: 'EMERGENCY · Laparoscopic appendicectomy', side: null, surgeon: '—', anaesthetist: '', asa: '—', stands: 'waiting' }] },
    { name: 'Theatre 1', sub: 'General surgery · 08:30–14:30', cases: [{ time: '08:30', patient: 'Ghada Sharaf', age_sex: '45 y F', operation: 'Inguinal hernia repair', side: 'right', surgeon: 'Dr. Hesham Abdelaal', anaesthetist: 'Dr. Sherine Rashad', asa: 'II', stands: 'operating' }] },
    { name: 'Theatre 2', sub: 'no session', cases: [] }] }
  const t = text(draw(OpListSheetView, s))
  assert.match(t, /Operating list · Thu 8 Oct Theatre · printed/)
  assert.match(t, /Emergency · not yet in a room Time .* — Ziad Hafez 34 y M EMERGENCY · Laparoscopic appendicectomy — — waiting Theatre 1 · General surgery · 08:30–14:30/)
  assert.match(t, /08:30 Ghada Sharaf 45 y F Inguinal hernia repair · right Dr\. Hesham Abdelaal Dr\. Sherine Rashad II operating Theatre 2 · no session No cases$/)
  assert.equal(opThing(s), 'Theatre · Thu 8 Oct · Emergency · not yet in a room+Theatre 1+Theatre 2')
})
const form: ConsentForm = { name: 'Reda Abdelhady', record: 20871, age_sex: '58 y M', operation: 'Inguinal hernia repair, open mesh (Lichtenstein)', side: 'right', surgeon: 'Dr. Hesham Abdelaal',
  technique: 'anaesthetist', risks: ['bleeding, bruising', 'wound infection · about 1 in 50'], at: '2026-10-08T08:30:00Z', thing: '#20871 · ihr_mesh right' }
await test('the consent form (theatre\'s, under /op): in Arabic, the operation, the side written out big, the surgeon, the anaesthetic wanted, the risks told, the declaration, four lines to sign', () => {
  const html = draw(ConsentSheet, form); const t = text(html)
  assert.match(html, /^<article dir="rtl" lang="ar"/)
  assert.match(t, /إقرار بالموافقة على عملية جراحية Consent to an operation الاسم: Reda Abdelhady · 58 y M · ملف 20871/)
  assert.match(t, /العملية: Inguinal hernia repair, open mesh \(Lichtenstein\) الجهة: الجانب الأيمن \(RIGHT\) الجرّاح: Dr\. Hesham Abdelaal التخدير المطلوب: يحدده طبيب التخدير/)
  assert.match(t, /المخاطر التي شُرحت لي: bleeding, bruising wound infection · about 1 in 50 أقر أنا الموقّع أدناه/)
  assert.match(t, /توقيع المريض \(أو ولي الأمر وصلته\) توقيع الطبيب الشاهد التاريخ والوقت Printed/)
  assert.doesNotMatch(text(draw(ConsentSheet, { ...form, side: null, risks: [], surgeon: null, technique: null })), /الجهة|المخاطر التي|الجرّاح|التخدير المطلوب/)
})
await test('the consent form (surgery\'s, from the Surgery section): the same words; the order\'s side and risks read by their shape, never by the pack that wrote them', () => {
  const c: Consent = { ...form }
  assert.equal(text(draw(ConsentPaper, c)), text(draw(ConsentSheet, form)), 'the same paper either way')
  const e = (over: Partial<ServerEntry>): ServerEntry => ({ id: 'e1', item: 'op1', type: 'theatre.op', hidden: false, recorded_at: '2026-10-07T10:00:00Z', occurred_at: '2026-10-07T10:00:00Z',
    data: { status: 'active', service: { code: 'ihr_mesh' }, theatre: { side: 'left', surgeon: 'Dr. Mona', technique: 'spinal', risks: ['bleeding', 'numbness'] } }, ...over } as unknown as ServerEntry)
  assert.deepEqual(wordsOf([e({}), e({ id: 'e0', recorded_at: '2026-10-06T10:00:00Z', data: { theatre: { side: 'right' } } }), e({ id: 'x', item: 'other' })], 'op1'),
    { side: 'left', surgeon: 'Dr. Mona', technique: 'spinal', risks: ['bleeding', 'numbness'] }, 'the latest version of the order itself')
  assert.deepEqual(wordsOf([e({ data: { anything: { side: 'none', risks: [] } } })], 'op1'), { side: null, surgeon: null, technique: null, risks: [] }, 'no side: none said')
  assert.deepEqual(wordsOf([], 'op1'), { side: null, surgeon: null, technique: null, risks: [] })
})

// ── anaesthesia: the patient's sheet ──
await test('the patient\'s sheet before the operation: from the lines as the anaesthetist left them, one instruction a line, fasting, the anaesthetic planned', () => {
  const stop = [{ medicine: 'Metformin 1000 mg twice', what: 'no dose on the morning of the operation', rule: 'metformin' }, { medicine: 'Empagliflozin 10 mg', what: 'stop 3 days before', days: 3 },
    { medicine: 'Aspirin 75 mg', what: 'continue, also on the day' }]
  const words = arabicSheet(stopOf(stop))
  assert.equal(words, 'لا تأخذ Metformin صباح يوم العملية. أوقف Empagliflozin قبل العملية بـ 3 أيام. استمر على Aspirin. لا أكل قبل العملية بست ساعات، والماء مسموح حتى ساعتين قبلها.')
  assert.deepEqual(sentences(words).length, 4)
  const s: PreopSheet = { name: 'Reda Abdelhady', record: 20871, operation: 'Inguinal hernia repair', lines: sentences(words), plan: 'spinal', anaesthetist: 'Dr. Sherine Rashad', at: '2026-10-15T08:00:00Z', thing: sheetThing(20871, words) }
  const t = text(draw(PreopSheetView, s))
  assert.match(t, /تعليمات قبل العملية ١٥ أكتوبر ٢٠٢٦ الاسم: Reda Abdelhady · ملف 20871 العملية: Inguinal hernia repair التخدير: تخدير نصفي \(في الظهر\)/)
  assert.match(t, /لا تأخذ Metformin صباح يوم العملية\. أوقف Empagliflozin .* حتى ساعتين قبلها\. طبيب التخدير: Dr\. Sherine Rashad$/)
  assert.match(s.thing, /^#20871 · [0-9a-f]{8}$/); assert.notEqual(sheetThing(20871, words), sheetThing(20871, `${words} `), 'other words, another sheet')
  // the line the anaesthetist changed is the line printed
  assert.match(arabicSheet(stopOf([{ ...stop[2], what: 'stop 7 days before', days: 7 }])), /أوقف Aspirin قبل العملية بـ 7 أيام/)
})

// ── through the core's print run ──
await test('through the core\'s print run: one patient\'s printout logged first with its thing; a list (no single patient) is not logged by the run; the same thing again is a reprint', async () => {
  for (const [key, C] of [[CARD_KEY, VaxCardSheet], [CHRONIC_KEY, ChronicListSheet]] as const) registerPrintout(key, { paper: 'a5', Component: C as ComponentType<PrintoutProps> })
  const logged: string[] = []; const seen = new Set<string>()
  const env: PrintEnv = { log: async (j) => { logged.push(`${j.key} ${j.patientId} ${j.thing}`); return '2026-10-08T08:40:00Z' }, draw: async () => 400, style: () => {}, dialog: async () => {},
    unstyle: () => {}, clear: () => {}, now: () => new Date('2026-10-08T08:40:00Z'), time: (at) => at.toISOString().slice(11, 16),
    memory: { seen: (t) => seen.has(t), keep: (t) => { seen.add(t) } } }
  const print = printer(env)
  const card = vaxCardOf(sched, seif, { name: 'Seif', birth, record: 20533 }, 'Room', today)
  assert.deepEqual(await print({ key: CARD_KEY, data: card, header, thing: card.thing, patientId: 'p-seif' }), { printed: true, reprint: null })
  assert.deepEqual(await print({ key: CARD_KEY, data: card, header, thing: card.thing, patientId: 'p-seif' }), { printed: true, reprint: '08:40' })
  assert.deepEqual(logged, ['vaccines.card p-seif #20533 · 9 doses', 'vaccines.card p-seif #20533 · 9 doses'])
  const list: ListSheet = { department: 'Diabetes clinic', view: 'All', condition: null, at: '2026-10-08T08:40:00Z', rows: [] }
  assert.deepEqual(await print({ key: CHRONIC_KEY, data: list, header, thing: chronicThing(list) }), { printed: true, reprint: null }); assert.equal(logged.length, 2, 'a list: its patients are logged before it, by the screen')
  for (const t of [card.thing, chronicThing(list), form.thing, tableThing(10297, [5, 5, 5, 5, 5, 2.5, 5], '2026-10-15'), sheetThing(1, 'x'.repeat(5000))]) assert.ok(t.length <= 200, `${t}: the read log keeps 200 characters`)
})

console.log(`print (clinics): ${n} groups passed`)
