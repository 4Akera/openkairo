// Moved to the kit (design-system.md §4.4, build plan 1.3): the kit's parts under their old names, so no importer changes yet.
// Step 2.7 moves the importers to '../../ui' and its names; step 4 deletes this file.
import type { ReactNode } from 'react'
import { Chip, Empty as KitEmpty, Field, Fieldset, FormRow, SaveState, SearchInput, Section as KitSection } from '../../ui'
export { DeleteButton, EditPanel, NewCard, PageHead, RetireButton, Row, Segmented, useDraft, useFold } from '../../ui'

export const Line = FormRow
export const Group = Fieldset
export const Labeled = Field
export const Unsaved = () => <SaveState state="unsaved" />
export const Saved = () => <SaveState state="saved" />
/** a settings section: its body is a list that brings its own padding */
export const Section = (p: { id: string; title: ReactNode; count?: number | string; summary?: ReactNode; right?: ReactNode; start?: boolean; children: ReactNode }) => <KitSection flush {...p} />
export const Pick = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => <Chip variant="check" shape="pill" on={on} onClick={onClick}>{children}</Chip>
export const Filter = (p: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void }) => <SearchInput {...p} className="max-w-sm" />
export const Empty = ({ children }: { children: ReactNode }) => <KitEmpty>{children}</KitEmpty>
