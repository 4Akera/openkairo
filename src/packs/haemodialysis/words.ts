// Dialysis's refusals in words (spec/openCare.md §5.6): the checks of the session, the prescription and the reading, and the schedule's
// op, name what is wrong; an HBV or HCV chair is never one (shown, never a stop). Pure: npm run test:haemodialysis.
export const REFUSALS: Record<string, string> = {
  not_a_session: 'This is not a dialysis session', session_not_in_stay: 'A session is written in a stay in this unit',
  session_missed_in_stay: 'A missed session is not in a stay', session_exists: 'This stay has its session already',
  session_on_day: 'A session is recorded for this patient today already', already_scheduled: 'This patient has a slot here already: end it first',
  chair_taken: 'That chair is taken then', not_a_chair: 'That is not a chair of this unit', no_such_shift: 'This unit has no such shift',
  bad_days: 'Choose Sat · Mon · Wed or Sun · Tue · Thu', bad_day: 'Choose a day', not_a_day: "Not one of the slot's days",
  already_moved: 'That session is moved already: undo it first', too_far: 'Move a session to a day within two weeks',
  shifts_out_of_order: 'Shifts start in order: earliest first', already_due: 'This patient comes that day already',
  shift_in_use: 'A slot or a coming move still uses that shift: move them first',
  prescription_exists: 'This patient has a standing prescription already: change it', not_a_prescription: 'This is not a dialysis prescription',
  heparin_none_with_dose: 'No heparin, or a heparin dose: not both', reading_not_in_session: 'A reading is written while the session is on',
  not_a_reading: 'This is not a dialysis reading',
}
