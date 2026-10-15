'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';

export type MedicalProfile = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  tags?: string[];
  notes?: string | null;
  source?: string | null;
  allergies?: string[];
  chronicConditions?: string | null;
  medications?: string | null;
  contraindications?: string | null;
  anamnesis?: string | null;
};

export function hasClinicalAlert(patient: { allergies?: string[]; contraindications?: string | null }) {
  return Boolean(patient.allergies?.length || patient.contraindications?.trim());
}

export function ClinicalAlert({ patient }: { patient: { allergies?: string[]; contraindications?: string | null } }) {
  if (!hasClinicalAlert(patient)) return null;
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-[var(--danger)]">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div className="text-sm">
        <p className="font-semibold">Клиническое предупреждение</p>
        {!!patient.allergies?.length && <p className="mt-1">Аллергии: {patient.allergies.join(', ')}</p>}
        {patient.contraindications?.trim() && <p className="mt-1">Противопоказания: {patient.contraindications}</p>}
      </div>
    </div>
  );
}

export function MedicalHistory({ patient, onSaved }: { patient: MedicalProfile; onSaved: () => void }) {
  const [allergies, setAllergies] = useState((patient.allergies ?? []).join(', '));
  const [chronic, setChronic] = useState(patient.chronicConditions ?? '');
  const [medications, setMedications] = useState(patient.medications ?? '');
  const [contraindications, setContraindications] = useState(patient.contraindications ?? '');
  const [anamnesis, setAnamnesis] = useState(patient.anamnesis ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/patients/${patient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: patient.firstName,
          lastName: patient.lastName,
          middleName: patient.middleName || undefined,
          phone: patient.phone || undefined,
          email: patient.email || undefined,
          gender: patient.gender || undefined,
          birthDate: patient.birthDate ? String(patient.birthDate).slice(0, 10) : undefined,
          tags: patient.tags ?? [],
          notes: patient.notes || undefined,
          source: patient.source || undefined,
          allergies: allergies.split(',').map((item) => item.trim()).filter(Boolean),
          chronicConditions: chronic.trim() || undefined,
          medications: medications.trim() || undefined,
          contraindications: contraindications.trim() || undefined,
          anamnesis: anamnesis.trim() || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ds-card p-5">
      <p className="ds-kicker">Анамнез</p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">Медицинская история</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Аллергии и противопоказания видны на карте до начала приёма.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label>Аллергии, через запятую</Label>
          <Input value={allergies} placeholder="Лидокаин, латекс" onChange={(e) => setAllergies(e.target.value)} />
        </div>
        <div>
          <Label>Постоянные препараты</Label>
          <Input value={medications} placeholder="Варфарин 2,5 мг" onChange={(e) => setMedications(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Хронические заболевания</Label>
          <Textarea value={chronic} placeholder="Сахарный диабет 2 типа, компенсирован" onChange={(e) => setChronic(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Противопоказания</Label>
          <Textarea value={contraindications} placeholder="Не проводить адреналинсодержащую анестезию" onChange={(e) => setContraindications(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Стоматологический анамнез</Label>
          <Textarea value={anamnesis} placeholder="Ранее лечилась у терапевта, ортодонтию не проходила" onChange={(e) => setAnamnesis(e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <Button className="mt-4" disabled={busy} onClick={save}>Сохранить анамнез</Button>
    </section>
  );
}
