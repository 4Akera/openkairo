// A walk-in's line at Radiology (spec §5.5, Q7): the doctor's words, and the exams asked for most. Pure.
import type { Service } from '@core/db/types'
import { examsFor, wordsOf, type Kind } from './exams'
import { contrastOf } from './line'

/** the exams asked for most, by code, in the order they show */
export const MOST_ASKED = ['xrchest', 'usabd', 'uspelvis', 'xrknee', 'xrlspine', 'ctbrain']
const COMMAND: Record<string, Kind> = { xr: 'X-ray', xray: 'X-ray', x: 'X-ray', us: 'Ultrasound', sonar: 'Ultrasound', ct: 'CT', mri: 'MRI', mr: 'MRI' }

/** the exams a walk-in's line names among this bench's: "/us abd", "/xr knee left", or a code; what it cannot place is handed back */
export function examsIn(line: string, offered: Service[]): { found: Service[]; unknown: string[]; said: ReturnType<typeof wordsOf> } {
  const m = line.trim().match(/^\/(\S+)\s*(.*)$/); const kind = m ? COMMAND[m[1].toLowerCase()] : undefined
  const rest = m ? m[2] : line; const said = wordsOf(rest)
  const pool = kind ? offered.filter((s) => s.section_name === kind) : offered
  const found: Service[] = []; const unknown: string[] = []
  for (const seg of said.exams) { const hits = examsFor(seg, pool, contrastOf, said.contrast); if (hits.length === 1) { if (!found.includes(hits[0])) found.push(hits[0]) } else unknown.push(seg) }
  return { found, unknown, said }
}

