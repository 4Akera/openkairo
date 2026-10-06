// Settings → Scores (spec/openCare.md §5.1 rule 8): every score table, read-only — its items and their points, its bands, its version
// and its source — and, for this clinic, the clinician who signed the version off and when. A sign-off is a setting (score.signed_off,
// written by sign:score); a score not signed off still works, and says so. Earlier versions fold under the one in use.
import type { Organization, ScoreItem, ScoreTable } from '../../db/types'
import { writeSetting } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { Badge, Button, Card, Empty, KV, PageHead, Section, Tag, dateTime, errorText } from '../../ui'
import { bandRange, inUse, rangeWords, signOffOf, toneOf } from '../visit/score'
import { useSave } from './save'

export function ScoresPage({ org }: { org: Organization }) {
  const keys = [...new Set(org.scores.map((s) => s.key))]
  const latest = inUse(org.scores)
  return <div className="grid gap-4">
    <PageHead title="Scores" hint="Every score's points table, read-only: the server adds each one up, and an entry keeps the version it used. A clinician signs a version off for this clinic." />
    {!keys.length ? <Card><Empty>No score is declared on this server.</Empty></Card> : keys.map((k) => {
      const versions = org.scores.filter((s) => s.key === k); const now = latest.find((s) => s.key === k) ?? versions[versions.length - 1]
      const older = versions.filter((v) => v !== now).reverse()
      return <Card key={k} className="grid gap-3 p-4">
        <Version org={org} t={now} />
        {older.length > 0 && <Section flush variant="compact" id={`scores.${k}.older`} start={false} title="Earlier versions" count={older.length}
          summary={older.map((v) => v.version).join(', ')}><div className="grid gap-4 p-3">{older.map((v) => <Version key={v.version} org={org} t={v} />)}</div></Section>}
      </Card>
    })}
  </div>
}

/** one version: its name, sign-off, source, items and bands */
function Version({ org, t }: { org: Organization; t: ScoreTable }) {
  const { can } = useDepartment()
  const sign = useSave(() => writeSetting({ key: 'score.signed_off', data: { score: t.key, version: t.version } }))
  const withdraw = useSave((thing: string) => writeSetting({ key: 'score.signed_off', thing_id: thing, retired: true }))
  const signed = signOffOf(org.settings, t.key, t.version); const who = org.users.find((u) => u.id === signed?.author_id)?.name ?? 'someone'
  const maySign = can('sign:score') && !t.retired_at; const busy = sign.isPending || withdraw.isPending
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-14 font-semibold text-fg">{t.labels.en ?? t.short}</span><span className="font-mono text-12 text-faint">{t.short} · {t.version}</span>
      {t.retired_at && <Badge>retired {dateTime(t.retired_at)}</Badge>}
      <span className="ms-auto flex flex-wrap items-center gap-2 text-12">
        {signed ? <span className="text-muted">Signed off for this clinic by <span className="font-medium text-fg">{who}</span> · {dateTime(signed.recorded_at)}</span>
          : <Badge tone="warn">not signed off for this clinic</Badge>}
        {maySign && (signed ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw.mutate(signed.thing_id)}>Withdraw</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => sign.mutate(undefined)}>Sign off {t.version}</Button>)}
      </span>
    </div>
    {(sign.error ?? withdraw.error) && <p role="alert" className="text-13 text-danger">{errorText((sign.error ?? withdraw.error)!)}</p>}
    <KV labelWidth="7rem" items={[['Source', t.source], ['Composer', `/score ${t.alias ?? t.key}${t.alias ? ` · /${t.alias}` : ''}`], ['Declared by', t.layer === 'base' ? 'the base' : `the ${t.layer} pack`]]} />
    <table className="w-full text-13"><thead><tr className="text-start text-11 text-faint"><th className="py-1 pe-3 text-start font-medium">Item</th><th className="py-1 text-start font-medium">Points</th></tr></thead>
      <tbody className="divide-y divide-line">{t.items.map((i) => <tr key={i.key}><td className="py-1.5 pe-3 align-top text-fg">{i.labels.en ?? i.key}{i.unit && <span className="ms-1 text-11 text-faint">{i.unit}</span>}</td>
        <td className="py-1.5 text-muted">{pointsOf(i)}</td></tr>)}</tbody></table>
    <div className="flex flex-wrap items-center gap-1.5 text-12"><span className="text-faint">Total</span>
      {t.bands.map((b) => <Tag key={b.key} tone={toneOf(b)}><span className="tnum">{bandRange(b)}</span> {b.labels.en}</Tag>)}</div>
  </div>
}

/** how an item scores, in words: each choice, yes and no, each range of a number */
function pointsOf(i: ScoreItem): string {
  if (i.input === 'choice') return (i.choices ?? []).map((c) => `${c.labels.en ?? c.value} ${c.points}`).join(' · ')
  if (i.input === 'yes_no') return `yes ${i.points?.yes ?? 0} · no ${i.points?.no ?? 0}`
  return (i.ranges ?? []).map((r) => `${rangeWords(r, i.decimals ?? 0)} → ${r.points}`).join(' · ')
}
