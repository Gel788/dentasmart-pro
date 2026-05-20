'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  FileImage,
  Receipt,
  Stethoscope,
  Wallet,
  Users,
} from 'lucide-react';
import { Protected } from '@/components/protected';
import { PatientProfileHero } from '@/components/patient-profile-hero';
import { PatientForm } from '@/components/patient-form';
import { ToothChart, type ToothRecord } from '@/components/tooth-chart';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { TabBar } from '@/components/ui/tab-bar';
import { Badge } from '@/components/ui/badge';
import { DicomViewer } from '@/components/dicom-viewer';
import {
  SectionCard,
  TimelineItem,
  InvoiceCard,
  PlanCard,
  EmptyBlock,
} from '@/components/patient-detail-sections';
import { api, uploadFile } from '@/lib/api';
import {
  APPOINTMENT_STATUS,
  CONSENT_STATUS,
  CONSENT_TYPE,
  formatDate,
  formatMoney,
  INVOICE_STATUS,
  INSTALLMENT_STATUS,
  label,
  PLAN_STATUS,
  TOOTH_CONDITIONS,
} from '@/lib/format';
import { patientFormToPayload, patientToForm } from '@/lib/patient';

type Tab = 'overview' | 'teeth' | 'plans' | 'finance' | 'documents';

type PatientFull = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  tags?: string[];
  notes?: string | null;
  birthDate?: string | null;
  toothRecords: ToothRecord[];
  treatmentPlans: {
    id: string;
    title: string;
    status: string;
    totalPrice: string;
    items: { title: string; isCompleted?: boolean }[];
  }[];
  appointments: {
    id: string;
    startsAt: string;
    status: string;
    service?: { name: string };
    doctor?: { firstName: string; lastName: string };
  }[];
  invoices: { id: string; number: string; totalAmount: string; paidAmount: string; status: string }[];
  imagingStudies: { id: string; title?: string; type: string; fileUrl: string }[];
  consents?: { id: string; type: string; status: string; signedAt?: string | null }[];
  deposit?: { balance: string } | null;
  familyMembers?: { familyGroup: { name: string } }[];
  installmentPlans?: {
    id: string;
    totalAmount: string;
    status: string;
    schedule: { id: string; amount: string; status: string }[];
  }[];
  summary?: {
    balanceDue: number;
    depositBalance: number;
    nextAppointment?: { id: string; startsAt: string; service?: { name: string } } | null;
    activePlanId?: string | null;
    activePlanTitle?: string | null;
  };
};

const INVOICE_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'default',
  ISSUED: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
};

const PLAN_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning'> = {
  DRAFT: 'default',
  PROPOSED: 'default',
  ACCEPTED: 'accent',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'warning',
};

function PatientSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />
      <div className="h-56 rounded-2xl bg-[var(--surface-muted)]" />
      <div className="h-11 w-full max-w-xl rounded-xl bg-[var(--surface-muted)]" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-2xl bg-[var(--surface-muted)] lg:col-span-2" />
        <div className="h-80 rounded-2xl bg-[var(--surface-muted)]" />
      </div>
    </div>
  );
}

