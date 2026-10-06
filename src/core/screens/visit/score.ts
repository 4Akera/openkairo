// A score worked out once (spec/openCare.md §5.1 rule 8): /score gcs 4 4 6 (or /gcs e4 v4 m6) opens the score's card under the line;
// while the clinician fills it, the card asks the server (debounced) and shows each item's points, the total and its band in words; Done
// writes the server's total with the version it used. Pure: the line, the card's state, the preview's timing, Settings' words. The client
// shows a table's points and never adds them up.
import type { ScoreBand, ScoreItem, ScoreTable, SettingRow } from '../../db/types'
import type { Tone } from '../../ui/tone'
import type { Ctx, Parsed, Result } from './parse'

export type Inputs = Record<string, string | boolean>
/** the server's answer (the read shape 'score') */
export interface ScoreResult { score: string; version: string; retired: boolean; items: { key: string; value?: unknown; points: number | null }[]
  so_far: number; total: number | null; complete: boolean; band: ScoreBand | null; missing: string[]; problems: { item: string; code: string }[] }
/** a score draft: the table it follows, what is filled in, and the server's answer (or its failure) with the inputs it answered (for) */
export interface ScoreParams { score: string | null; version: string | null; short: string; inputs: Inputs; result: (ScoreResult & { for: string }) | null
  failed?: { for: string; message: string } | null }

const words = (l?: Record<string, string>) => l?.en ?? ''
/** the versions in use: the latest of each score not retired (read 'me' sends them in declaration order) */
export function inUse(tables: ScoreTable[] | undefined): ScoreTable[] {
  const latest = new Map<string, ScoreTable>()
  for (const t of tables ?? []) if (!t.retired_at) latest.set(t.key, t)
  return [...latest.values()]
}
/** what this department may score: the base's, and a pack's where the department uses the pack */
export const offered = (tables: ScoreTable[] | undefined, packs?: string[]) => inUse(tables).filter((t) => t.layer === 'base' || t.layer === 'core' || !packs || packs.includes(t.layer))
export const tableOf = (tables: ScoreTable[] | undefined, key: string | null, version: string | null) => tables?.find((t) => t.key === key && t.version === version)
/** a score by what is typed: its key, its alias, its short name, or the start of its name */
export function findScore(tables: ScoreTable[], word: string): ScoreTable | undefined {
  const w = word.trim().toLowerCase(); if (!w) return undefined
  return tables.find((t) => t.key === w || t.alias === w || t.short.toLowerCase() === w) ?? (w.length >= 3 ? tables.find((t) => words(t.labels).toLowerCase().startsWith(w)) : undefined)
}
/** /gcs … is /score gcs …: a score's alias, where no command has the name */
export function aliasLine([word, rest]: [string, string], ctx: Pick<Ctx, 'scores' | 'packs'>, isCommand: boolean): [string, string] {
  if (isCommand || !word) return [word, rest]
  const t = offered(ctx.scores, ctx.packs).find((x) => x.alias === word.toLowerCase())
  return t ? ['score', `${t.key} ${rest}`.trim()] : [word, rest]
}

const YES = /^(y|yes|true)$/i; const NO = /^(n|no|false)$/i
/** a typed value for an item: a choice's value (or the start of its words), yes or no, a number as typed */
export function valueFor(item: ScoreItem, raw: string): string | boolean | null {
  if (item.input === 'yes_no') return YES.test(raw) ? true : NO.test(raw) ? false : null
  if (item.input === 'number') return /^-?\d+(\.\d+)?$/.test(raw) ? raw : null
  const r = raw.toLowerCase(); const cs = item.choices ?? []
  return cs.find((c) => c.value.toLowerCase() === r)?.value ?? (r.length >= 3 ? cs.find((c) => words(c.labels).toLowerCase().startsWith(r))?.value : undefined) ?? null
}
const expects = (i: ScoreItem) => i.input === 'yes_no' ? 'yes or no' : i.input === 'number' ? `a number${i.unit ? ` (${i.unit})` : ''}` : `one of ${(i.choices ?? []).map((c) => c.value).join(' · ')}`

