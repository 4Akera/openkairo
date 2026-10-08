// Radiology's words on its orders (the side, portable, a report asked), from its own table radiology.requests, for its screens.
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import type { Words } from './exams'

export type RequestWords = Words & { item: string }
/** radiology's words on these orders (the side, portable, a report asked), from its own table */
export function useWords(deptId: string, items: string[]) {
  return useQuery({ queryKey: ['radiology.requests', deptId, items.join(',')], enabled: items.length > 0, staleTime: 30_000,
    queryFn: async () => new Map((await read<TableRead<RequestWords>>({ shape: 'table', table: 'radiology.requests', department_id: deptId, where: { item: items }, entries: false })).rows
      .map((r) => [r.item, r])) })
}
