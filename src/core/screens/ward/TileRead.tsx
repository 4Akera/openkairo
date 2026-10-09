// A pack's read for its tile line (tiles.ts, core change C7): its hook in a part of its own, so the board calls each pack's hook the same
// way on every render; what it returns goes up to the board, which draws its tiles again when it changes.
import { useEffect } from 'react'
import type { Department } from '../../db/types'
import type { LineDef } from './tiles'

export function TileRead({ def, dept, onRead }: { def: LineDef; dept: Pick<Department, 'id' | 'packs'>; onRead: (pack: string, value: unknown) => void }) {
  const value = def.useRead!(dept)
  useEffect(() => { onRead(def.pack, value) }, [def.pack, value, onRead])
  return null
}
