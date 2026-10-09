// The words for refusal and finding codes (spec/openCare.md §3.9): the codes are the API, the client only says them. A pack adds its
// own codes' words (registerWords), never the core's. Pure: no client here, so node tests read it.
const WORDS: Record<string, string> = {
  not_signed_in: 'Sign in first', not_a_member: 'This login belongs to no organization', choose_user: 'Choose which clinic you are working in',
  mfa_required: 'Settings changes need a second factor — turn it on above', not_allowed: 'Your role cannot do this here', not_found: 'Not found',
  bad_shape: 'Something in it is not in the right form', bad_entry: 'Something in it is not in the right form', unknown_type: 'Not a kind of entry this clinic knows',
  pack_off: 'That pack is off in this organization', wrong_patient: 'That belongs to another patient', two_patients: 'One Done is for one patient',
  changed_since_opened: 'Changed by someone else since you opened it — look again', set_changed: 'This was already sent with other content', busy: 'Someone else is writing for this patient — try again',
  unknown_system: 'An unknown code system', wrong_resource: 'That cannot continue this entry', wrong_target: 'That cannot correct this entry', in_the_future: 'The time is in the future',
  already_here: 'Already here: the open visit is used', already_called: 'Someone called this patient first', visit_closed: 'This visit has ended', not_admitted: 'Not admitted',
  already_admitted: 'Already admitted', not_a_visit: 'A stay is not a clinic visit: sign, move a bed or discharge', bed_taken: 'That bed is taken',
  wrong_work: 'Patients are not checked in there', not_served: 'That department does not work for this one',
  walk_in_elsewhere: 'A bench takes walk-ins only for itself; the desk only for the benches it checks in for',
  unknown_op: 'That is not something this screen can do', not_used_here: 'This department does not use that pack',
  same_department: 'Already there', bad_visit: 'Not a move of this visit', unknown_service: 'That service is not offered any more', wrong_department: 'Another department answers it',
  order_closed: 'That order is closed', wrong_answer: 'This order is answered another way', unknown_step: 'Not a step of this service', other_department: 'This patient is in another department', reserved_step: 'The bench uses that word for an order — name the step otherwise', has_answers: 'It has answers already: it stays', already_crossed_out: 'Already crossed out',
  never_private: 'Only notes and results can be private', reason_missing: 'A reason is needed', bad_target: 'That cannot be pointed at',
  last_administrator: 'Someone must keep the right to manage people and roles everywhere', self_change: 'You cannot change your own roles or a role you hold',
  cannot_grant: 'You cannot give a right you do not hold everywhere', builtin_role: 'Built-in roles are read-only — copy one to change it', unknown_action: 'Unknown action',
  in_use: 'It has been used, so it stays — retire it instead', name_missing: 'A name is needed', duplicate: 'Already exists', merged: 'That record was merged',
  bad_answer: 'No pack here answers that way', unknown_setting: 'Unknown setting', no_session: 'Sign in again to choose',
  file_missing: 'The file is not in storage: it was named in the record but never uploaded',
  names_hiv: 'An alert shows in every department, so it never names HIV or AIDS', nothing_to_end: 'Nothing standing to end', already_ended: 'Already ended: a new one starts its own',
  already_recorded: 'Already recorded by someone else — look again and change that one', dates_not_pregnant: 'Not pregnant takes no dates', lmp_or_weeks: 'The LMP or the weeks, not both',
  lmp_future: 'The LMP is after the day written', bad_lmp: 'The LMP is not a day', lmp_long_ago: 'The LMP is more than 44 weeks back', sex_male: 'Recorded pregnant, but the patient is male',
  note_missing: 'Write the note to show, or turn it off', bad_printout: 'Not a printout this clinic knows', unknown_purpose: 'Not a reason to read this clinic knows',
  unknown_score: 'Not a score declared here', score_retired: 'That version of the score is retired — fill it again', score_mismatch: 'The total is not the server\'s — fill the score again',
  score_incomplete: 'Every item of the score needs an answer', bad_input: 'An answer the score cannot take', already_signed: 'Already signed off for this clinic', pack_not_used: 'That pack is not used in this department',
  would_overwrite: 'Staff changed it here: it stays as they set it', unknown_setup: 'Not a setup this clinic has', unknown_part: 'Not a part of that setup',
  retired: 'It is retired',
  allergy_clash: 'Allergy', allergy_caution: 'Caution', duplicate_medication: 'Already on this medicine', duplicate_class: 'Another medicine of the same class', already_on_list: 'Already on the list',
}
export const USED: Record<string, string> = { record: 'the record points at it', services: 'it has services', people: 'people hold roles there', signed_in: 'this person has signed in', places: 'it has beds or rooms', outside: 'every organization keeps one' }
export const words = (code: string) => WORDS[code] ?? code.replace(/_/g, ' ')
/** a pack's words for its own refusal and finding codes, once each (the core's stand) */
export const registerWords = (w: Record<string, string>) => { for (const [k, v] of Object.entries(w)) if (!(k in WORDS)) WORDS[k] = v }

