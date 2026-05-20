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

interface Branch {
  id: string;
  name: string;
  address?: string;
  cabinets: { id: string; name: string; purpose: string }[];
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchModal, setBranchModal] = useState(false);
  const [cabinetModal, setCabinetModal] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [cabinetForm, setCabinetForm] = useState({ name: '', number: '', purpose: 'UNIVERSAL' });

  const load = () => api<Branch[]>('/branches').then(setBranches);
  useEffect(() => { load(); }, []);

  const createBranch = async (e: FormEvent) => {
    e.preventDefault();
    await api('/branches', { method: 'POST', body: JSON.stringify(branchForm) });
    setBranchModal(false);
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
        description="Сеть → филиал → кабинет"
        action={<Button onClick={() => setBranchModal(true)}>+ Филиал</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardHeader
              title={b.name}
              description={b.address}
              action={
                <Button variant="ghost" className="!py-1 text-xs" onClick={() => setCabinetModal(b.id)}>
                  + Кабинет
                </Button>
              }
            />
            <ul className="mt-2 space-y-2">
              {b.cabinets.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm"
                >
                  <span className="font-medium text-[var(--text)]">{c.name}</span>
                  <Badge>{c.purpose}</Badge>
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
              {['UNIVERSAL', 'THERAPY', 'SURGERY', 'ORTHOPEDICS', 'HYGIENE'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}
