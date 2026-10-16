'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { maskPhone, phoneDigits, samePhone } from '@/lib/phone';

export type PatientSeed = {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  gender?: string;
  source?: string;
  notes?: string;
  anamnesis?: string;
  allergies?: string;
  dmsInsurer?: string;
  dmsNumber?: string;
};

type Existing = { id: string; firstName: string; lastName: string; phone: string | null };

const SOURCES = [
  ['WALK_IN', 'Стойка'],
  ['CALL', 'Звонок'],
  ['SITE', 'Сайт'],
  ['REFERRAL', 'Рекомендация'],
  ['AGGREGATOR', 'Агрегатор'],
];

const empty = (): Required<PatientSeed> => ({
  lastName: '',
  firstName: '',
  middleName: '',
  phone: '',
  email: '',
  birthDate: '',
  gender: '',
  source: 'WALK_IN',
  notes: '',
  anamnesis: '',
  allergies: '',
  dmsInsurer: '',
  dmsNumber: '',
});

export function PatientForm({
  open,
  patientId,
  seed,
  onClose,
  onSaved,
  onArchived,
}: {
  open: boolean;
  patientId?: string | null;
  seed?: PatientSeed;
  onClose: () => void;
  onSaved: (patient: { id: string; firstName: string; lastName: string }) => void;
  onArchived?: () => void;
}) {
  const [form, setForm] = useState(empty);
  const [consent, setConsent] = useState(false);
  const [duplicate, setDuplicate] = useState<Existing | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const editing = Boolean(patientId);

  useEffect(() => {
    if (!open) return;
    const incoming = seedRef.current;
    const base = { ...empty(), ...incoming, phone: incoming?.phone ? maskPhone(incoming.phone) : '' };
    setForm(base);
    setConsent(editing);
    setDuplicate(null);
    setError('');
    if (!patientId) return;
    let live = true;
    api<PatientRecord>(`/patients/${patientId}`).then((row) => {
      if (!live) return;
      const policy = row.insurancePolicies?.[0];
      setForm({
        lastName: row.lastName ?? '',
        firstName: row.firstName ?? '',
        middleName: row.middleName ?? '',
        phone: row.phone ? maskPhone(row.phone) : '',
        email: row.email ?? '',
        birthDate: row.birthDate ? row.birthDate.slice(0, 10) : '',
        gender: row.gender ?? '',
        source: row.source || 'WALK_IN',
        notes: row.notes ?? '',
        anamnesis: row.anamnesis ?? '',
        allergies: (row.allergies ?? []).join(', '),
        dmsInsurer: row.dmsInsurer ?? policy?.insurer?.name ?? '',
        dmsNumber: row.dmsNumber ?? policy?.number ?? '',
      });
      setConsent(true);
    }).catch((err: Error) => live && setError(err.message));
    return () => { live = false; };
  }, [open, patientId, editing]);

  useEffect(() => {
    if (!open) return;
    const digits = phoneDigits(form.phone);
    if (digits.length < 10) { setDuplicate(null); return; }
    const handle = setTimeout(() => {
      api<{ items: Existing[] }>('/patients?pageSize=500')
        .then((res) => {
          const hit = res.items.find((row) => row.id !== patientId && samePhone(row.phone, digits));
          setDuplicate(hit ?? null);
        })
        .catch(() => setDuplicate(null));
    }, 220);
    return () => clearTimeout(handle);
  }, [form.phone, open, patientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (key: keyof ReturnType<typeof empty>, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const digits = phoneDigits(form.phone);
    if (digits && digits.length < 11) { setError('Введите телефон целиком'); return; }
    if (duplicate) { setError(`Такой телефон уже у ${duplicate.lastName} ${duplicate.firstName}`); return; }
    if (!consent) { setError('Нужно согласие на обработку персональных данных'); return; }
    setPending(true);
    const body = {
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim() || undefined,
      phone: digits ? maskPhone(digits) : undefined,
      email: form.email.trim() || undefined,
      birthDate: form.birthDate || undefined,
      gender: form.gender || undefined,
      source: form.source,
      notes: form.notes.trim() || undefined,
      anamnesis: form.anamnesis.trim() || undefined,
      allergies: form.allergies.split(',').map((item) => item.trim()).filter(Boolean),
      consentPd: true,
      dmsInsurer: form.dmsInsurer.trim() || undefined,
      dmsNumber: form.dmsNumber.trim() || undefined,
    };
    try {
      const saved = editing
        ? await api<{ id: string; firstName: string; lastName: string }>(`/patients/${patientId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<{ id: string; firstName: string; lastName: string }>('/patients', { method: 'POST', body: JSON.stringify(body) });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Карта не сохранилась');
    } finally {
      setPending(false);
    }
  };

  const archive = async () => {
    if (!patientId) return;
    setPending(true);
    setError('');
    try {
      await api(`/patients/${patientId}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
      onArchived?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать в архив');
      setPending(false);
    }
  };

  return (
    <div className="sd-sheet-back" onMouseDown={onClose}>
      <form className="sd-sheet" role="dialog" aria-labelledby="patient-form-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="sd-sheet-head">
          <div>
            <p className="sd-kicker">Карта пациента</p>
            <h2 id="patient-form-title">{editing ? 'Изменить пациента' : 'Новый пациент'}</h2>
          </div>
          <button className="sd-btn-ghost" type="button" onClick={onClose}>Закрыть</button>
        </div>
        <div className="sd-form-grid">
          <label>Фамилия<input className="sd-input" required autoFocus value={form.lastName} onChange={(event) => set('lastName', event.target.value)} /></label>
          <label>Имя<input className="sd-input" required value={form.firstName} onChange={(event) => set('firstName', event.target.value)} /></label>
          <label>Отчество<input className="sd-input" value={form.middleName} onChange={(event) => set('middleName', event.target.value)} /></label>
          <label>Пол
            <select className="sd-input" value={form.gender} onChange={(event) => set('gender', event.target.value)}>
              <option value="">Не указан</option>
              <option value="FEMALE">Женский</option>
              <option value="MALE">Мужской</option>
            </select>
          </label>
          <label>Телефон
            <input className="sd-input" inputMode="tel" placeholder="+7 (900) 000-00-00" value={form.phone} onChange={(event) => set('phone', maskPhone(event.target.value))} />
          </label>
          <label>Дата рождения<input className="sd-input" type="date" value={form.birthDate} onChange={(event) => set('birthDate', event.target.value)} /></label>
          <label>Email<input className="sd-input" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></label>
          <label>Источник
            <select className="sd-input" value={form.source} onChange={(event) => set('source', event.target.value)}>
              {SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>ДМС, страховая<input className="sd-input" placeholder="СОГАЗ" value={form.dmsInsurer} onChange={(event) => set('dmsInsurer', event.target.value)} /></label>
          <label>Номер полиса<input className="sd-input" value={form.dmsNumber} onChange={(event) => set('dmsNumber', event.target.value)} /></label>
        </div>
        <label className="sd-field">Аллергии
          <input className="sd-input" placeholder="Лидокаин, латекс" value={form.allergies} onChange={(event) => set('allergies', event.target.value)} />
        </label>
        <label className="sd-field">Анамнез
          <textarea className="sd-input sd-area" value={form.anamnesis} onChange={(event) => set('anamnesis', event.target.value)} />
        </label>
        <label className="sd-field">Комментарий
          <textarea className="sd-input sd-area" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </label>
        <label className="sd-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Согласие на обработку персональных данных, 152-ФЗ</span>
        </label>
        {duplicate && (
          <p className="sd-chip warning">Уже есть {duplicate.lastName} {duplicate.firstName}. Откройте эту карту, вторая не нужна.</p>
        )}
        {error && <p className="sd-chip danger">{error}</p>}
        <div className="sd-sheet-actions">
          {editing && <button className="sd-btn-ghost" type="button" disabled={pending} onClick={() => void archive()}>В архив</button>}
          <button className="sd-btn" type="submit" disabled={pending || Boolean(duplicate)}>{pending ? 'Сохраняем…' : editing ? 'Сохранить' : 'Сохранить и открыть'}</button>
        </div>
      </form>
    </div>
  );
}

type PatientRecord = PatientSeed & {
  id: string;
  lastName: string;
  firstName: string;
  birthDate?: string | null;
  gender?: string | null;
  allergies?: string[];
  insurancePolicies?: { number: string; insurer?: { name: string } }[];
};
