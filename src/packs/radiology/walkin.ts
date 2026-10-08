// A walk-in's line at Radiology (spec §5.5, Q7): the doctor's words, and the exams asked for most. Pure.
import type { Service } from '@core/db/types'
import { contrastMissed, examsFor, wordsOf, type Kind } from './exams'
import { contrastOf } from './line'

/** the exams asked for most, by code, in the order they show */
export const MOST_ASKED = ['xrchest', 'usabd', 'uspelvis', 'xrknee', 'xrlspine', 'ctbrain']
const COMMAND: Record<string, Kind> = { xr: 'X-ray', xray: 'X-ray', x: 'X-ray', us: 'Ultrasound', sonar: 'Ultrasound', ct: 'CT', mri: 'MRI', mr: 'MRI' }

/** the exams a walk-in's line names among this bench's: "/us abd", "/xr knee left", or a code. withContrast: the department's own
 *  word on each exam (radiology.exams); what it cannot place is handed back, and a word that fits several says which (never guessed) */
export function examsIn(line: string, offered: Service[], withContrast: (s: Service) => boolean = contrastOf): {
  found: Service[]; unknown: string[]; fits: { word: string; names: string[] }[]; said: ReturnType<typeof wordsOf> } {
  const m = line.trim().match(/^\/(\S+)\s*(.*)$/); const kind = m ? COMMAND[m[1].toLowerCase()] : undefined
  const rest = m ? m[2] : line; const said = wordsOf(rest)
  const pool = kind ? offered.filter((s) => s.section_name === kind) : offered
  const found: Service[] = []; const unknown: string[] = []; const fits: { word: string; names: string[] }[] = []
  for (const seg of said.exams) {
    const hits = examsFor(seg, pool, withContrast, said.contrast)
    if (contrastMissed(hits, withContrast, said.contrast)) unknown.push(`${seg} ${said.contrast === 'both' ? '±c' : said.contrast === 'without' ? '−c' : '+c'}`)
    else if (hits.length === 1) { if (!found.includes(hits[0])) found.push(hits[0]) }
    else if (hits.length > 1) fits.push({ word: seg, names: hits.map((h) => h.name) })
    else unknown.push(seg)
  }
  return { found, unknown, fits, said }
}
