'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';

type Cycle = {
  id: string;
  startedAt: string;
  autoclave: string;
  loadNote: string;
  result: 'PASS' | 'FAIL';
  operatorName?: string | null;
  branch?: { name: string };
};

export default function SterilizationPage() {
  const { branchId, branches } = useBranch();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [autoclave, setAutoclave] = useState('Автоклав 1');
  const [loadNote, setLoadNote] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [operatorName, setOperatorName] = useState('');
  const [error, setError] = useState('');

  const load = () => api<Cycle[]>('/sterilization/cycles').then(setCycles).catch(() => setCycles([]));

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api('/sterilization/cycles', {
        method: 'POST',
        body: JSON.stringify({ branchId, autoclave, loadNote, result, operatorName: operatorName || undefined }),
      });
      setLoadNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не записалось');
    }
  };

  return (
    <Protected>
      <PageHeader
        badge="Медицина"
        title="Журнал стерилизации"
        description="Цикл, загрузка инструментов и результат контроля"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="xl:sticky xl:top-6">
          <CardHeader title="Новый цикл" description={branches.find((b) => b.id === branchId)?.name} />
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Автоклав</Label>
              <Input value={autoclave} onChange={(e) => setAutoclave(e.target.value)} required />
            </div>
            <div>
              <Label>Загрузка</Label>
              <Input
                value={loadNote}
                placeholder="Набор терапевта, зеркала, щипцы"
                onChange={(e) => setLoadNote(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Контроль</Label>
              <Select value={result} onChange={(e) => setResult(e.target.value as 'PASS' | 'FAIL')} aria-label="Результат контроля">
                <option value="PASS">Годен</option>
                <option value="FAIL">Не годен</option>
              </Select>
            </div>
            <div>
              <Label>Оператор</Label>
              <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full">Записать цикл</Button>
          </form>
        </Card>
        <Card padding={false} className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 pt-4">
            <CardHeader title="Циклы" description="Последние записи журнала" />
          </div>
          <div>
            {cycles.length ? cycles.map((cycle) => (
              <div key={cycle.id} className="ds-table-row px-5 py-4 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text)]">{cycle.autoclave}</p>
                  <Badge variant={cycle.result === 'PASS' ? 'success' : 'danger'}>
                    {cycle.result === 'PASS' ? 'Годен' : 'Не годен'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{cycle.loadNote}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {new Date(cycle.startedAt).toLocaleString('ru-RU')}
                  {cycle.branch?.name ? ` · ${cycle.branch.name}` : ''}
                  {cycle.operatorName ? ` · ${cycle.operatorName}` : ''}
                </p>
              </div>
            )) : (
              <div className="p-5">
                <EmptyState icon={ShieldCheck} title="Журнал пуст" description="Запишите первый цикл стерилизации" />
              </div>
            )}
          </div>
        </Card>
      </div>
    </Protected>
  );
}
