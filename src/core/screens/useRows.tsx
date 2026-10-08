// The packs on a list's rows, drawn (rows.ts holds the rules): each row's pack buttons (a), the lines it hands (b) and its waiting orders
// (c). A pack's data is read once a list, through its own load, again on the clinic's hints, when the list's patients or orders change,
// and when a card closes having changed something — never on a timer, so a list left open reads (and logs) nothing on its own; a
// failing pack says nothing.
// One card is open under a row at a time in a list: a pack's own (Pay) or the core's "…anyway" card, whose reason the packs holding the
// orders record. Whoever goes ahead anyway may then do the work: those orders are free on every screen of this app from then on.
// The doctor's chart reads the soft checks alone (owner, 2026-10-08): the words of the record's open orders, once a chart, live like a
// list, never a pack's button, card or "…anyway".
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { mayIn } from '../db/views'
import { useDepartment } from '../hooks/organization'
import { useLive } from '../hooks/live'
import { Button, type RowMark } from '../ui'
import { AnywayCard, Quiet } from './RowCards'
import { benchViewDefs, benchViewsOf, chartWait, goAhead, isFree, orderWordDefs, orderWordsOf, placeOf, rowActionDefs, rowButtonsOf, rowPlaceDefs, rowsKey,
  softCheckDefs, waitsOf, waitWords, type OrderWait, type PackData, type PackRow, type RowCtx, type RowDept, type RowList } from './rows'

/** the orders someone went ahead with anyway, in this app: free from then on, on the list and the patient's page alike */
const useAhead = create<{ items: ReadonlySet<string>; add: (xs: string[]) => void }>((set) => ({
  items: new Set<string>(), add: (xs) => set((s) => ({ items: new Set([...s.items, ...xs]) })) }))

type Open = { row: string; kind: 'action'; pack: string } | { row: string; kind: 'anyway'; items: string[]; verb: string }
export interface PackRows {
  ctx: RowCtx | null
  /** the orders waiting, by order, and whether one is free to work */
  waits: ReadonlyMap<string, OrderWait>; ahead: ReadonlySet<string>; isFree: (item: string) => boolean
  /** the words the row's waiting orders show, as marks after the packs' own */
  marks: (row: PackRow) => RowMark[]
  /** the pack buttons on the row */
  buttons: (row: PackRow) => ReactNode
  /** "Collect anyway…": opens the reason card for these of the row's orders that wait (none waiting: nothing) */
  anyway: (row: PackRow, items: readonly string[], verb: string) => ReactNode
  /** the card open under this row, if any */
  below: (row: PackRow) => ReactNode
  /** (h) the row's place, a time (ms), from the first pack that gives one; none: as it came */
  place: (row: PackRow) => number | null
  /** (l) the packs' words on each order of the row, by order (the chart's order line) */
  orderWords: (row: PackRow) => Map<string, { key: string; word: string; tone?: RowMark['tone'] }[]>
  /** (m) the packs' own views on the bench: each its label and its orders by group */
  views: (rows: readonly PackRow[]) => { pack: string; label: string; groups: Map<string, string>; order: string[]; counts: string[] | null }[]
}

/** what the packs the list's department uses read for its rows, and the orders waiting (live: the clinic's hints; placesOnly: the
 *  rows' places alone; checksOnly: no row actions, places or views, for a page that only shows words) */
