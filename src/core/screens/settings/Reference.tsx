// Reference lists (spec/openCare.md §5.1 rule 7, §7 decision 5): the licensed code lists loaded here (ICD-10, ATC, EDA…), read-only,
// each with its version, source, licence note and when it was loaded. They come in by import script (scripts/import-codes.sh), never
// through the app; the demo's small sample is said to be one.
import { useQuery } from '@tanstack/react-query'
import { read } from '../../db/rpc'
import { Badge, Card, Empty, KV, PageHead, Spinner, dateTime } from '../../ui'

interface List { system: string; labels: Record<string, string>; uri: string; version: string | null; source: string; licence: string | null; sample: boolean
  codes: number; loaded_at: string; loads: number }

export function ReferencePage() {
  const q = useQuery({ queryKey: ['reference_lists'], queryFn: async () => (await read<{ lists: List[] }>({ shape: 'reference' })).lists })
  return <div className="grid gap-4">
    <PageHead title="Reference lists" hint="Licensed code lists loaded on this server, read-only. A new version comes in by the import script, run per installation." />
    {q.isLoading ? <Spinner /> : q.error ? <p role="alert" className="text-14 text-danger">{q.error.message}</p>
      : !q.data?.length ? <Card><Empty>No list has been loaded yet.</Empty></Card>
      : q.data.map((l) => <Card key={l.system} className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-14 font-semibold text-fg">{l.labels.en ?? l.system}</span>
          <span className="font-mono text-12 text-faint">{l.system}</span>
          {l.sample && <Badge tone="warn">demo sample, not the full list</Badge>}</div>
        <KV labelWidth="7rem" items={[['Version', l.version ?? '—'], ['Codes', l.codes.toLocaleString()], ['Source', l.source], ['Licence', l.licence ?? '—'],
          ['Loaded', `${dateTime(l.loaded_at)}${l.loads > 1 ? ` · ${l.loads} loads in all` : ''}`], ['System', <span className="break-all font-mono text-12">{l.uri}</span>]]} />
      </Card>)}
  </div>
}
