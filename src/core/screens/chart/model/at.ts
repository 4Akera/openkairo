// What the center shows (chart-plan.md §1.2), kept in the URL so a link lands on it: ?at=visit:<id> · outside · record · results ·
// entry:<id>, nothing for this encounter. The old ?entry=<id> and ?view=results are read as entry: and results. The record panel
// opens these (a visit, the entries outside any visit, a fact's entry); the center draws them (build plan 3.9). Pure.

export type At = { scope: 'encounter' } | { scope: 'visit'; id: string } | { scope: 'outside' } | { scope: 'record' } | { scope: 'results' } | { scope: 'entry'; id: string }
const PLAIN = new Set(['outside', 'record', 'results'])

/** the center's scope from a URL's query (an old link's entry= and view=results too) */
export function atOf(q: URLSearchParams): At {
  const a = q.get('at') ?? (q.get('entry') ? `entry:${q.get('entry')}` : q.get('view') === 'results' ? 'results' : '')
  const m = /^(visit|entry):(.+)$/.exec(a)
  if (m) return { scope: m[1] as 'visit' | 'entry', id: m[2] }
  return PLAIN.has(a) ? { scope: a as 'outside' | 'record' | 'results' } : { scope: 'encounter' }
}
/** the at= value of a scope; none for this encounter */
export const atParam = (at: At): string | null => at.scope === 'encounter' ? null : 'id' in at ? `${at.scope}:${at.id}` : at.scope
/** the query with the scope set (the old entry= and view= go, so they never fight it) */
export function withAt(q: URLSearchParams, at: At): URLSearchParams {
  const n = new URLSearchParams(q); const v = atParam(at)
  n.delete('entry'); n.delete('view')
  if (v) n.set('at', v); else n.delete('at')
  return n
}
export const sameAt = (a: At, b: At) => atParam(a) === atParam(b)