function usePackData(list: RowList, rows: PackRow[], dept: RowDept | null | undefined, { live = true, checksOnly = false, placesOnly = false } = {}) {
  const { org, dept: here } = useDepartment(); const d = dept ?? here
  const ctx = useMemo<RowCtx | null>(() => d ? { list, dept: { id: d.id, name: d.name, packs: d.packs, declared: d.declared ?? {} }, org, can: (a) => mayIn(org, a, d.id) } : null, [list, d, org])
  const actions = useMemo(() => checksOnly || placesOnly ? [] : rowActionDefs().filter((x) => d?.packs.includes(x.pack)), [d, checksOnly, placesOnly])
  const checks = useMemo(() => placesOnly ? [] : softCheckDefs().filter((x) => d?.packs.includes(x.pack)), [d, placesOnly])
  const places = useMemo(() => checksOnly ? [] : rowPlaceDefs().filter((x) => d?.packs.includes(x.pack)), [d, checksOnly])
  const words = useMemo(() => placesOnly ? [] : orderWordDefs().filter((x) => d?.packs.includes(x.pack)), [d, placesOnly])
  const views = useMemo(() => checksOnly || placesOnly || list !== 'bench' ? [] : benchViewDefs().filter((x) => d?.packs.includes(x.pack)), [d, checksOnly, placesOnly, list])
  const key = rowsKey(rows)
  useLive(live && org && (actions.length || checks.length || places.length || words.length || views.length) ? `organization:${org.organization.id}` : null, [['pack-rows']])
  const loads = [...actions.map((a) => ['action', a] as const), ...checks.map((c) => ['check', c] as const), ...places.map((c) => ['place', c] as const),
    ...words.map((c) => ['words', c] as const), ...views.map((c) => ['view', c] as const)].filter(([, x]) => x.load)
  const results = useQueries({ queries: loads.map(([kind, x]) => ({ queryKey: ['pack-rows', kind, x.pack, list, d?.id ?? null, key],
    queryFn: () => x.load!(rows, ctx!), enabled: !!ctx && rows.length > 0, placeholderData: keepPreviousData, retry: false })) })
  const dataOf = (kind: 'action' | 'check' | 'place' | 'words' | 'view'): PackData => Object.fromEntries(loads.flatMap(([k, x], i) => {
    const r = results[i]; return k === kind && !r.isError && r.data !== undefined ? [[x.pack, r.data]] : [] }))
  const actionData = dataOf('action'); const checkData = dataOf('check'); const placeData = dataOf('place'); const wordData = dataOf('words'); const viewData = dataOf('view')
  const dataKey = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(',')
  const waits = useMemo(() => {
    const m = new Map<string, OrderWait>()
    if (ctx) for (const r of rows) for (const [k, v] of waitsOf(checks, r, ctx, checkData)) if (!m.has(k)) m.set(k, v)
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, checks, key, dataKey])
  const ahead = useAhead((s) => s.items)
  return { ctx, actions, checks, actionData, waits, ahead, places, placeData, words, wordData, views, viewData }
}

/** (h) the rows' places alone, for a page that only follows the list's order (the chart's Done → next): a row's place, a time (ms) */
export function usePlaces(list: RowList, rows: PackRow[]) {
  const { ctx, places, placeData } = usePackData(list, rows, null, { placesOnly: true })
  return (row: PackRow) => ctx ? placeOf(places, row, ctx, placeData) : null
}
/** (l) the packs' words on orders, for a page that shows them on each order's line (the doctor's chart): by order */
export function useOrderWords(list: RowList, rows: PackRow[]) {
  const { ctx, words, wordData } = usePackData(list, rows, null, { live: false, checksOnly: true })
  const by = new Map<string, { key: string; word: string; tone?: RowMark['tone'] }[]>()
  if (ctx) for (const r of rows) for (const [k, v] of orderWordsOf(words, r, ctx, wordData)) if (!by.has(k)) by.set(k, v)
  return (item: string) => by.get(item) ?? []
}

/** (c) on the doctor's chart (owner, 2026-10-08): the word a pack gives each of the record's open orders, by order — its word and tone
 *  only; none where no pack the reader's department uses holds it, or someone went ahead. rows: chartRowOf (the record's open orders) */
export function useOrderWaits(rows: PackRow[]): (item: string, status: string | null | undefined) => OrderWait | null {
  const { waits, ahead } = usePackData('chart', rows, null, { checksOnly: true })
  return useCallback((item: string, status: string | null | undefined) => chartWait(item, status, waits, ahead), [waits, ahead])
}

