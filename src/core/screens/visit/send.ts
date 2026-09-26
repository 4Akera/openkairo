import { replyFormFor } from '../../renderers'
import { worksFor } from '../../hooks/organization'
import type { Organization } from '../../db/types'

/** a pharmacy here: a service whose reply is automatic (it answers prescriptions) and that works for this department */
export const canSendPrescriptions = (org: Organization | undefined, departmentId: string | null | undefined) =>
  (org?.services ?? []).some((x) => replyFormFor(x.reply_type)?.automatic && worksFor(org, x.department_id, departmentId))
