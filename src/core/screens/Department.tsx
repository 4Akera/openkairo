import { useDepartment } from '../hooks/organization'
import { Centered, Spinner } from '../ui'
import { ReceptionScreen } from './Reception'
import { Bench } from './bench/Bench'
import { ClinicHome } from './clinic/ClinicHome'
import { BedBoard } from './ward/BedBoard'

/** The department's home (spec/openCare.md §4.6): the screen it opens on, by its work — the desk checks in, a clinic works its
 *  queue, a ward its beds, a bench (lab, imaging, a pharmacy's dispensing) its worklist. */
export function DepartmentScreen() {
  const { dept, org } = useDepartment()
  if (!dept || !org) return <Centered><Spinner /></Centered>
  const screen = dept.opens ?? ''
  if (screen === 'base.desk' || dept.work === 'desk') return <ReceptionScreen departmentId={dept.id} />
  if (screen === 'base.beds' || dept.work === 'stays') return <BedBoard dept={dept} />
  const offers = org.services.some((s) => s.department_id === dept.id)
  if (dept.work === 'bench' || dept.work === 'outside') return <Bench departmentId={dept.id} name={dept.name} type={dept.type} />
  return <ClinicHome dept={dept} offers={offers} />
}
