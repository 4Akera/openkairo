// The ICU chart's patients (spec/openCare.md §5.6): a chip for each stay admitted here, in bed order, then those with no bed; the one
// chosen is kept in the link (?stay=), so a tile's ICU chart opens the tab on its patient.
import type { Organization, PresenceRow, TableRead } from '@core/db/types'
import { Chip } from '@core/ui'
import { bedName } from './useIcu'

export function StayPicker({ rows, stays, org, chosen, onChoose }: { rows: PresenceRow[]; stays: TableRead<PresenceRow> | undefined; org: Organization | undefined
  chosen: PresenceRow | undefined; onChoose: (item: string) => void }) {
  return <div role="group" aria-label="Patients" className="flex flex-wrap items-center gap-1.5">{rows.map((r) => {
    const who = stays?.patients[r.patient_id]; const name = who ? [who.given[0], who.given[1] ?? who.family].filter(Boolean).join(' ') : 'A patient'
    return <Chip key={r.item} shape="pill" on={r.item === chosen?.item} onClick={() => onChoose(r.item)}>{bedName(r, org)} · {name}</Chip>
  })}</div>
}
