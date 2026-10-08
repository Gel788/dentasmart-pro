'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Search, UserPlus, ChevronRight, Users, Upload, ChevronLeft } from 'lucide-react';
import { Protected } from '@/components/protected';
import { PatientAvatar } from '@/components/patient-avatar';
import { PatientForm } from '@/components/patient-form';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { patientFormToPayload } from '@/lib/patient';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  tags: string[];
}

const PAGE_SIZE = 20;

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(sep);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? '';
    });
    return row;
  });
}

export default function PatientsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Patient[]; total: number; page: number } | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) q.set('search', debouncedSearch);
    api<{ items: Patient[]; total: number; page: number }>(`/patients?${q}`).then(setData).catch(console.error);
  }, [debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const onCreate = async (payload: ReturnType<typeof patientFormToPayload>) => {
    const created = await api<{ id: string }>('/patients', { method: 'POST', body: JSON.stringify(payload) });
    setModal(false);
    router.push(`/patients/${created.id}`);
  };

  const onImport = async () => {
    setImporting(true);
    try {
      const rows = parseCsv(csvText).map((r) => ({
        firstName: r.firstname || r['имя'] || r.first_name || '',
        lastName: r.lastname || r['фамилия'] || r.last_name || '',
        phone: r.phone || r['телефон'] || r.tel || undefined,
        email: r.email || undefined,
        birthDate: r.birthdate || r['дата рождения'] || undefined,
      }));
      const res = await api<{ created: number }>('/patients/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setImportModal(false);
      setCsvText('');
      alert(`Импортировано: ${res.created}`);
      load();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Protected>
      <PageHeader
        badge="База"
        title="Пациенты"
        description={`В базе ${data?.total ?? '…'} активных пациентов`}
        action={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                placeholder="Поиск по имени или телефону…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 pl-9"
              />
            </div>
            <Button variant="ghost" onClick={() => setImportModal(true)}>
              <Upload size={16} />
              Импорт CSV
            </Button>
            <Button onClick={() => setModal(true)}>
              <UserPlus size={16} />
              Новый пациент
            </Button>
          </>
        }
      />

      <div className="ds-card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3.5">Пациент</th>
              <th className="px-5 py-3.5">Телефон</th>
              <th className="px-5 py-3.5">Теги</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="ds-table-row group">
                <td className="px-5 py-4">
                  <Link href={`/patients/${p.id}`} className="flex items-center gap-3">
                    <PatientAvatar firstName={p.firstName} lastName={p.lastName} size="sm" />
                    <span className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                      {p.lastName} {p.firstName}
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-4 text-[var(--muted)]">{p.phone ?? '—'}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {p.tags.length
                      ? p.tags.map((t) => <Badge key={t} variant="accent">{t}</Badge>)
                      : <span className="text-[var(--muted)]">—</span>}
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/patients/${p.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                  >
                    Карточка
                    <ChevronRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.items.length && (
              <tr>
                <td colSpan={4} className="px-5 py-16">
                  <EmptyPatients search={debouncedSearch} onCreate={() => setModal(true)} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="ds-card mt-4 flex items-center justify-between px-5 py-3">
          <p className="text-sm text-[var(--muted)]">
            Страница <span className="tabular-nums text-[var(--text-secondary)]">{page}</span> из{' '}
            <span className="tabular-nums text-[var(--text-secondary)]">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} />
              Назад
            </Button>
            <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Вперёд
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Новый пациент" description="После сохранения откроется карточка" size="xl">
        <PatientForm submitLabel="Создать и открыть карточку" onCancel={() => setModal(false)} onSubmit={onCreate} />
      </Modal>

      <Modal open={importModal} onClose={() => setImportModal(false)} title="Импорт CSV" description="Колонки: lastName;firstName;phone (или фамилия;имя;телефон)" size="lg">
        <div className="space-y-3">
          <div>
            <Label>Файл или текст</Label>
            <Input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setCsvText(String(reader.result));
                reader.readAsText(f);
              }}
            />
          </div>
          <textarea
            className="ds-input min-h-[160px] w-full font-mono text-xs"
            placeholder="lastName;firstName;phone&#10;Иванов;Иван;+79001234567"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Button className="w-full" onClick={onImport} disabled={importing || !csvText.trim()}>
            {importing ? 'Импорт…' : 'Импортировать'}
          </Button>
        </div>
      </Modal>
    </Protected>
  );
}

function EmptyPatients({ search, onCreate }: { search: string; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Users className="mb-3 text-[var(--muted)] opacity-40" size={40} />
      <p className="font-medium text-[var(--text)]">Пациенты не найдены</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {search ? 'Попробуйте другой запрос' : 'Добавьте первого пациента в базу'}
      </p>
      {!search && (
        <Button className="mt-4" onClick={onCreate}>
          <UserPlus size={16} />
          Новый пациент
        </Button>
      )}
    </div>
  );
}
