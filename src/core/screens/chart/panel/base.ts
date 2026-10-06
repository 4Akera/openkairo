// The base's sections of the record panel (spec/openCare.md §4.6, §5.1 rule 2): always shown, in this order after the Summary, each
// with its chip word. A pack registers its own the same way (registerSection, sections.ts).
import { allergiesWord, documentsWord, historyWord, medicinesWord, problemsWord, resultsWord, visitsWord } from '../model/chips'
import { registerSection } from '../sections'
import { Allergies } from './Allergies'
import { Documents } from './Documents'
import { History } from './History'
import { Medicines } from './Medicines'
import { Problems } from './Problems'
import { Results } from './Results'
import { Summary } from './Summary'
import { Visits } from './Visits'

registerSection({ key: 'summary', title: 'Summary', Body: Summary, word: () => null, fold: false })
registerSection({ key: 'problems', title: 'Problems', Body: Problems, word: (x) => problemsWord(x.rec, x.ctx, x.drafted) })
registerSection({ key: 'medicines', title: 'Medicines', Body: Medicines, word: (x) => medicinesWord(x.rec, x.ctx, x.drafted) })
registerSection({ key: 'allergies', title: 'Allergies', Body: Allergies, word: (x) => allergiesWord(x.rec, x.ctx, x.drafted) })
registerSection({ key: 'history', title: 'History', Body: History, word: (x) => historyWord(x.facts, x.ctx.org?.types) })
registerSection({ key: 'results', title: 'Results', Body: Results, word: (x) => resultsWord(x.rec, x.ctx.org?.types) })
// its files are read when the section is opened, so its count shows from then ("3+" while earlier pages remain)
registerSection({ key: 'documents', title: 'Documents', Body: Documents, word: (x) => documentsWord(x.documents) })
registerSection({ key: 'visits', title: 'Visits', Body: Visits, word: (x) => visitsWord(x.rec, x.ctx) })
