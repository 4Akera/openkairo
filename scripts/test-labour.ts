// ObGyn's labour ward (spec/openCare.md §5.6), the client's pure decisions: /ve's grammar and its line (the server's words, word for
// word), /ctx and /fhr (the baby's heart as the base's observation, LOINC 55283-6, with a notice under 110 or over 160), the WHO's
// modified partograph (active labour from the department's setting, the alert line at 1 cm an hour, the action line 4 hours to its
// right, past a line strictly), the weeks and days, the tile's words from the board's read (through the core's tile line), the
// banner's words (never G and P), and where the commands are offered. Pure: no browser, no database.   npm run test:labour
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm } from '../src/core/ui/time'
import '../src/packs/obgyn/labour/commands'
import { EXAM, FHR_CODE, isFhr, type ExamData } from '../src/packs/obgyn/labour/codes'
import { examLine, examProblem, fhrNote, parseCtx, parseExam, parseFhr } from '../src/packs/obgyn/labour/exam'
import { activeFrom, gestation, gestationWords, lineAt, partographOf, type Point } from '../src/packs/obgyn/labour/partograph'
import { gpOf, inLabour, labourWords, stayOf, tileWords, type LabourBoard, type LabourStay } from '../src/packs/obgyn/labour/board'
import { parse, type Ctx, type Parsed, type Result } from '../src/core/screens/visit/parse'
import { cardFor, commandNamed, commandsFor, notHere } from '../src/core/screens/visit/commands'
import { registerTileLine, tileLineDefs, tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { ownOf } from '../src/core/screens/chart/sections'
import type { WordsInput } from '../src/core/screens/chart/words'
import { E, ctx as chartCtx, org as baseOrg, presence, record, table } from './chart-fixtures'
import type { Organization, PresenceRow, ServerEntry } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const ok = (r: Result): Parsed[] => { assert.ok(r && 'ok' in r, JSON.stringify(r)); return r.ok }
const err = (r: Result): string => { assert.ok(r && 'error' in r, `should be refused, got ${JSON.stringify(r)}`); return r.error }
const exam = (rest: string) => ok(parseExam(rest))[0].params as ExamData
const NOW = Date.parse('2026-10-09T10:00:00Z')
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const DAY = 86_400_000
const lmp = (days: number) => new Date(Date.UTC(2026, 9, 9) - days * DAY).toISOString().slice(0, 10)
const pts = (...ps: [number, number][]): Point[] => ps.map(([cervix, m]) => ({ at: ago(m), cervix }))
const org = (af: 4 | 5 = 4) => ({ ...baseOrg, settings: [{ key: 'obgyn.partograph', thing_id: 'lw', owner_id: 'lw', data: { active_from: af }, recorded_at: ago(9999) }],
  settingKeys: [], datatypes: {} }) as unknown as Organization
const here: Ctx = { departmentId: 'lw', services: [], templates: [], departments: [], problems: [], packs: ['obgyn'] }

test('/ve: every finding in any order; the cervix in halves, full; errors in words', () => {
  const p = ok(parseExam('6 3/5 oa clear m+ caput ctx 3/10 40s g2 p1'))[0]
  assert.equal(p.function, EXAM)
  assert.deepEqual(p.params, { cervix: 6, descent: 3, position: 'oa', liquor: 'clear', moulding: '+', caput: '+', contractions: { per_10: 3, seconds: 40 }, gravida: 2, para: 1 })
  assert.equal(p.line, 'Cervix 6 cm · head 3/5 · OA · liquor clear · moulding + · caput + · contractions 3 in 10 min, 40 s · G2 P1')
  assert.equal(exam('full').cervix, 10); assert.equal(exam('fd').cervix, 10); assert.equal(exam('4.5').cervix, 4.5)
  assert.deepEqual(exam('6cm 4/5'), { cervix: 6, descent: 4 }); assert.deepEqual(exam('6 cm'), { cervix: 6 })
  assert.deepEqual(exam('mec m2 caput0 lot'), { liquor: 'meconium', moulding: '++', caput: 'none', position: 'lot' })
  assert.deepEqual(exam('g2p1'), { gravida: 2, para: 1 }); assert.deepEqual(exam('3/10 45s'), { contractions: { per_10: 3, seconds: 45 } })
  assert.deepEqual(exam('ctx 3 in 10 40 s'), { contractions: { per_10: 3, seconds: 40 } })
  assert.deepEqual(exam('ctx 3 10'), { contractions: { per_10: 3 } }, '"3 10" is 3 in 10, never a cervix of 10')
  assert.deepEqual(exam('oa ctx 3 10 clear'), { position: 'oa', contractions: { per_10: 3 }, liquor: 'clear' }); assert.deepEqual(exam('ctx 4 10 45s'), { contractions: { per_10: 4, seconds: 45 } })
  assert.equal(err(parseExam('ctx 0/10 40s')), 'No contractions in 10 min: no length to say'); assert.equal(err(parseExam('g0')), 'G0 is not possible: 1–20')
  assert.equal(err(parseExam('11')), 'Cervix 11 cm is not possible: 0–10, in half centimetres'); assert.match(err(parseExam('4.3')), /^Cervix 4.3 cm is not possible/)
  assert.equal(err(parseExam('6 7')), 'Cervix said twice'); assert.equal(err(parseExam('6/5')), 'The head is in fifths: 0/5 to 5/5')
  assert.equal(err(parseExam('3/5 4/5')), 'The head said twice'); assert.equal(err(parseExam('oa op')), 'Position said twice'); assert.equal(err(parseExam('clear mec')), 'Liquor said twice')
  assert.equal(err(parseExam('m+ m0')), 'Moulding said twice')
  assert.equal(err(parseExam('g1 p1')), 'P1 with G1: para counts the births before this pregnancy, so it is under G')
  assert.equal(err(parseExam('ctx 9/10')), 'Contractions 9 in 10 min is not possible'); assert.equal(err(parseExam('ctx 3/10 400s')), 'A contraction of 400 s is not possible')
  assert.match(err(parseExam('constructor')), /^Not a labour finding: “constructor”/); assert.match(err(parseExam('oa toString')), /^Not a labour finding/)
  assert.equal(parseExam(''), null); assert.equal(parseExam('  '), null)
})
test('/ctx and /fhr: the contractions alone; the baby\'s heart as the base\'s observation, a notice when it is off', () => {
  for (const s of ['3/10 40s', '3 in 10 40s', '3 40s', '3 40']) assert.deepEqual(ok(parseCtx(s))[0].params, { contractions: { per_10: 3, seconds: 40 } }, s)
  assert.equal(ok(parseCtx('3 in 10 45s'))[0].line, 'Contractions 3 in 10 min, 45 s'); assert.deepEqual(ok(parseCtx('3/10'))[0].params, { contractions: { per_10: 3 } })
  assert.equal(err(parseCtx('often')), 'Contractions: /ctx 3/10 40s'); assert.equal(err(parseCtx('8/10')), 'Contractions 8 in 10 min is not possible')
  assert.equal(err(parseCtx('3 40 50')), 'Contractions: /ctx 3/10 40s'); assert.equal(err(parseCtx('3 4s')), 'A contraction of 4 s is not possible')
  assert.deepEqual(ok(parseCtx('4 10 45s'))[0].params, { contractions: { per_10: 4, seconds: 45 } }); assert.deepEqual(ok(parseCtx('4 10 45'))[0].params, { contractions: { per_10: 4, seconds: 45 } })
  assert.deepEqual(ok(parseCtx('4 10'))[0].params, { contractions: { per_10: 4 } }, 'not a length of 10 s')
  assert.equal(err(parseCtx('0 40')), 'No contractions in 10 min: no length to say'); assert.deepEqual(ok(parseCtx('0'))[0].params, { contractions: { per_10: 0 } })
  const f = ok(parseFhr('142'))[0]
  assert.equal(f.function, 'observation'); assert.equal(f.line, 'Fetal heart rate: 142 bpm')
  assert.deepEqual(f.params, { code: { text: 'Fetal heart rate', codings: [{ system: 'loinc', code: '55283-6', display: 'Fetal heart rate' }] }, value: { quantity: { value: '142', unit: 'bpm', ucum: '/min' } } })
  assert.equal(err(parseFhr('300')), 'FHR 300 is not plausible: 50–220'); assert.equal(err(parseFhr('fast')), 'The baby\'s heart rate: /fhr 142')
  assert.equal(ok(parse('/fhr 142', here))[0].action, 'write:observation'); assert.equal(ok(parse('/ve 6', here))[0].action, 'write:obgyn.labour_exam')
  const fhr = (v: string) => ok(parseFhr(v))
  assert.deepEqual(fhrNote(fhr('100')), { text: 'FHR 100: under 110 — tell the doctor now. Only a notice.', tone: 'danger' })
  assert.deepEqual(fhrNote(fhr('172')), { text: 'FHR 172: over 160 — tell the doctor now. Only a notice.', tone: 'danger' })
  assert.equal(fhrNote(fhr('140')), null); assert.equal(fhrNote(fhr('110')), null); assert.equal(fhrNote(fhr('160')), null); assert.equal(fhrNote([]), null)
  // the clinics' observation card (their MethodCard, Cards.tsx) draws only for their contraception code, so in the app the FHR draft keeps
  // its own line. Cards.tsx reads through the core's door (@core/db/rpc), so a node test cannot import it: its condition is checked on
  // the draft, and that the labour ward registers no observation card of its own (the clinics' card is not loaded here)
  assert.ok(!(f.params.code as { codings: { code: string }[] }).codings.some((c) => c.code === 'contraception'), 'not the clinics\' contraception code')
  assert.equal(cardFor('observation', { packs: ['obgyn'] }), undefined, 'the labour ward registers no observation card (the clinics\' MethodCard is not loaded here)')
  assert.equal(cardFor(EXAM, { packs: ['obgyn'] })?.line?.({ cervix: 7 }), 'Cervix 7 cm'); assert.equal(cardFor(EXAM, { packs: [] }), undefined)
  assert.ok(isFhr({ type: 'observation', data: f.params })); assert.ok(!isFhr({ type: 'vitals', data: f.params })); assert.equal(FHR_CODE.code, '55283-6')
})
test('the exam\'s line is the server\'s words (obgyn.exam_words)', () => {
  assert.equal(examLine({ cervix: 4, descent: 5, position: 'oa', liquor: 'intact', moulding: '0', caput: 'none', contractions: { per_10: 3, seconds: 30 }, gravida: 2, para: 1 }),
    'Cervix 4 cm · head 5/5 · OA · membranes intact · moulding 0 · no caput · contractions 3 in 10 min, 30 s · G2 P1')
  assert.equal(examLine({ contractions: { per_10: 3 } }), 'Contractions 3 in 10 min')
  assert.equal(examLine({}), 'Labour examination')
  assert.equal(examLine({ cervix: 10, position: 'op', liquor: 'meconium', caput: '++' }), 'Cervix 10 cm · OP · liquor meconium-stained · caput ++')
  assert.equal(examLine({ position: 'breech', liquor: 'blood' }), 'Breech · liquor blood-stained'); assert.equal(examLine({ para: 1 }), 'P1'); assert.equal(examLine({ gravida: 3 }), 'G3')
  assert.equal(examLine({ cervix: 4.5, note: 'urge to push' }), 'Cervix 4.5 cm · urge to push')
  // what the card says under its fields, in /ve's words
  assert.equal(examProblem({ gravida: 1, para: 1 }), 'P1 with G1: para counts the births before this pregnancy, so it is under G')
  assert.equal(examProblem({ cervix: 4.3 }), 'Cervix 4.3 cm is not possible: 0–10, in half centimetres'); assert.equal(examProblem({ cervix: 11 }), 'Cervix 11 cm is not possible: 0–10, in half centimetres')
  assert.equal(examProblem({ contractions: { per_10: 0, seconds: 40 } }), 'No contractions in 10 min: no length to say'); assert.equal(examProblem({ gravida: 0 }), 'G0 is not possible: 1–20')
  assert.equal(examProblem({ cervix: 6, contractions: { per_10: 3, seconds: 40 }, gravida: 2, para: 1 }), null); assert.equal(examProblem({}), null)
})
test('the partograph: active labour from the setting, past the alert line, past the action line, strictly', () => {
  const s = partographOf(pts([6, 5], [4, 240], [5, 120]), 4, NOW)
  assert.deepEqual(s.start, { at: ago(240), cervix: 4 }); assert.equal(s.past, 'alert'); assert.equal(s.hours, 4); assert.equal(s.actionAt, ago(-120))
  assert.deepEqual(s.points.map((p) => p.cervix), [4, 5, 6], 'by time'); assert.equal(s.latest?.cervix, 6)
  const five = partographOf(pts([4, 240], [5, 120], [6, 5]), 5, NOW)
  assert.deepEqual(five.start, { at: ago(120), cervix: 5 }); assert.equal(five.past, 'alert')
  const d = partographOf(pts([3, 120], [4, 60]), 4, NOW); assert.equal(d.start?.at, ago(60)); assert.equal(d.past, null); assert.equal(d.hours, 1)
  const latent = partographOf(pts([3, 120]), 4, NOW); assert.equal(latent.start, null); assert.equal(latent.hours, null); assert.equal(latent.past, null); assert.equal(latent.latest?.cervix, 3)
  assert.equal(partographOf(pts([4, 360], [5, 0]), 4, NOW).past, 'action')
  assert.equal(partographOf(pts([4, 120], [6, 0]), 4, NOW).past, null, 'on the alert line: not past it')
  assert.equal(partographOf(pts([4, 600], [10, 0]), 4, NOW).past, null, 'fully dilated: past nothing')
  assert.deepEqual(partographOf([], 4, NOW), { start: null, points: [], latest: null, hours: null, past: null, actionAt: null })
  assert.equal(lineAt({ cervix: 4 }, 2), 6); assert.equal(lineAt({ cervix: 4 }, 9), 10); assert.equal(lineAt({ cervix: 4 }, 3 - 4), null, 'the action line starts at 4 h')
  assert.equal(activeFrom(org(5), 'lw'), 5); assert.equal(activeFrom(org(5), 'other'), 4); assert.equal(activeFrom(undefined, 'lw'), 4)
})
test('the weeks and days: from the LMP, or from the weeks said then', () => {
  const g = (p: Parameters<typeof gestation>[0]) => { const x = gestation(p, '2026-10-09'); return x && gestationWords(x) }
  assert.equal(g({ lmp: lmp(275), at: ago(60) }), '39+2 w')
  assert.equal(g({ weeks: 38, at: ago(3 * 24 * 60) }), '38+3 w')
  assert.equal(g({ at: ago(60) }), null); assert.equal(g(undefined), null); assert.equal(g({ lmp: '2026-10-20', at: ago(0) }), null, 'an LMP to come')
  assert.equal(g({ lmp: '2026-01', at: ago(60) }), null, 'an LMP of a month only: no day to count from')
  assert.equal(g({ lmp: '2026', weeks: 38, at: ago(3 * 24 * 60) }), '38+3 w', 'then the weeks said')
})

// the board's read for three women, as obgyn.board answers it
const SALMA: LabourStay = { exams: [{ at: ago(240), cervix: 4, descent: 5, gravida: 2, para: 1 }, { at: ago(120), cervix: 5, descent: 4 }, { at: ago(5), cervix: 6, descent: 3 }],
  fhr: { value: 142, at: ago(5) }, pregnancy: { lmp: lmp(275), at: ago(290) } }
const NESMA: LabourStay = { exams: [{ at: ago(180), cervix: 5, gravida: 3, para: 2 }, { at: ago(90), cervix: 7 }, { at: ago(20), cervix: 8 }], fhr: { value: 100, at: ago(5) }, pregnancy: { lmp: lmp(267), at: ago(200) } }
const DOAA: LabourStay = { exams: [{ at: ago(120), cervix: 3, gravida: 1, para: 0 }], pregnancy: { lmp: lmp(285), at: ago(150) } }
const BOARD: LabourBoard = { patient_ids: ['p1', 'p2', 'p3'], stays: { s1: SALMA, s2: NESMA, s3: DOAA, s4: { exams: [], pregnancy: { lmp: lmp(275), at: ago(10) } } } }
const row = (item: string): PresenceRow => presence(item, { kind: 'stay', state: 'admitted', department_id: 'lw' })
const tc = { org: org(), dept: { id: 'lw', packs: ['obgyn'] } }

test('the tile: G and P, the weeks, the cervix, the hours, past a line, the baby\'s heart when off; nothing without the read', () => {
  assert.deepEqual(tileWords(row('s1'), tc, BOARD, NOW), { words: ['G2 P1', '39+2 w', '6 cm', '4 h', { text: 'past alert line', tone: 'warn' }] })
  assert.deepEqual(tileWords(row('s2'), tc, BOARD, NOW), { words: ['G3 P2', '38+1 w', '8 cm', '3 h', { text: `FHR 100 at ${hm(ago(5))}`, tone: 'danger' }] })
  assert.deepEqual(tileWords(row('s3'), tc, BOARD, NOW), { words: ['G1 P0', '40+5 w', '3 cm', 'latent'] })
  assert.deepEqual(tileWords(row('s4'), tc, BOARD, NOW), { words: ['39+2 w'] }, 'a pregnancy, no exam yet')
  assert.deepEqual(tileWords(row('s1'), { ...tc, org: org(5) }, BOARD, NOW), { words: ['G2 P1', '39+2 w', '6 cm', '2 h', { text: 'past alert line', tone: 'warn' }] }, 'from 5 cm')
  const full = { patient_ids: [], stays: { s1: { exams: [{ at: ago(600), cervix: 4 }, { at: ago(0), cervix: 10 }] } } }
  assert.deepEqual(tileWords(row('s1'), tc, full, NOW), { words: ['fully dilated', '10 h'] })
  const late = { patient_ids: [], stays: { s1: { exams: [{ at: ago(400), cervix: 4 }, { at: ago(0), cervix: 5 }] } } }
  assert.deepEqual(tileWords(row('s1'), tc, late, NOW), { words: ['5 cm', '6 h', { text: 'past action line', tone: 'danger' }] })
  for (const d of [undefined, null, 'x', {}, { stays: null }, { stays: { s1: { exams: 'no' } } }, { patient_ids: [], stays: { other: SALMA } }]) assert.equal(tileWords(row('s1'), tc, d, NOW), null)
  assert.equal(tileWords(row('constructor'), tc, BOARD, NOW), null)
  assert.equal(stayOf(BOARD, 's2'), NESMA); assert.equal(gpOf(SALMA.exams), 'G2 P1'); assert.equal(gpOf([{ at: ago(1), gravida: 2 }]), 'G2'); assert.equal(gpOf([]), null)
  assert.ok(inLabour(SALMA)); assert.ok(inLabour({ exams: [], pregnancy: { at: ago(1) } })); assert.ok(!inLabour({ exams: [] })); assert.ok(!inLabour(null))
  // through the core's tile line, as labour/index.tsx registers it (its hook's answer passed as the read)
  assert.ok(registerTileLine('obgyn', (r, c) => tileWords(r, c, c.read, NOW), () => undefined))
  const t: TileCtx = { dept: { id: 'lw', packs: ['obgyn'] }, place: null, identity: null, day: 1, can: () => true, org: org() }
  assert.deepEqual(tileLineOf(tileLineDefs(), row('s1'), t, { obgyn: BOARD }),
    [{ pack: 'obgyn', words: [{ text: 'G2 P1' }, { text: '39+2 w' }, { text: '6 cm' }, { text: '4 h' }, { text: 'past alert line', tone: 'warn' }] }])
  assert.deepEqual(tileLineOf(tileLineDefs(), row('s1'), t), [], 'before the read lands: nothing')
  assert.deepEqual(tileLineOf(tileLineDefs(), row('s1'), { ...t, dept: { id: 'lw', packs: [] } }, { obgyn: BOARD }), [], 'only where the ward uses ObGyn')
})

// the record of a woman in labour on the ward, as the chart reads it
const open = record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'admitted', department_id: 'lw' })]) })
const ex = (cervix: number, m: number, more: Partial<ServerEntry> = {}) => E(EXAM, { visit_id: 'st1', department_id: 'lw', occurred_at: ago(m), data: { cervix }, ...more })
const fh = (v: number, m: number) => E('observation', { visit_id: 'st1', department_id: 'lw', occurred_at: ago(m), data: { code: { text: 'Fetal heart rate', codings: [{ ...FHR_CODE }] }, value: { quantity: { value: String(v), unit: 'bpm', ucum: '/min' } } } })
const input = (es: ServerEntry[], rec = open): WordsInput => ({ rec, ctx: { ...chartCtx, org: org(), departmentId: 'lw' }, identity: { gender: 'female', birth_date: '1999-01-01' } as WordsInput['identity'],
  own: ownOf(es, [EXAM, 'observation']) })

