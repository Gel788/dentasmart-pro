'use client';

import { FormEvent, useState } from 'react';
import { User, Phone, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import {
  emptyPatientForm,
  GENDER_LABELS,
  patientFormToPayload,
  type PatientFormValues,
} from '@/lib/patient';

function FieldGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon size={16} />
        </span>
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PatientForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PatientFormValues;
  submitLabel: string;
  onSubmit: (payload: ReturnType<typeof patientFormToPayload>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<PatientFormValues>(initial ?? emptyPatientForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<PatientFormValues>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Укажите имя и фамилию');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(patientFormToPayload(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <FieldGroup icon={User} title="Личные данные">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Фамилия *</Label>
            <Input
              required
              autoFocus
              placeholder="Иванов"
              value={form.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
            />
          </div>
          <div>
            <Label>Имя *</Label>
            <Input
              required
              placeholder="Иван"
              value={form.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Отчество</Label>
            <Input
              placeholder="Иванович"
              value={form.middleName}
              onChange={(e) => set({ middleName: e.target.value })}
            />
          </div>
          <div>
            <Label>Дата рождения</Label>
            <Input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
          </div>
          <div>
            <Label>Пол</Label>
            <Select value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">Не указан</option>
              {Object.entries(GENDER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup icon={Phone} title="Контакты">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Телефон</Label>
            <Input
              type="tel"
              placeholder="+7 (999) 000-00-00"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="patient@example.com"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup icon={Tag} title="Метки и заметки">
        <div>
          <Label>Теги</Label>
          <Input
            placeholder="VIP, имплантация, ДМС — через запятую"
            value={form.tags}
            onChange={(e) => set({ tags: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">Помогают фильтровать и сегментировать базу</p>
        </div>
        <div>
          <Label>Заметки</Label>
          <Textarea
            placeholder="Аллергии, предпочтения, важные детали для врача…"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
      </FieldGroup>

      {error && (
        <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
        )}
        <Button type="submit" className="min-w-[160px] flex-1 sm:flex-none" disabled={saving}>
          {saving ? 'Сохранение…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