export const keyOf = (p: Pick<ScoreParams, 'score' | 'version' | 'inputs'>) => `${p.score}@${p.version}:${JSON.stringify(Object.keys(p.inputs).sort().map((k) => [k, p.inputs[k]]))}`
/** the server's answer is for what the card holds now */
export const current = (p: ScoreParams) => !!p.result && p.result.for === keyOf(p)
/** the server failed to answer for what the card holds now (nothing is in flight: the card offers to ask again) */
export const failedNow = (p: ScoreParams) => !current(p) && p.failed?.for === keyOf(p) ? p.failed.message : null
export function draft(t: ScoreTable, inputs: Inputs = {}): Parsed {
  const params: ScoreParams = { score: t.key, version: t.version, short: t.short, inputs, result: null }
  return { function: 'score', kind: 'score', action: 'write:score', params: params as unknown as Record<string, unknown>, line: scoreLine(params) }
}
/** "/score gcs 4 4 6", "e4 v4 m6", "eye 4", "rr=16": an item by its key's start, else the next one not filled */
export function parseScore(rest: string, ctx: Pick<Ctx, 'scores' | 'packs'>): Result {
  const tables = offered(ctx.scores, ctx.packs); const [first, ...ws] = rest.trim().split(/\s+/).filter(Boolean)
  if (!first) return null
  const t = findScore(tables, first)
  if (!t) return { error: tables.length ? `No score “${first}” — try ${tables.map((x) => `/score ${x.alias ?? x.key}`).join(' · ')}` : 'No score is declared here' }
  const inputs: Inputs = {}
  const itemBy = (w: string) => { const l = w.toLowerCase(); const hits = t.items.filter((i) => i.key.startsWith(l)); return t.items.find((i) => i.key === l) ?? (hits.length === 1 ? hits[0] : undefined) }
  for (let k = 0; k < ws.length; k++) {
    const w = ws[k]; const next = t.items.find((i) => !(i.key in inputs))
    const kv = w.match(/^([a-z_]+)[=:](.+)$/i) ?? w.match(/^([a-z_]+?)(-?\d+(?:\.\d+)?)$/i)
    let item: ScoreItem | undefined = next; let raw = w
    if (kv && itemBy(kv[1])) { item = itemBy(kv[1]); raw = kv[2] }
    else if (/^[a-z_]+$/i.test(w) && itemBy(w) && ws[k + 1] !== undefined && (!next || valueFor(next, w) === null)) { item = itemBy(w); raw = ws[++k] }
    if (!item) return { error: `${t.short} has ${t.items.length} items: “${w}” is one too many` }
    const v = valueFor(item, raw)
    if (v === null) return { error: `${words(item.labels)}: “${raw}” — ${expects(item)}` }
    inputs[item.key] = v
  }
  return { ok: [draft(t, inputs)] }
}
/** /score alone: the one score, or a card that asks which */
export const emptyScore = (ctx: Pick<Ctx, 'scores' | 'packs'>): Parsed[] => { const ts = offered(ctx.scores, ctx.packs)
  return [ts.length === 1 ? draft(ts[0]) : { function: 'score', kind: 'score', action: 'write:score', line: 'Score', params: { score: null, version: null, short: '', inputs: {}, result: null } }] }

/** the draft's one line: the server's total and band once it has answered, else the score's name */
export function scoreLine(p: ScoreParams): string {
  if (!p.score) return 'Score'
  const r = current(p) && p.result?.complete ? p.result : null
  return r ? `${p.short} ${r.total}${r.band ? ` · ${words(r.band.labels)}` : ''}` : p.short
}

const PROBLEM: Record<string, string> = { unknown_choice: 'not one of the choices', not_yes_no: 'yes or no', not_a_number: 'a number', too_precise: 'too many decimals',
  out_of_range: 'out of range', unknown_item: 'not an item of this score' }
export const problemWords = (code: string) => PROBLEM[code] ?? code.replace(/_/g, ' ')
export const toneOf = (b?: ScoreBand | null): Tone => b?.tone ?? 'neutral'
export interface ItemState { key: string; label: string; input: ScoreItem['input']; unit?: string; value: string | boolean | null; points: number | null; problem: string | null
  options: { value: string; label: string; points: number }[] }
export interface CardState { items: ItemState[]; total: number | null; soFar: number | null; band: { words: string; tone: Tone } | null; complete: boolean; waiting: boolean; retired: boolean
  failed: string | null }
