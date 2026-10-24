import { describe, expect, it } from 'vitest';
import { medicalDiff, medicalReviewDue, normalizeMedical, type MedicalFields } from './medical';

const base: MedicalFields = {
  allergies: ['Лидокаин'],
  chronicConditions: null,
  medications: 'Эналаприл',
  contraindications: null,
  anamnesis: null,
  anxiety: 'NONE',
  pregnant: false,
  anticoagulant: false,
};

describe('medical history', () => {
  it('normalizes text and allergies', () => {
    expect(normalizeMedical({ allergies: [' Латекс ', 'латекс', '', 'Лидокаин'], anamnesis: '   ', medications: ' Варфарин ' })).toEqual({
      allergies: ['Латекс', 'Лидокаин'],
      anamnesis: null,
      medications: 'Варфарин',
    });
  });

  it('lists only changed fields', () => {
    const changes = medicalDiff(base, { allergies: ['Лидокаин', 'Латекс'], medications: 'Эналаприл', anticoagulant: true });
    expect(changes.map((c) => c.field)).toEqual(['allergies', 'anticoagulant']);
    expect(changes[1]).toMatchObject({ label: 'Антикоагулянты', from: false, to: true });
    expect(medicalDiff(base, { anamnesis: null, chronicConditions: undefined })).toEqual([]);
  });

  it('asks to re-confirm after half a year or when never confirmed', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    expect(medicalReviewDue(null, now)).toBe(true);
    expect(medicalReviewDue('2026-09-01T10:00:00Z', now)).toBe(false);
    expect(medicalReviewDue('2026-03-01T10:00:00Z', now)).toBe(true);
  });
});
