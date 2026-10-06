// The demo's files (spec/openCare.md §5.1 rule 9): pure, no browser, no database. Every time is relative to the load (no fixed
// date anywhere), the load order is the base, then each pack, then the shared journey, every demo and seed file is in it, the
// sign-in page's logins come from the generated file only, and each pack's ids sit in its own namespace.
// npm run test:demo (the database half, loading it twice, is supabase/tests/demo.sql)
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DEMO_GROUPS, DEMO_PASSWORD } from '../src/core/shell/logins.generated'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const LOAD = 'supabase/demo/load.sql'
const order = read(LOAD).split('\n').filter((l) => l.startsWith('-- include: ')).map((l) => l.slice(12).trim())
const demoFiles = readdirSync(new URL('supabase/demo/', root)).filter((f) => f.endsWith('.sql') && f !== 'load.sql').map((f) => `supabase/demo/${f}`)
// the shared journey: one file per layer's step, <n>-<layer>.sql, in the journey's order
const journeyFiles = readdirSync(new URL('supabase/demo/journey/', root)).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/demo/journey/${f}`)
const layerOf = (f: string) => /\/journey\/\d+-(\w+)\.sql$/.exec(f)?.[1]
const seedFiles = readdirSync(new URL('supabase/seeds/', root)).filter((f) => f.endsWith('.sql') && f !== 'codes.sql').map((f) => `supabase/seeds/${f}`)

// a fixed date or year, written as one: an ISO day, a year on its own as a value, a year in words, a date built from numbers
const FIXED: [RegExp, string][] = [
  [/\b(19|20)\d{2}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?\b(?!-)/, 'a calendar date'],
  [/["'](19|20)\d{2}["']/, 'a year as a value'],
  [/\b(in|since|of|from|until|by|before|after)\s+(19|20)\d{2}\b/i, 'a year in words'],
  [/\bmake_(date|timestamp|timestamptz)\s*\(/i, 'a date built from numbers'],
  [/\b(date|timestamp|timestamptz)\s+'\d/i, 'a date literal'],
]
const code = (line: string) => line.trimStart().startsWith('--') ? '' : line.replace(/\s--\s.*$/, '')   // comments say what, not when
const fixedIn = (text: string) => text.split('\n').flatMap((line, i) =>
  FIXED.filter(([re]) => re.test(code(line))).map(([, what]) => `line ${i + 1}: ${what}: ${line.trim().slice(0, 120)}`))

test('no fixed date anywhere in the demo: every time is relative to the moment it loads', () => {
  for (const f of [...demoFiles, ...journeyFiles, ...seedFiles]) assert.deepEqual(fixedIn(read(f)), [], f)
})
test('one clock: a demo file times nothing by now() itself, only through the kit (demo.ago, demo.now, demo.midnight), so today stays today', () => {
  for (const f of [...demoFiles, ...journeyFiles, ...seedFiles.filter((x) => !x.endsWith('demo_kit.sql'))]) {
    assert.deepEqual(read(f).split('\n').map(code).filter((l) => /(?<!demo\.)\bnow\(\)|current_date|current_timestamp|clock_timestamp/i.test(l)), [], f)
  }
})
test('the fixed-date scan catches each way of writing one', () => {
  assert.equal(fixedIn(`'lmp', '2026-08-01'`).length, 1)
  assert.equal(fixedIn(`{"onset":{"value":"2019","precision":"year"}}`).length, 1)
  assert.equal(fixedIn(`'took co-trimoxazole in 2024'`).length, 1)
  assert.equal(fixedIn(`'birth_date', make_date(1971, 5, 12)`).length, 1)
  assert.equal(fixedIn(`timestamptz '2026-10-01 09:00'`).length, 2)
  assert.deepEqual(fixedIn(`'00000000-0000-0000-0000-00000000a001' '2093-3' demo.born(55, 147) -- since 2019`), [], 'ids, LOINC codes, relative ages and comments pass')
})
test('one load order: the kit, the base (seed, day), each pack (seed, day), the journey\'s steps last, in order; every file in it once', () => {
  assert.equal(order[0], 'supabase/seeds/demo_kit.sql')
  assert.deepEqual(order.slice(1, 3), ['supabase/seeds/dev.sql', 'supabase/demo/base.sql'])
  assert.deepEqual(order.slice(-journeyFiles.length), journeyFiles, 'the journey\'s steps last, in their numbered order')
  assert.equal(layerOf(journeyFiles[0]), 'base', 'the base starts the journey'); assert.equal(layerOf(journeyFiles.at(-1)!), 'base', 'and ends it (home)')
  assert.equal(new Set(order).size, order.length, 'each once')
  for (const f of [...demoFiles, ...journeyFiles, ...seedFiles]) assert.ok(order.includes(f), `${f} is loaded`)
  // a pack's journey step needs its pack: its seed and day load before the journey
  for (const f of journeyFiles.filter((x) => layerOf(x) !== 'base')) {
    assert.ok(order.includes(`supabase/seeds/${layerOf(f)}.sql`) && order.includes(`supabase/demo/${layerOf(f)}.sql`), `${f}: its pack is loaded`)
  }
  // a pack's seed comes right before its day, after the base's
  for (const f of demoFiles.filter((x) => !/\/(base|journey)\.sql$/.test(x))) {
    const seed = f.replace('supabase/demo/', 'supabase/seeds/')
    assert.equal(order.indexOf(seed) + 1, order.indexOf(f), `${f} follows its seed`)
    assert.ok(order.indexOf(seed) > order.indexOf('supabase/demo/base.sql'), `${seed} after the base`)
  }
})
test('a pack writes in its own namespace and only through the kit: ids are demo.id(<pack>, …), never another pack\'s', () => {
  const named = (f: string) => [...new Set([...read(f).matchAll(/demo\.id\('([^']+)'/g)].map((m) => m[1]))]
  for (const f of order.filter((x) => /\/(seeds|demo)\/(?!demo_kit|dev|base|load)\w+\.sql$/.test(x) || (x.includes('/journey/') && layerOf(x) !== 'base'))) {
    const pack = layerOf(f) ?? f.split('/').at(-1)!.replace('.sql', ''); const text = read(f)
    assert.deepEqual(named(f), [pack], `${f} names only its own ids`)
    assert.doesNotMatch(text, /\binsert\s+into\b|\bupdate\s+core\.|\bdelete\s+from\b/i, `${f} writes through the doors`)
  }
  // the base's journey steps name the journey's patient and no pack's ids (a pack's step is in its own file)
  for (const f of journeyFiles.filter((x) => layerOf(x) === 'base')) assert.ok(named(f).every((l) => l === 'journey'), `${f} names no pack's ids: ${named(f)}`)
  for (const f of order.filter((x) => x.startsWith('supabase/demo/'))) assert.doesNotMatch(read(f), /\binsert\s+into\b|\bupdate\s+\w+\.\w+\s+set\b|\bdelete\s+from\b/i, `${f}: no table written`)
})
test('the sign-in page lists the generated logins, grouped by department, and types none itself', () => {
  assert.ok(DEMO_GROUPS.length > 1 && DEMO_GROUPS.every((g) => g.people.length > 0), 'every group has people')
  assert.equal(DEMO_GROUPS[0].departmentId, null, 'held everywhere first')
  const login = read('src/core/shell/Login.tsx')
  assert.match(login, /from '\.\/logins\.generated'/)
  assert.doesNotMatch(login, /@demo\.com/, 'no email typed on the page')
  assert.match(login, /import \{[^}]*\bDEMO_PASSWORD\b[^}]*\} from '\.\/logins\.generated'/, 'the password from the generated file')
  assert.ok(DEMO_PASSWORD.length > 0 && !login.includes(DEMO_PASSWORD), 'and never typed on the page')
  assert.match(read('supabase/seeds/demo_kit.sql'), new RegExp(`function demo\\.password\\(\\)[^;]*'${DEMO_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), 'the kit\'s demo.password() is the one written')
  assert.equal(read('supabase/seeds/demo_kit.sql').split(`'${DEMO_PASSWORD}'`).length, 2, 'the kit names it once (demo.login uses demo.password())')
  const byEmail = new Map<string, string>()
  for (const g of DEMO_GROUPS) for (const p of g.people) {
    assert.ok(!byEmail.has(p.email) || byEmail.get(p.email) === p.name, `${p.email} is one person`)
    byEmail.set(p.email, p.name)
  }
  const names = [...byEmail.values()]
  assert.equal(new Set(names).size, names.length, 'each name is unique')
  assert.ok(names.every((x) => /^(Dr\. )?[A-Z][a-z]+ [A-Z][a-z]+/.test(x)), 'real-sounding names, never a job title')
})
test('a demo person per role the seeds grant, and each pack role on its pack\'s department', () => {
  const roles = new Set(DEMO_GROUPS.flatMap((g) => g.people.map((p) => p.role)))
  for (const r of ['Owner', 'Doctor', 'Nurse', 'Reception', 'Lab technician', 'Pharmacist', 'Store keeper']) assert.ok(roles.has(r), r)
  const pharmacy = DEMO_GROUPS.find((g) => g.department === 'Pharmacy')
  assert.deepEqual(pharmacy?.people.map((p) => p.role).sort(), ['Pharmacist', 'Store keeper'])
})
console.log(`demo: ${n} groups passed`)