/** what the card draws: each item with its value and the server's points for it; the total and its band only from the server */
export function cardState(t: ScoreTable, p: ScoreParams): CardState {
  const r = current(p) ? p.result : null; const failed = failedNow(p)
  const items = t.items.map((i): ItemState => {
    const got = r?.items.find((x) => x.key === i.key); const bad = r?.problems.find((x) => x.item === i.key)
    return { key: i.key, label: words(i.labels), input: i.input, unit: i.unit, value: p.inputs[i.key] ?? null, points: got?.points ?? null, problem: bad ? problemWords(bad.code) : null,
      options: i.input === 'choice' ? (i.choices ?? []).map((c) => ({ value: c.value, label: words(c.labels), points: c.points }))
        : i.input === 'yes_no' ? [{ value: 'yes', label: 'Yes', points: i.points?.yes ?? 0 }, { value: 'no', label: 'No', points: i.points?.no ?? 0 }] : [] }
  })
  return { items, total: r?.complete ? r.total : null, soFar: r ? r.so_far : null, band: r?.complete && r.band ? { words: words(r.band.labels), tone: toneOf(r.band) } : null,
    complete: !!r?.complete, waiting: Object.keys(p.inputs).length > 0 && !r && !failed, retired: !!r?.retired || !!t.retired_at, failed }
}
/** what a score draft still needs before it can be added (the server would refuse it at Done) */
export function scoreMissing(p: ScoreParams, t?: ScoreTable): string | null {
  if (!p.score || !t) return 'Choose the score'
  if (t.retired_at) return `${t.short} ${t.version} is retired — type /score ${t.alias ?? t.key} again`
  const r = current(p) ? p.result : null
  const bad = r?.problems[0]; const label = (k: string) => words(t.items.find((i) => i.key === k)?.labels) || k
  if (bad) return `${label(bad.item)}: ${problemWords(bad.code)}`
  const left = t.items.filter((i) => p.inputs[i.key] === undefined).map((i) => words(i.labels))
  if (left.length) return `Answer: ${left.join(', ')}`
  return !r ? (failedNow(p) ? 'The server could not add it up — try again' : 'Working out the total…') : !r.complete || r.total == null ? 'The server could not add it up' : null
}
/** the entry Done writes: the inputs and the server's total and band, with the version it used */
export function scoreData(p: ScoreParams) {
  return { score: String(p.score), version: String(p.version), inputs: p.inputs, total: p.result?.total ?? 0, band: p.result?.band?.key ?? '' }
}

export interface Timers { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void }
const REAL: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }
/** ask the server once the clinician pauses: requests within `wait` become the last one; a reply to an older request is dropped */
export function previewer<I, R>(ask: (i: I) => Promise<R>, done: (i: I, r: R) => void, failed: (i: I, e: unknown) => void, wait = 250, timers: Timers = REAL) {
  let h: unknown = null; let seq = 0
  return {
    request(i: I) {
      if (h !== null) timers.clear(h)
      const n = ++seq
      h = timers.set(() => { h = null; ask(i).then((r) => { if (n === seq) done(i, r) }, (e) => { if (n === seq) failed(i, e) }) }, wait)
    },
    cancel() { if (h !== null) timers.clear(h); h = null; seq++ },
  }
}

// ── Settings → Scores: the table in words, and who signed a version off for this clinic ──
const num = (n: number, d = 0) => n.toFixed(d)
/** a range of a number in words: "≤ 8", "9–11", "≥ 25" */
export function rangeWords(r: { min?: number; max?: number }, decimals = 0): string {
  return r.min == null ? `≤ ${num(r.max ?? 0, decimals)}` : r.max == null ? `≥ ${num(r.min, decimals)}` : r.min === r.max ? num(r.min, decimals) : `${num(r.min, decimals)}–${num(r.max, decimals)}`
}
export const bandRange = (b: ScoreBand) => b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`
/** the live sign-off of a version here (the setting's author and time are who and when), if any */
export const signOffOf = (settings: SettingRow[], key: string, version: string) =>
  settings.filter((s) => s.key === 'score.signed_off' && s.data.score === key && s.data.version === version).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
