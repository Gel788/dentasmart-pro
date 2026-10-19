/** The medical history is re-confirmed with the patient at least this often. */
export const MEDICAL_REVIEW_DAYS = 180;

export type AnxietyLevel = 'NONE' | 'MILD' | 'HIGH';

export type MedicalFields = {
  allergies: string[];
  chronicConditions: string | null;
  medications: string | null;
  contraindications: string | null;
  anamnesis: string | null;
  anxiety: AnxietyLevel;
  pregnant: boolean;
  anticoagulant: boolean;
};

export const MEDICAL_LABELS: Record<keyof MedicalFields, string> = {
  allergies: 'Аллергии',
  chronicConditions: 'Хронические заболевания',
  medications: 'Постоянные препараты',
  contraindications: 'Противопоказания',
  anamnesis: 'Анамнез',
  anxiety: 'Страх лечения',
  pregnant: 'Беременность',
  anticoagulant: 'Антикоагулянты',
};

export const MEDICAL_KEYS = Object.keys(MEDICAL_LABELS) as (keyof MedicalFields)[];

export const ANXIETY_LABELS: Record<AnxietyLevel, string> = { NONE: 'нет', MILD: 'тревожность', HIGH: 'выраженный страх' };

/** Trimmed, de-duplicated (case-insensitively) allergy list; empty text becomes null. */
export function normalizeMedical(input: Partial<MedicalFields>): Partial<MedicalFields> {
  const out: Partial<MedicalFields> = {};
  for (const key of MEDICAL_KEYS) {
    if (!(key in input) || input[key] === undefined) continue;
    const value = input[key];
    if (key === 'allergies') {
      const seen = new Set<string>();
      out.allergies = ((value as string[]) ?? [])
        .map((item) => item.trim())
        .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
    } else if (typeof value === 'string' || value === null) {
      (out as Record<string, unknown>)[key] = (value ?? '').trim() || null;
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export type MedicalChange = { field: keyof MedicalFields; label: string; from: unknown; to: unknown };

/** Fields of `next` that differ from `prev`, in the order a reader expects. */
export function medicalDiff(prev: MedicalFields, next: Partial<MedicalFields>): MedicalChange[] {
  const changes: MedicalChange[] = [];
  for (const key of MEDICAL_KEYS) {
    if (!(key in next) || next[key] === undefined) continue;
    const a = prev[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((item, index) => item === b[index])
      : (a ?? null) === (b ?? null);
    if (!same) changes.push({ field: key, label: MEDICAL_LABELS[key], from: a ?? null, to: b ?? null });
  }
  return changes;
}

/** Whether the history needs confirming with the patient before treatment. */
export function medicalReviewDue(confirmedAt: string | Date | null | undefined, now: Date = new Date()) {
  if (!confirmedAt) return true;
  const at = typeof confirmedAt === 'string' ? Date.parse(confirmedAt) : confirmedAt.getTime();
  return Number.isNaN(at) || now.getTime() - at > MEDICAL_REVIEW_DAYS * 86400000;
}