export default function PatientCardPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [patient, setPatient] = useState<PatientFull | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | undefined>();
  const [toothCondition, setToothCondition] = useState('CARIES');
  const [toothDiagnosis, setToothDiagnosis] = useState('');
  const [imgTitle, setImgTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewImg, setViewImg] = useState<{ fileUrl: string; type: string; title?: string } | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [consentType, setConsentType] = useState('MEDICAL_TREATMENT');

  const load = useCallback(() => {
    api<PatientFull>(`/patients/${id}/full`).then(setPatient).catch(console.error);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTooth = async () => {
    if (!selectedTooth) return;
    await api(`/clinical/patients/${id}/teeth`, {
      method: 'POST',
      body: JSON.stringify({
        toothNum: selectedTooth,
        formula: 'ADULT',
        condition: toothCondition,
        diagnosis: toothDiagnosis,
      }),
    });
    load();
  };

  const uploadImaging = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file);
      await api(`/clinical/patients/${id}/imaging`, {
        method: 'POST',
        body: JSON.stringify({ type: 'PHOTO', fileUrl: url, title: imgTitle || file.name }),
      });
      setImgTitle('');
      load();
    } finally {
      setUploading(false);
    }
  };

  const onUpdatePatient = async (payload: ReturnType<typeof patientFormToPayload>) => {
    await api(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    setEditOpen(false);
    load();
  };

  const tabs = [
    { id: 'overview' as Tab, label: 'Обзор' },
    { id: 'teeth' as Tab, label: 'Зубы' },
    { id: 'plans' as Tab, label: 'Планы' },
    { id: 'finance' as Tab, label: 'Финансы' },
    { id: 'documents' as Tab, label: 'Документы' },
  ];

  if (!patient) {
    return (
      <Protected>
        <PatientSkeleton />
      </Protected>
    );
  }

  const openInvoices = patient.invoices?.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED').length ?? 0;

  return (
    <Protected>
      <Link
        href="/patients"
        className="mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--accent)]"
      >
        <ArrowLeft size={16} />
        Все пациенты
      </Link>

      <PatientProfileHero
        patient={patient}
        stats={{
          visits: patient.appointments?.length ?? 0,
          plans: patient.treatmentPlans?.length ?? 0,
          openInvoices,
        }}
        summary={patient.summary}
        onEdit={() => setEditOpen(true)}
      />

      <div className="mt-8 overflow-x-auto">
        <TabBar tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SectionCard
              title="История визитов"
              description="Хронология приёмов"
              action={
                <Link href={`/schedule?patientId=${id}`}>
                  <Button variant="ghost" size="sm">
                    <Calendar size={14} />
                    Записать
                  </Button>
                </Link>
              }
            >
              {patient.appointments?.length ? (
                <div className="pl-1">
                  {patient.appointments.map((a) => (
                    <TimelineItem
                      key={a.id}
                      time={formatDate(a.startsAt)}
                      title={a.service?.name ?? 'Приём'}
                      subtitle={a.doctor ? `Врач: ${a.doctor.lastName} ${a.doctor.firstName}` : undefined}
                      badge={
                        <Badge variant={a.status === 'COMPLETED' ? 'success' : a.status === 'CANCELLED' ? 'danger' : 'accent'}>
                          {label(APPOINTMENT_STATUS, a.status)}
                        </Badge>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyBlock
                  icon={Calendar}
                  title="Визитов пока нет"
                  action={
                    <Link href={`/schedule?patientId=${id}`}>
                      <Button size="sm">Создать запись</Button>
                    </Link>
                  }
                />
              )}
            </SectionCard>

            {patient.treatmentPlans?.length > 0 && (
              <SectionCard title="Планы лечения" description="Краткий список">
                <div className="grid gap-4 sm:grid-cols-2">
                  {patient.treatmentPlans.slice(0, 2).map((plan) => (
                    <PlanCard
                      key={plan.id}
                      id={plan.id}
                      title={plan.title}
                      statusLabel={label(PLAN_STATUS, plan.status)}
                      statusVariant={PLAN_VARIANT[plan.status] ?? 'default'}
                      totalPrice={plan.totalPrice}
                      itemsCount={plan.items?.length ?? 0}
                      completedCount={plan.items?.filter((i) => i.isCompleted).length}
                    />
                  ))}
                </div>
                {patient.treatmentPlans.length > 2 && (
                  <Button variant="ghost" className="mt-4 w-full" onClick={() => setTab('plans')}>
                    Все планы ({patient.treatmentPlans.length})
                  </Button>
                )}
              </SectionCard>
            )}
          </div>

          <div className="space-y-6">
            <SectionCard title="Финансы" description="Баланс и счета">
              <div className="space-y-4">
                <div className="rounded-xl bg-[var(--surface-muted)]/50 p-4">
                  <p className="text-xs font-medium uppercase text-[var(--muted)]">Долг</p>
                  <p className={`text-2xl font-bold ${(patient.summary?.balanceDue ?? 0) > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {formatMoney(patient.summary?.balanceDue ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--accent-soft)]/40 p-4">
                  <p className="text-xs font-medium uppercase text-[var(--muted)]">Депозит</p>
                  <p className="text-2xl font-bold text-[var(--accent)]">
                    {formatMoney(patient.deposit?.balance ?? patient.summary?.depositBalance ?? 0)}
                  </p>
                </div>
                <Link href={`/finance?patientId=${id}`}>
                  <Button className="w-full">
                    <Wallet size={16} />
                    Касса и оплаты
                  </Button>
                </Link>
              </div>
            </SectionCard>

            <SectionCard title="Снимки" description="Фото и рентген">
              <div className="mb-3 flex gap-2">
                <Input
                  placeholder="Подпись"
                  value={imgTitle}
                  onChange={(e) => setImgTitle(e.target.value)}
                  className="flex-1 text-sm"
                />
                <label className="inline-flex cursor-pointer items-center rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]">
                  {uploading ? '…' : '+ Файл'}
                  <input
                    type="file"
                    accept="image/*,.dcm"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadImaging(e.target.files[0])}
                  />
                </label>
              </div>
              {patient.imagingStudies?.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {patient.imagingStudies.slice(0, 4).map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setViewImg(img)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] p-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30"
                    >
                      <FileImage size={24} className="text-[var(--accent)]" />
                      <span className="line-clamp-2 text-xs font-medium">{img.title ?? img.type}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-[var(--muted)]">Снимков нет</p>
              )}
              {viewImg && (
                <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
                  <div className="mb-2 flex justify-between">
                    <p className="text-sm font-medium">{viewImg.title ?? 'Просмотр'}</p>
                    <Button variant="ghost" size="sm" onClick={() => setViewImg(null)}>
                      Закрыть
                    </Button>
                  </div>
                  <DicomViewer fileUrl={viewImg.fileUrl} type={viewImg.type} title={viewImg.title} />
                </div>
              )}
            </SectionCard>

            {patient.familyMembers && patient.familyMembers.length > 0 && (
              <SectionCard title="Семья" description="Связанные пациенты">
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Users size={18} className="text-[var(--accent)]" />
                  {patient.familyMembers.map((m) => m.familyGroup.name).join(', ')}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {tab === 'teeth' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SectionCard title="Зубная формула" description="Нажмите на зуб">
            <ToothChart records={patient.toothRecords ?? []} selected={selectedTooth} onSelect={setSelectedTooth} />
          </SectionCard>
          {selectedTooth ? (
            <SectionCard title={`Зуб №${selectedTooth}`}>
              <div className="space-y-4">
                <div>
                  <Label>Состояние</Label>
                  <Select value={toothCondition} onChange={(e) => setToothCondition(e.target.value)}>
                    {Object.entries(TOOTH_CONDITIONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Диагноз</Label>
                  <Input value={toothDiagnosis} onChange={(e) => setToothDiagnosis(e.target.value)} />
                </div>
                <Button onClick={saveTooth} className="w-full">
                  Сохранить
                </Button>
              </div>
            </SectionCard>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
              Выберите зуб на схеме
            </div>
          )}
        </div>
      )}

      {tab === 'plans' && (
        <div className="mt-6">
          {patient.treatmentPlans?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {patient.treatmentPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  id={plan.id}
                  title={plan.title}
                  statusLabel={label(PLAN_STATUS, plan.status)}
                  statusVariant={PLAN_VARIANT[plan.status] ?? 'default'}
                  totalPrice={plan.totalPrice}
                  itemsCount={plan.items?.length ?? 0}
                  completedCount={plan.items?.filter((i) => i.isCompleted).length}
                />
              ))}
            </div>
          ) : (
            <EmptyBlock
              icon={Stethoscope}
              title="Планов лечения пока нет"
              action={
                <Link href="/clinical">
                  <Button size="sm">Создать план</Button>
                </Link>
              }
            />
          )}
        </div>
      )}

      {tab === 'finance' && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm text-[var(--muted)]">Долг</p>
              <p className="mt-1 text-2xl font-bold text-[var(--danger)]">{formatMoney(patient.summary?.balanceDue ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm text-[var(--muted)]">Депозит</p>
              <p className="mt-1 text-2xl font-bold text-[var(--accent)]">{formatMoney(patient.deposit?.balance ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm text-[var(--muted)]">Счетов</p>
              <p className="mt-1 text-2xl font-bold">{patient.invoices?.length ?? 0}</p>
            </div>
          </div>

          <SectionCard title="Счета" description="Оплаты и остатки">
            {patient.invoices?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {patient.invoices.map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    number={inv.number}
                    total={inv.totalAmount}
                    paid={inv.paidAmount}
                    statusLabel={label(INVOICE_STATUS, inv.status)}
                    statusVariant={INVOICE_VARIANT[inv.status] ?? 'default'}
                    payHref={
                      inv.status !== 'PAID'
                        ? `/finance?patientId=${id}&invoiceId=${inv.id}`
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyBlock icon={Receipt} title="Счетов пока нет" />
            )}
          </SectionCard>

          {!!patient.installmentPlans?.length && (
            <SectionCard title="Рассрочки">
              <div className="space-y-4">
                {patient.installmentPlans.map((pl) => (
                  <div key={pl.id} className="rounded-xl border border-[var(--border)] p-4">
                    <p className="font-semibold">
                      {formatMoney(pl.totalAmount)} · {label(INSTALLMENT_STATUS, pl.status)}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {pl.schedule.map((line) => (
                        <li key={line.id} className="flex items-center justify-between text-sm">
                          <span>{formatMoney(line.amount)}</span>
                          <Badge variant={line.status === 'PAID' ? 'success' : 'warning'}>{line.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SectionCard title="Согласия" description="ПДн, лечение, маркетинг">
            <ul className="mb-4 space-y-2">
              {patient.consents?.length ? (
                patient.consents.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3"
                  >
                    <span className="text-sm font-medium">{label(CONSENT_TYPE, c.type)}</span>
                    <Badge variant={c.status === 'SIGNED' ? 'success' : 'default'}>
                      {label(CONSENT_STATUS, c.status)}
                    </Badge>
                  </li>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-[var(--muted)]">Согласий пока нет</p>
              )}
            </ul>
            <div className="flex gap-2">
              <Select value={consentType} onChange={(e) => setConsentType(e.target.value)} className="flex-1">
                {Object.entries(CONSENT_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Button
                onClick={async () => {
                  await api('/clinical/consents', {
                    method: 'POST',
                    body: JSON.stringify({ patientId: id, type: consentType }),
                  });
                  load();
                }}
              >
                Подписать
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Депозит" description="Предоплата на балансе">
            <p className="text-4xl font-bold tabular-nums text-[var(--accent)]">
              {formatMoney(patient.deposit?.balance ?? 0)}
            </p>
            <div className="mt-6 flex gap-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={async () => {
                  await api('/finance/deposits/top-up', {
                    method: 'POST',
                    body: JSON.stringify({ patientId: id, amount: +depositAmount }),
                  });
                  setDepositAmount('');
                  load();
                }}
              >
                Пополнить
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать пациента"
        description="Изменения сохраняются в медкарту"
        size="xl"
      >
        <PatientForm
          initial={patientToForm(patient)}
          submitLabel="Сохранить"
          onCancel={() => setEditOpen(false)}
          onSubmit={onUpdatePatient}
        />
      </Modal>
    </Protected>
  );
}
