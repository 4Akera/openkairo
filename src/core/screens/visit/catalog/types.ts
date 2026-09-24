// Suggestion lists for fast entry (built and clinically reviewed 2026-09-24). They suggest and warn; they are not a code system.
export interface Drug { name: string; atc: string; group: string; route: string; unit: string; strengths: number[]; frequency: string; allergy_class: string | null; synonyms: string[] }
export interface ProblemTerm { name: string; icd10: string; abbr: string[]; chronic: boolean }
export interface Allergen { name: string; kind: 'drug' | 'drug_class' | 'food' | 'environmental' | 'other'; allergy_class: string | null; synonyms: string[] }
export interface CrossRule { allergy_class: string; also: string[]; level: 'warn' | 'caution'; note: string }
