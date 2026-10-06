// Settings → Packs (spec/openCare.md §5.1 rule 1, §5.2): the packs installed, each turned on or off for the clinic, its settings, and
// its background work in words: catching up after it was turned on again, refreshes that failed and are tried again or stopped, the
// patients it is stale for, with Retry (a door that queues the work again). Nothing fails silently; the page follows the drain's hints.
import { Link } from 'react-router-dom'
import { writeSetting, retryPack } from '../../db/rpc'
import { useLive } from '../../hooks/live'
import { mayIn } from '../../db/views'
import type { Organization } from '../../db/types'
import { Badge, Button, Callout, Empty, PageHead, Section, Switch, Tag, errorText } from '../../ui'
import { useSave } from './save'
import { hasSettings } from './PackSettings'
import { workOf } from './packWork'

export function PacksPage({ org }: { org: Organization }) {
  // the packs used are one setting: the whole list is written each time
  const used = org.packs.filter((p) => p.enabled).map((p) => p.key)
  const on = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: [...used, key] } }))
  const off = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: used.filter((k) => k !== key) } }))
  const retry = useSave((key: string) => retryPack(key)); const done = retry.data as { requeued: number } | undefined
  const canRetry = mayIn(org, 'manage:settings', null)   // as the door asks: held everywhere
  const busy = on.isPending || off.isPending
  // while a pack works in the background, each drain run's hint (a row done, failed or parked) reads the directory again
  const working = org.packs.some((p) => p.enabled && (p.work.catchUp || p.work.waiting > 0 || p.work.failing > 0))
  useLive(working ? `organization:${org.organization.id}` : null, [['organization']])
  const e = on.error ?? off.error ?? retry.error
  return <div className="grid gap-4">
    <PageHead title="Packs" hint="Add-ons installed on this server. Turn one on to use it in this organization; turned on again, it catches up in the background." />
    <Section flush id="packs" title="Installed" count={org.packs.length} summary={org.packs.filter((p) => p.enabled).map((p) => p.name).join(', ') || 'none on'}>
      {org.packs.length === 0 ? <Empty>No packs installed on this server yet.</Empty>
      : <ul className="divide-y divide-line">{org.packs.map((p) => { const w = workOf(p.work)
          return <li key={p.key} className="grid gap-1.5 px-4 py-2.5 text-14">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1"><span className="font-medium">{p.name}</span> <span className="font-mono text-12 text-faint">{p.key}</span></span>
              {hasSettings(org, p.key) && <Link to={`/settings/packs/${p.key}`} className="rounded-sm text-12 text-accent hover:underline focus-ring">Settings</Link>}
              <Badge tone={p.enabled ? 'accent' : 'neutral'}>{p.enabled ? 'On' : 'Off'}</Badge>
              <Switch checked={p.enabled} label={p.name} disabled={busy}
                onChange={() => p.enabled ? confirm(`Turn off ${p.name}? What it adds stops working here until it is turned on again.`) && off.mutate(p.key) : on.mutate(p.key)} />
            </div>
            {p.enabled && w.lines.length > 0 && <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
              {w.lines.map((l) => <Tag key={l.text} tone={l.tone}>{l.text}</Tag>)}
              {w.retry && (canRetry ? <Button size="sm" variant="outline" loading={retry.isPending && retry.variables === p.key} onClick={() => retry.mutate(p.key)}>Retry</Button>
                : <span className="text-12 text-faint">Retry needs Change settings in every department</span>)}
            </div>}
            {!p.enabled && p.work.stale > 0 && <p className="text-12 text-faint">Off: its tables wait. Turned on again, it catches up {p.work.stale === 1 ? 'the patient' : `all ${p.work.stale} patients`} it is behind on.</p>}
          </li> })}</ul>}
      {e && <p className="px-4 py-2 text-14 text-danger">{errorText(e)}</p>}
    </Section>
    {retry.isSuccess && done && <Callout tone="info">{done.requeued ? `${done.requeued} queued again: they run in the background.` : 'Nothing was waiting to try again.'}</Callout>}
  </div>
}
