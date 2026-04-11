/** Persist last-selected department block type for walk-in entry (per user + department). */

export function walkInLastBtStorageKey(deptId: string, userId: string): string {
  return `ok_walkin_last_bt:${userId}:${deptId}`
}

export function readWalkInLastBlockType(deptId: string, userId: string): string | null {
  try {
    const v = localStorage.getItem(walkInLastBtStorageKey(deptId, userId))
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function writeWalkInLastBlockType(deptId: string, userId: string, blockTypeId: string): void {
  try {
    localStorage.setItem(walkInLastBtStorageKey(deptId, userId), blockTypeId)
  } catch {
    /* ignore quota / private mode */
  }
}
