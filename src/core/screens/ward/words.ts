import type { EntryData } from '../../db/shapes.generated'

/** where a discharge goes (the shape's disposition codes, FHIR's), in words: the bed board's and a stay's own screen */
export const DISPOSITION: [EntryData['discharged']['disposition'], string][] = [['home', 'Home'], ['other-hcf', 'Another facility'], ['hosp', 'Hospice'], ['aadvice', 'Left against advice'], ['exp', 'Died'], ['oth', 'Other']]
