'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';

const PURPOSE: Record<string, string> = {
  UNIVERSAL: 'Универсальный',
  THERAPY: 'Терапия',
  SURGERY: 'Хирургия',
  ORTHOPEDICS: 'Ортопедия',
  HYGIENE: 'Гигиена',
  IMAGING: 'Рентген',
};

interface Branch {
  id: string;
  name: string;
  address?: string;
  visitsToday: number;
  cashOpen: boolean;
  _count?: { employees: number };
  cabinets: { id: string; name: string; purpose: string }[];
}

export default function BranchesPage() {
  const { refresh, setBranchId } = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchModal, setBranchModal] = useState(false);
  const [cabinetModal, setCabinetModal] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [cabinetForm, setCabinetForm] = useState({ name: '', number: '', purpose: 'UNIVERSAL' });

  const load = () => api<Branch[]>('/branches/overview').then(setBranches);
  useEffect(() => { load(); }, []);

  const createBranch = async (e: FormEvent) => {
    e.preventDefault();
    const created = await api<{ id: string }>('/branches', { method: 'POST', body: JSON.stringify(branchForm) });
    setBranchModal(false);
    setBranchForm({ name: '', address: '', phone: '' });
    await refresh();
    setBranchId(created.id);
    load();
  };

  const createCabinet = async (e: FormEvent) => {
    e.preventDefault();
    if (!cabinetModal) return;
    await api(`/branches/${cabinetModal}/cabinets`, { method: 'POST', body: JSON.stringify(cabinetForm) });
    setCabinetModal(null);
    load();
  };

  return (
    <Protected>
      <PageHeader
        badge="Сеть"
        title="Филиалы и кабинеты"
        description="Карта пациента общая на всю сеть. Расписание, кресла, касса и склад — у каждого филиала свои."
        action={<Button onClick={() => setBranchModal(true)}>+ Филиал</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardHeader
              title={b.name}
              description={[b.address, `сегодня ${b.visitsToday}`, b.cashOpen ? 'касса открыта' : 'касса закрыта', `врачей ${b._count?.employees ?? 0}`].filter(Boolean).join(' · ')}
              action={
                <Button size="sm" variant="ghost" onClick={() => setCabinetModal(b.id)}>
                  + Кабинет
                </Button>
              }
            />
            <ul className="space-y-2">
              {b.cabinets.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm"
                >
                  <span className="font-medium text-[var(--text)]">{c.name}</span>
                  <Badge>{PURPOSE[c.purpose] ?? c.purpose}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Modal open={branchModal} onClose={() => setBranchModal(false)} title="Новый филиал" description="Добавление филиала в сеть">
        <form onSubmit={createBranch} className="space-y-3">
          <div><Label>Название</Label><Input required value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} /></div>
          <div><Label>Адрес</Label><Input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></div>
          <Button type="submit" className="w-full">Создать</Button>
        </form>
      </Modal>

      <Modal open={!!cabinetModal} onClose={() => setCabinetModal(null)} title="Новый кабинет" description="Кабинет в выбранном филиале">
        <form onSubmit={createCabinet} className="space-y-3">
          <div><Label>Название</Label><Input required value={cabinetForm.name} onChange={(e) => setCabinetForm({ ...cabinetForm, name: e.target.value })} /></div>
          <div><Label>Назначение</Label>
            <Select value={cabinetForm.purpose} onChange={(e) => setCabinetForm({ ...cabinetForm, purpose: e.target.value })}>
              {Object.entries(PURPOSE).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}
