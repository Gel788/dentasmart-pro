export function patientInitials(firstName: string, lastName: string) {
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase();
}

export function patientFullName(p: { firstName: string; lastName: string; middleName?: string | null }) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
}

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Мужской',
  FEMALE: 'Женский',
  OTHER: 'Не указан',
};

export type PatientFormValues = {
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  gender: string;
  tags: string;
  notes: string;
};

export const emptyPatientForm = (): PatientFormValues => ({
  firstName: '',
  lastName: '',
  middleName: '',
  birthDate: '',
  phone: '',
  email: '',
  gender: '',
  tags: '',
  notes: '',
});

export function patientFormToPayload(form: PatientFormValues) {
  const tags = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    middleName: form.middleName.trim() || undefined,
    birthDate: form.birthDate || undefined,
    phone: form.phone.trim() || undefined,
    email: form.email.trim() || undefined,
    gender: form.gender || undefined,
    tags: tags.length ? tags : undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function patientToForm(p: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  tags?: string[];
  notes?: string | null;
}): PatientFormValues {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    middleName: p.middleName ?? '',
    birthDate: p.birthDate ? String(p.birthDate).slice(0, 10) : '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    gender: p.gender ?? '',
    tags: (p.tags ?? []).join(', '),
    notes: p.notes ?? '',
  };
}