test('the banner: past a line, the baby\'s heart off; never G and P; nothing without an open stay or an exam', () => {
  const at = new Date(NOW)
  assert.deepEqual(labourWords(input([ex(4, 240, { data: { cervix: 4, gravida: 2, para: 1 } }), ex(5, 120), ex(6, 5), fh(142, 5)]), at), [{ word: 'past alert line', rank: 1, tone: 'warn' }])
  assert.deepEqual(labourWords(input([ex(5, 180), ex(7, 90), ex(8, 20), fh(128, 20), fh(100, 5)]), at), [{ word: 'FHR 100', rank: 1, tone: 'danger' }])
  assert.deepEqual(labourWords(input([ex(4, 400), ex(5, 0), fh(172, 1)]), at), [{ word: 'past action line', rank: 1, tone: 'danger' }, { word: 'FHR 172', rank: 1, tone: 'danger' }])
  assert.deepEqual(labourWords(input([ex(4, 60), fh(100, 120), fh(140, 5)]), at), [], 'the latest heart rate counts')
  const closed = record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'discharged', department_id: 'lw' })]) })
  assert.deepEqual(labourWords(input([ex(4, 400), ex(5, 0)], closed), at), [])
  assert.deepEqual(labourWords(input([fh(100, 5)]), at), [], 'no exam')
  assert.deepEqual(labourWords(input([ex(4, 400, { visit_id: 'older' }), ex(5, 0, { visit_id: 'older' })]), at), [], 'another stay\'s exams')
})
test('the commands: offered where ObGyn is used, to whoever may write them; elsewhere /ve says where', () => {
  const names = (packs: string[], can: (a: string) => boolean = () => true) => commandsFor({ packs, can }).map((c) => c.name).filter((x) => ['ve', 'ctx', 'fhr'].includes(x))
  assert.deepEqual(names(['obgyn']), ['ve', 'ctx', 'fhr']); assert.deepEqual(names([]), [])
  assert.deepEqual(names(['obgyn'], (a) => a === 'write:observation'), ['fhr'])
  const away = { packs: [], usedIn: (p: string) => p === 'obgyn' ? ['Labour ward'] : [] }
  assert.equal(notHere(commandNamed('ve')!, away), '/ve is used in: Labour ward')
  assert.equal(err(parse('/ve 6', { ...here, packs: [], usedIn: away.usedIn })), '/ve is used in: Labour ward')
  assert.equal(commandNamed('ve')?.writes?.[0], EXAM); assert.equal(commandNamed('ctx')?.action, 'write:obgyn.labour_exam'); assert.deepEqual(commandNamed('fhr')?.writes, ['observation'])
  assert.equal(parse('/ve', here), null, 'no empty exam: nothing to sign until a finding is said')
})
console.log(`labour: ${n} groups passed`)