/** the packs on a list: rows as the list draws them (all of them, before any split by view); dept: the list's department (default: the
 *  one I work in now) */
export function usePackRows(list: RowList, rows: PackRow[], dept?: RowDept | null): PackRows {
  const { ctx, actions, checks, actionData, waits, ahead, places, placeData, words, wordData, views, viewData } = usePackData(list, rows, dept)
  const qc = useQueryClient(); const addAhead = useAhead((s) => s.add)
  const [open, setOpen] = useState<Open | null>(null)
  const changed = () => void qc.invalidateQueries({ queryKey: ['pack-rows'] })

  const buttons = (row: PackRow) => { if (!ctx) return null
    const bs = rowButtonsOf(actions, row, ctx, actionData); if (!bs.length) return null
    return <>{bs.map((b) => { const on = open?.row === row.key && open.kind === 'action' && open.pack === b.pack
      return <Button key={b.pack} size="sm" variant={on ? 'ghost' : 'outline'} aria-expanded={on}
        onClick={(e) => { e.stopPropagation(); setOpen(on ? null : { row: row.key, kind: 'action', pack: b.pack }) }}>{b.label}</Button> })}</> }
  const anyway = (row: PackRow, items: readonly string[], verb: string) => {
    const waiting = items.filter((i) => !isFree(i, waits, ahead)); if (!waiting.length || !ctx) return null
    const on = open?.row === row.key && open.kind === 'anyway'
    return <Button size="sm" variant="ghost" aria-expanded={on} onClick={(e) => { e.stopPropagation(); setOpen(on ? null : { row: row.key, kind: 'anyway', items: waiting, verb }) }}>{verb} anyway…</Button>
  }
  const below = (row: PackRow) => {
    if (!ctx || open?.row !== row.key) return null
    if (open.kind === 'action') {
      const a = actions.find((x) => x.pack === open.pack); if (!a) return null
      return <div className="border-t border-line bg-sunken p-3" onClick={(e) => e.stopPropagation()}><Quiet pack={a.pack}>
        <a.Card row={row} ctx={ctx} data={actionData[a.pack]} close={(did) => { setOpen(null); if (did) changed() }} /></Quiet></div>
    }
    const items = open.items.filter((i) => !isFree(i, waits, ahead)); if (!items.length) return null
    return <AnywayCard verb={open.verb} words={waitWords(items, waits, ahead).map((w) => w.word)}
      names={row.orders.filter((o) => items.includes(o.item)).map((o) => o.service_name ?? 'an order')} onClose={() => setOpen(null)}
      onGo={async (reason) => { const done = await goAhead(checks, row, items, reason, waits, ctx); addAhead(done); setOpen(null); changed() }} />
  }
  const orderWords = (row: PackRow) => ctx ? orderWordsOf(words, row, ctx, wordData) : new Map()
  // the row's marks: the words its waiting orders show, then the packs' words on its orders, each word once
  const marks = (row: PackRow): RowMark[] => {
    const out: RowMark[] = waitWords(row.orders.map((o) => o.item), waits, ahead).map((w) => ({ key: `wait:${w.word}`, word: w.word, ...(w.tone ? { tone: w.tone } : {}) }))
    for (const ws of orderWords(row).values()) for (const w of ws) if (!out.some((m) => m.word === w.word)) out.push({ key: `word:${w.key}:${w.word}`, word: w.word, ...(w.tone ? { tone: w.tone } : {}) })
    return out
  }
  const place = (row: PackRow) => ctx ? placeOf(places, row, ctx, placeData) : null
  const packViews = (rs: readonly PackRow[]) => ctx ? benchViewsOf(views, rs, ctx, viewData) : []
  return { ctx, waits, ahead, isFree: (i) => isFree(i, waits, ahead), marks, buttons, anyway, below, place, orderWords, views: packViews }
}
