// The cards the core folds out under a list's row (spec/openCare.md §5.4): the "…anyway" card of a soft check, and a pack's own card
// (its row action) kept quiet when it fails. Drawn by useRows.tsx.
import { Component, useState, type ReactNode } from 'react'
import { Button, Input, Tag, errorText } from '../ui'
import { reasonReady, REASON_MAX } from './rows'

/** the "…anyway" card under the row: what waits and why, then one line of reason (required); the packs holding the orders record it */
export function AnywayCard({ verb, words, names, onGo, onClose }: { verb: string; words: string[]; names: string[]; onGo: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const ok = reasonReady(reason)
  const go = async () => { if (!ok || busy) return; setBusy(true); setError(null); try { await onGo(reason) } catch (x) { setError(x) } finally { setBusy(false) } }
  return <div className="grid gap-2 border-t border-line bg-sunken p-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
    <p className="flex flex-wrap items-center gap-1.5 text-13 text-fg">{words.map((w) => <Tag key={w} tone="warn">{w}</Tag>)}<span className="text-muted">{names.join(', ')}</span></p>
    <div className="flex flex-wrap items-center gap-2">
      <Input dense autoFocus value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go() } }}
        placeholder="Why now: an emergency, will pay after…" aria-label={`${verb} anyway: why`} className="w-full max-w-md" />
      <Button size="sm" disabled={!ok} loading={busy} onClick={() => void go()}>{verb} anyway</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
    </div>
    {!!error && <p role="alert" className="text-12 text-danger">Not recorded: {errorText(error)}</p>}
  </div>
}

/** a pack's card that fails says nothing (and is logged); the list goes on */
export class Quiet extends Component<{ pack: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.error(`openCare: the row card of ${this.props.pack} failed`, e) }
  render() { return this.state.failed ? null : this.props.children }
}
