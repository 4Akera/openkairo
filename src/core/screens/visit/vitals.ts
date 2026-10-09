// The vitals card's fields (spec 05; core change C2, §5.7 Q22): a child under two is weighed, measured lying (the base's height,
// method lying) and has the head measured, with no blood pressure; anyone else the adult card, with length or head when the line said
// them. Pure: a node test imports it.
type Q = Record<string, unknown>
export const VITALS: [string, string, string][] = [['systolic', 'Sys', 'mmHg'], ['diastolic', 'Dia', 'mmHg'], ['pulse', 'Pulse', 'bpm'], ['temperature', 'Temp', '°C'], ['weight', 'Wt', 'kg'], ['spo2', 'SpO₂', '%'], ['respiratory_rate', 'RR', '/min'], ['height', 'Ht', 'cm']]
const CHILD: [string, string, string][] = [['weight', 'Wt', 'kg'], ['length', 'Length', 'cm'], ['head', 'Head', 'cm'], ['temperature', 'Temp', '°C'], ['pulse', 'Pulse', 'bpm'], ['respiratory_rate', 'RR', '/min'], ['spo2', 'SpO₂', '%']]
/** completed months from a birth date to now (null when not known) */
export const monthsOld = (born: string | null | undefined, now = new Date()) => { if (!born) return null
  const [y, m, d] = born.slice(0, 10).split('-').map(Number); return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) - (now.getDate() < d ? 1 : 0) }
/** the vitals card's fields for this patient: a child under two the child's, else the adult's plus length and head when given */
export function vitalsFields(q: Q, born: string | null | undefined, now = new Date()): [string, string, string][] {
  const months = monthsOld(born, now)
  if (months !== null && months < 24) return CHILD
  return [...VITALS.filter(([k]) => k !== 'height' || q.length == null), ...CHILD.filter(([k]) => (k === 'length' || k === 'head') && q[k] != null)]
}
