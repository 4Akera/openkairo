// Moved to the kit (design-system.md §4.4, build plan 1.3): ListRow and ListSection are the kit's; step 2.3 moves the
// importers to '../../ui' and step 4 deletes this file.
import type { ComponentProps } from 'react'
import { Tag as KitTag } from '../../ui'
export { ListRow, ListSection } from '../../ui'

/** the old Tag: its "green" was drawn teal, so it stays accent here until the queue's two uses are decided (build plan 2.10, D2) */
export const Tag = ({ tone, ...p }: ComponentProps<typeof KitTag>) => <KitTag tone={tone === 'green' ? 'accent' : tone} {...p} />
