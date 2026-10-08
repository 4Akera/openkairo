// The core's print facility (spec/openCare.md §3.13 Printing; the owner's (p1)–(p5), 2026-10-08), with no browser: Code 128 against the
// published patterns and known encodings; the papers and the one stylesheet of a print (the page's size, one label a page, the
// print-only rule, nothing in place outside a print); a print's lifecycle start to end (the read log first, drawn, the dialog, all taken
// away whatever happened, one at a time, the reprint mark); the P key; the clinic's header; the shared parts.   npm run test:print
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CODE_B, CODE_C, QUIET, START_B, START_C, STOP, VALUES, decode128, encode128, modulesOf, widthsOf } from '../src/core/print/code128'
import { PAPERS, ROOT_ID, mmOf, pageOf, stylesheet } from '../src/core/print/paper'
import { browserMemory, printer, type PrintEnv, type PrintJob } from '../src/core/print/session'
import { registerPrintout } from '../src/core/print/registry'
import { holdPrintKey, isPrintKey, onPrintKey, type KeyLike } from '../src/core/print/key'
import { headerLines, headerOf, logoOk, LOGO_MAX } from '../src/core/print/header'
import { Arabic, Barcode, PrintHeader, ReprintMark } from '../src/core/print/parts'
import type { Organization } from '../src/core/db/types'
import { printedOf } from '../src/core/print/log'

let n = 0
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const quiet = <T,>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }
// the published Code 128 patterns (ISO/IEC 15417, the symbol table): value 0 to 106, 1 a bar module, 0 a space
const PUBLISHED = ['11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', '11001001110',
  '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', '11011011000', '11011000110',
  '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010', '10110111000',
  '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010',
  '11001010000', '11110111010', '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100',
  '11110010100', '11110010010', '11011011110', '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000',
  '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011']

await test('Code 128: every symbol as published — three bars and three spaces, eleven modules (the stop thirteen), its bars an even count, each unique', () => {
  assert.equal(VALUES, 107); assert.equal(PUBLISHED.length, 107)
  for (let v = 0; v < VALUES; v++) {
    assert.equal(modulesOf(v), PUBLISHED[v], `value ${v}`)
    const w = [...widthsOf(v)].map(Number)
    assert.equal(w.reduce((a, b) => a + b, 0), v === STOP ? 13 : 11, `width of ${v}`)
    assert.equal(w.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) % 2, 0, `bars of ${v} even`)
  }
  assert.equal(new Set(PUBLISHED).size, 107)
  assert.throws(() => widthsOf(107)); assert.equal([START_B, START_C, CODE_C, CODE_B, STOP].join(','), '104,105,99,100,106')
})
await test('Code 128: known encodings — "A", "Wikipedia" (check 88), all digits in set C, the check digit modulo 103', () => {
  const a = encode128('A')
  assert.deepEqual(a.values, [104, 33]); assert.equal(a.check, 34, '(104 + 33) mod 103')
  assert.equal(a.modules, '11010010000' + '10100011000' + '10001011000' + '1100011101011', 'Start B, A, check 34, stop')
  const w = encode128('Wikipedia')
  assert.deepEqual(w.values, [104, 55, 73, 75, 73, 80, 69, 68, 73, 65]); assert.equal(w.check, 88, '3281 mod 103')
  const c = encode128('1234567890')
  assert.deepEqual(c.values, [105, 12, 34, 56, 78, 90], 'pairs of digits'); assert.equal(c.check, 85, '1115 mod 103')
  assert.equal(c.modules.length, (6 + 1) * 11 + 13, 'half the symbols of set B')
  assert.deepEqual(encode128('12345').values, [105, 12, 34, CODE_B, 21], 'an odd digit left goes back to set B')
})
await test('Code 128: a sample number encodes and scans back (set C for its last four digits); a broken check does not scan; set B only', () => {
  for (const s of ['S-1008-0001', 'S-0927-0012', 'R-00412', '7', '42']) assert.equal(decode128(encode128(s).modules), s, s)
  const e = encode128('S-1008-0001')
  assert.deepEqual(e.values, [104, 51, 13, 17, 16, 16, 24, 13, CODE_C, 0, 1]); assert.equal(e.check, 74)
  const broken = e.modules.slice(0, 11) + modulesOf(52) + e.modules.slice(22)
  assert.equal(decode128(broken), null, 'one symbol changed: the check fails')
  assert.throws(() => encode128('é')); assert.throws(() => encode128('a\n')); assert.throws(() => encode128(''))
})

