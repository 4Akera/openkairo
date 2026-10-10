// The labour ward's commands in the composer (spec/openCare.md §5.6), where a department uses ObGyn: /ve the labour examination,
// /ctx the contractions alone (the same type), /fhr the baby's heart as the base's observation (LOINC 55283-6), with a notice under
// the card when it is under 110 or over 160; and the exam's card. Registrations only (no read), so the node test imports it.
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { EXAM, type ExamData } from './codes'
import { examLine, fhrNote, parseCtx, parseExam, parseFhr } from './exam'
import { ExamCard } from './ExamCard'

const cmd = { pack: 'obgyn', group: 'record' as const, groupTitle: 'ObGyn' }
registerCommand({ ...cmd, name: 've', title: 'Labour examination', label: 'Labour examination — the cervix, the head, position, liquor, moulding, caput, contractions',
  example: '/ve 6 3/5 oa clear m+ ctx 3/10 40s', action: 'write:obgyn.labour_exam', writes: [EXAM], parse: (rest) => rest ? parseExam(rest) : null })
registerCommand({ ...cmd, name: 'ctx', title: 'Contractions', label: 'Contractions in 10 minutes, and how long', example: '/ctx 3/10 40s',
  action: 'write:obgyn.labour_exam', writes: [EXAM], parse: (rest) => rest ? parseCtx(rest) : null })
registerCommand({ ...cmd, name: 'fhr', title: 'Baby’s heart', label: 'The baby’s heart rate (the base’s observation, LOINC 55283-6)', example: '/fhr 142',
  action: 'write:observation', writes: ['observation'], parse: (rest) => rest ? parseFhr(rest) : null,
  note: (items) => { const n = fhrNote(items); return n ? <p className="text-12 text-danger">{n.text}</p> : null } })
registerCard({ function: EXAM, pack: 'obgyn', Editor: ExamCard, line: (q) => examLine(q as ExamData) })
