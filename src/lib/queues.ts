/**
 * A queue is a patient-facing lane with no order machinery. Stored as a
 * capability-less department row (can_receive_patients only) — the UI never
 * calls it a department. Order-capable departments may ALSO have a patient
 * queue (hybrid); those are departments, not queues.
 */
import type { Department } from '../types'

export const isQueueDept = (d: Department) =>
  !!d.can_receive_patients && !d.can_receive_orders && !d.can_create_direct