await test('papers: a label 50 × 25 mm, no margin, one a page; a receipt roll 80 mm wide as long as its content; an A5 sheet', () => {
  assert.deepEqual([PAPERS.label.width, PAPERS.label.height, PAPERS.label.margin, PAPERS.label.each], [50, 25, 0, true])
  assert.deepEqual([PAPERS.receipt.width, PAPERS.receipt.height, PAPERS.receipt.margin, PAPERS.receipt.each], [80, null, 0, false])
  assert.deepEqual([PAPERS.a5.width, PAPERS.a5.height], [148, 210])
  assert.equal(Math.round(mmOf(96)), 25, 'an inch'); assert.deepEqual(pageOf(PAPERS.receipt, 378), { width: 80, height: 102 }, '378 px is 100 mm, a millimetre each end over')
  assert.deepEqual(pageOf(PAPERS.receipt, 10), { width: 80, height: 20 }, 'never shorter than 20 mm'); assert.deepEqual(pageOf(PAPERS.label, 9999), { width: 50, height: 25 })
})
await test('the stylesheet of a print: the page sized, each label a page, and in print only the printout — the screen around it hidden', () => {
  const label = stylesheet(PAPERS.label)
  assert.match(label, /@page \{ size: 50mm 25mm; margin: 0mm; \}/)
  assert.match(label, /#oc-print > \[data-sheet\] > \* \{ width: 50mm; height: 25mm; overflow: hidden;[^}]*break-after: page; page-break-after: always; \}/)
  assert.match(label, /#oc-print > \[data-sheet\] > \*:last-child \{ break-after: auto;/, 'no empty page after the last label')
  assert.match(stylesheet(PAPERS.receipt, 756), /@page \{ size: 80mm 202mm; margin: 0mm; \}/, 'a roll: its length from what it carries')
  assert.doesNotMatch(stylesheet(PAPERS.receipt, 756), /break-after/, 'a receipt is one page')
  const a5 = stylesheet(PAPERS.a5)
  assert.match(a5, /@page \{ size: 148mm 210mm; margin: 12mm; \}/); assert.match(a5, /#oc-print \{ width: 124mm; \}/)
  for (const css of [label, a5]) {
    const print = css.slice(css.indexOf('@media print'))
    assert.match(print, /body > :not\(#oc-print\) \{ display: none !important; \}/, 'only the printout prints')
    assert.match(print, /#oc-print \{ position: static !important;/, 'drawn off screen, it prints in place')
    assert.match(print, /background: var\(--paper\) !important/)
    assert.doesNotMatch(css.slice(0, css.indexOf('@media print')), /display: none/, 'on screen nothing is hidden')
  }
  assert.equal(ROOT_ID, 'oc-print')
})

// a print run against a pretend browser, each step written down
const header = { name: 'Nile Clinic', logo: null, address: null, phone: null, tax_number: null }
quiet(() => registerPrintout('base.probe', { paper: 'label', Component: () => null }))
function pretend(over: Partial<PrintEnv> = {}) {
  const steps: string[] = []; const kept = new Map<string, number>(); let styled = ''
  const env: PrintEnv = { log: async (j) => { steps.push(`log ${j.patientId}`) }, draw: async (p, j, r) => { steps.push(`draw ${p.paper} ${j.thing} ${r ?? 'first'}`); return 400 },
    style: (css) => { styled = css; steps.push('style') }, dialog: async () => { steps.push(`dialog ${styled ? 'styled' : 'bare'}`) },
    unstyle: () => { styled = ''; steps.push('unstyle') }, clear: () => { steps.push('clear') }, now: () => new Date('2026-10-08T08:42:00Z'), time: () => '10:42',
    memory: { seen: (t) => kept.has(t), keep: (t, at) => { kept.set(t, at.getTime()) } }, ...over }
  return { env, steps, styled: () => styled }
}
const job = (over: Partial<PrintJob> = {}): PrintJob => ({ key: 'base.probe', data: {}, header, thing: 'S-1008-0001', patientId: 'pt', departmentId: 'lab', ...over })
await test('a print: logged like a read first, drawn, the page sized, the dialog, then everything taken away; nothing left in place after', async () => {
  const p = pretend(); const print = printer(p.env)
  assert.deepEqual(await print(job()), { printed: true, reprint: null })
  assert.deepEqual(p.steps, ['log pt', 'draw label S-1008-0001 first', 'style', 'dialog styled', 'unstyle', 'clear'])
  assert.equal(p.styled(), '', 'outside a print no rule is in place: the browser\'s own Cmd-P prints the page as usual')
  const q = pretend(); await printer(q.env)(job({ patientId: null }))
  assert.equal(q.steps[0], 'draw label S-1008-0001 first', 'no patient\'s information: nothing to log')
})
await test('a second print of the same thing is a reprint with its time; the printing pack may say so itself (again); another thing is a first', async () => {
  const p = pretend(); const print = printer(p.env)
  await print(job()); assert.deepEqual(await print(job()), { printed: true, reprint: '10:42' })
  assert.match(p.steps.join('|'), /draw label S-1008-0001 10:42/)
  assert.deepEqual(await print(job({ thing: 'S-1008-0002' })), { printed: true, reprint: null })
  assert.deepEqual(await printer(pretend().env)(job({ again: true })), { printed: true, reprint: '10:42' }, 'a receipt\'s own count: a reprint after a reload')
})
await test('whatever fails, nothing stays: a log that cannot be written prints nothing; a failing draw or dialog is taken away; one print at a time', async () => {
  const a = pretend({ log: async () => { throw new Error('log failed') } })
  await assert.rejects(printer(a.env)(job()), /log failed/); assert.deepEqual(a.steps, ['unstyle', 'clear'], 'not drawn, not printed')
  const b = pretend({ dialog: async () => { throw new Error('closed') } })
  await assert.rejects(printer(b.env)(job())); assert.deepEqual(b.steps.slice(-2), ['unstyle', 'clear']); assert.equal(b.styled(), '')
  let release: (() => void) | null = null
  const c = pretend({ dialog: () => release ? Promise.resolve() : new Promise<void>((r) => { release = r }) }); const print = printer(c.env)
  const first = print(job()); await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(await print(job()), { printed: false, why: 'busy' }, 'a second print while the dialog is open'); release!(); await first
  assert.deepEqual(await print(job()), { printed: true, reprint: '10:42' }, 'then it prints again')
  assert.deepEqual(await quiet(() => print(job({ key: 'base.nothing' }))), { printed: false, why: 'unknown' })
})
await test('this browser\'s memory of what it printed: a day; storage blocked, this page only', () => {
  const store = new Map<string, string>(); const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
  const m = browserMemory(s); m.keep('lis:S-1', new Date()); assert.ok(m.seen('lis:S-1')); assert.ok(!m.seen('lis:S-2')); assert.ok(browserMemory(s).seen('lis:S-1'), 'after a reload')
  store.set('oc.printed', JSON.stringify({ old: Date.now() - 2 * 86_400_000 })); assert.ok(!browserMemory(s).seen('old'), 'older than a day: a first again')
  const blocked = browserMemory({ getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  blocked.keep('x', new Date()); assert.ok(blocked.seen('x'))
})

const key = (over: Partial<KeyLike> = {}): KeyLike => ({ key: 'p', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: { tagName: 'DIV' }, ...over })
await test('the P key: P alone, never while typing in a field, never with a modifier (Cmd-P stays the browser\'s), never held; the printout shown last answers', () => {
  assert.ok(isPrintKey(key())); assert.ok(isPrintKey(key({ key: 'P' })), 'Caps Lock')
  for (const m of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) assert.ok(!isPrintKey(key({ [m]: true })), m)
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.ok(!isPrintKey(key({ target: { tagName } })), tagName)
  assert.ok(!isPrintKey(key({ target: { tagName: 'DIV', isContentEditable: true } }))); assert.ok(!isPrintKey(key({ repeat: true }))); assert.ok(!isPrintKey(key({ key: 'o' })))
  const hits: string[] = []
  assert.equal(onPrintKey(key()), false, 'nothing on screen to print')
  const a = holdPrintKey(() => hits.push('a')); const b = holdPrintKey(() => hits.push('b'))
  let prevented = false; assert.ok(onPrintKey({ ...key(), preventDefault: () => { prevented = true } })); assert.ok(prevented)
  b(); onPrintKey(key()); a(); onPrintKey(key())
  assert.deepEqual(hits, ['b', 'a'], 'the last shown, then the one under it; gone, nothing')
})

await test('the clinic\'s header: the setting as it stands, else the organization\'s name; a small logo of a known kind only', () => {
  const org = (data?: Record<string, unknown>) => ({ organization: { name: 'Demo Clinic' }, settings: data ? [{ key: 'organization.header', thing_id: 'o', owner_id: 'o', data, recorded_at: '2026-10-08' }] : [] }) as unknown as Organization
  assert.deepEqual(headerOf(org()), { name: 'Demo Clinic', logo: null, address: null, phone: null, tax_number: null })
  const h = headerOf(org({ name: 'عيادة النيل', address: '12 Nile St, Cairo', phone: '+20 2 2345 6789', tax_number: '123-456-789' }))
  assert.equal(h.name, 'عيادة النيل'); assert.deepEqual(headerLines(h), ['12 Nile St, Cairo', 'Tel. +20 2 2345 6789 · Tax no. 123-456-789'])
  assert.ok(logoOk('data:image/png;base64,iVBORw0KGgo=')); assert.ok(!logoOk('data:image/gif;base64,R0lGOD=')); assert.ok(!logoOk('javascript:alert(1)'))
  assert.ok(!logoOk(`data:image/png;base64,${'A'.repeat(LOGO_MAX)}`), 'too large')
})
await test('the parts: the header (an Arabic name right to left), the bars (each run of modules, the quiet zones drawn), the reprint mark, Arabic', () => {
  const html = renderToStaticMarkup(createElement(PrintHeader, { header: { name: 'عيادة النيل', logo: 'data:image/png;base64,iVBORw0KGgo=', address: 'Cairo', phone: '0100', tax_number: '9' } }))
  assert.match(html, /<p dir="auto"[^>]*>عيادة النيل<\/p>/); assert.match(html, /<img src="data:image\/png;base64,iVBORw0KGgo="/); assert.match(html, /Tel\. 0100 · Tax no\. 9/)
  const bars = renderToStaticMarkup(createElement(Barcode, { value: 'S-1008-0001' }))
  const modules = encode128('S-1008-0001').modules
  assert.match(bars, new RegExp(`viewBox="0 0 ${modules.length + 2 * QUIET} 10"`)); assert.match(bars, /aria-label="Barcode S-1008-0001"/)
  assert.equal([...bars.matchAll(/M(\d+) 0h(\d+)/g)].map((m) => `${Number(m[1]) - QUIET}:${m[2]}`).join(' '),
    [...modules.matchAll(/1+/g)].map((m) => `${m.index}:${m[0].length}`).join(' '), 'every bar where its modules are')
  assert.equal(renderToStaticMarkup(createElement(ReprintMark, { at: null })), ''); assert.match(renderToStaticMarkup(createElement(ReprintMark, { at: '10:42' })), /Reprint · 10:42/)
  assert.match(renderToStaticMarkup(createElement(Arabic, null, 'قرص واحد')), /<p dir="rtl" lang="ar"/)
})
await test('the read log says what was printed: the printout\'s word and what it carried, never an id', () => {
  assert.equal(printedOf({ prints: [{ printout: 'lis.labels', what: 'S-1008-0001' }, { printout: 'base.prescription', what: '0199f2a1-5c1e-7000-8000-000000000001' }] }),
    'labels S-1008-0001, prescription'); assert.equal(printedOf({ records: [] }), '')
})
await test('printouts: a key in its layer\'s prefix, drawn by one component', () => {
  assert.equal(quiet(() => registerPrintout('base.probe', { paper: 'a5', Component: () => null })), false, 'taken')
  assert.equal(quiet(() => registerPrintout('Receipt', { paper: 'a5', Component: () => null })), false, 'not a key')
  assert.equal(registerPrintout('base.probe2', { paper: 'a5', Component: () => null }), true)
})
console.log(`print: ${n} groups passed`)
