'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';

type Policy = { id: string; number: string; smoName: string; region?: string | null; validTo?: string | null };
type Line = { id: string; code: string; title: string; toothNum?: number | null; quantity: number; tariff: string };
type CaseRow = {
  id: string;
  status: string;
  icd10?: string | null;
  result?: string | null;
  exportStatus: string;
  fundAmount: number;
  sent: boolean;
  branch?: { name: string };
  lines: Line[];
};

export function OmsPanel({ patientId }: { patientId: string }) {
  const { branchId } = useBranch();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [number, setNumber] = useState('');
  const [smoName, setSmoName] = useState('');
  const [region, setRegion] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [toothNum, setToothNum] = useState('');
  const [tariff, setTariff] = useState('');
  const [icd10, setIcd10] = useState('K02.1');
  const [tariffs, setTariffs] = useState<{ code: string; title: string; tariff: number }[]>([]);
  const [tariffNote, setTariffNote] = useState('');

  const load = useCallback(() => {
    api<{ policy: Policy | null; cases: CaseRow[]; notice: string }>(`/clinical/patients/${patientId}/oms`)
      .then((res) => {
        setPolicy(res.policy);
        setCases(res.cases);
        setNotice(res.notice);
        if (res.policy) {
          setNumber(res.policy.number);
          setSmoName(res.policy.smoName);
          setRegion(res.policy.region ?? '');
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [patientId]);

  useEffect(() => {
    load();
    api<{ items: { code: string; title: string; tariff: number }[]; notice: string }>('/clinical/oms/tariffs')
      .then((res) => {
        setTariffs(res.items);
        setTariffNote(res.notice);
      })
      .catch(() => setTariffNote(''));
  }, [load]);

  const openCase = cases.find((row) => row.status === 'OPEN');

  const savePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api(`/clinical/patients/${patientId}/oms/policy`, {
        method: 'POST',
        body: JSON.stringify({ number, smoName, region: region || undefined }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Полис не сохранился');
    }
  };

  const startCase = async () => {
    setError('');
    try {
      await api(`/clinical/patients/${patientId}/oms/cases`, {
        method: 'POST',
        body: JSON.stringify({ branchId }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Случай не открылся');
    }
  };

  const addLine = async (event: FormEvent) => {
    event.preventDefault();
    if (!openCase) return;
    setError('');
    try {
      await api(`/clinical/oms/cases/${openCase.id}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          code,
          title,
          toothNum: toothNum ? Number(toothNum) : undefined,
          tariff: tariff ? Number(tariff) : 0,
        }),
      });
      setCode('');
      setTitle('');
      setToothNum('');
      setTariff('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Услуга не добавилась');
    }
  };

  const closeCase = async () => {
    if (!openCase) return;
    setError('');
    try {
      await api(`/clinical/oms/cases/${openCase.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ icd10, result: 'TREATMENT' }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Случай не закрылся');
    }
  };

  return (
    <div className="space-y-5">
      <header className="border-b border-[var(--border)] pb-4">
        <p className="ds-kicker">ОМС</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">Полис и случай лечения</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {notice || 'Полис и случай лечения. Оплата фонда в кассу не проводится.'}
        </p>
      </header>

      {error && <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}

      <section className="ds-card p-5">
        <p className="ds-kicker mb-4">Полис</p>
        <form onSubmit={savePolicy} className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Полис</Label>
            <Input required aria-label="Номер полиса ОМС" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="16 цифр" />
          </div>
          <div>
            <Label>Страховая</Label>
            <Input required aria-label="Страховая ОМС" value={smoName} onChange={(e) => setSmoName(e.target.value)} />
          </div>
          <div>
            <Label>Регион</Label>
            <Input aria-label="Регион полиса" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <Button type="submit" className="sm:col-span-3 sm:w-fit">Сохранить полис</Button>
        </form>
      </section>

      {policy && !openCase && (
        <Button variant="ghost" onClick={startCase}>Открыть случай в текущем филиале</Button>
      )}

      {openCase && (
        <section className="ds-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <p className="ds-kicker">Открытый случай</p>
              <p className="mt-1 font-semibold text-[var(--text)]">{openCase.branch?.name}</p>
            </div>
            <p className="text-xs text-[var(--muted)]">
              К оплате фондом {openCase.fundAmount.toLocaleString('ru-RU')} ₽ · в ТФОМС не отправлен
            </p>
          </div>
          <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
            {openCase.lines.map((line) => (
              <li key={line.id} className="py-2 text-[var(--text-secondary)]">
                {line.code} · {line.title}{line.toothNum ? ` · зуб ${line.toothNum}` : ''} · {Number(line.tariff).toLocaleString('ru-RU')} ₽
              </li>
            ))}
            {!openCase.lines.length && (
              <li className="py-3 text-[var(--muted)]">Услуг пока нет</li>
            )}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">{tariffNote}</p>
          <form onSubmit={addLine} className="mt-4 grid gap-2 sm:grid-cols-4">
            <Select
              aria-label="Услуга из номенклатуры"
              className="sm:col-span-4"
              value=""
              onChange={(e) => {
                const item = tariffs.find((row) => row.code === e.target.value);
                if (!item) return;
                setCode(item.code);
                setTitle(item.title);
                setTariff(String(item.tariff));
              }}
            >
              <option value="">Из номенклатуры</option>
              {tariffs.map((item) => (
                <option key={item.code} value={item.code}>{item.code} · {item.title} · {item.tariff} ₽</option>
              ))}
            </Select>
            <Input required aria-label="Код услуги ОМС" placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} />
            <Input required aria-label="Название услуги ОМС" placeholder="Услуга" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input aria-label="Зуб" placeholder="Зуб" value={toothNum} onChange={(e) => setToothNum(e.target.value)} />
            <Input aria-label="Тариф" type="number" min={0} placeholder="Тариф" value={tariff} onChange={(e) => setTariff(e.target.value)} />
            <Button type="submit" variant="ghost" className="sm:col-span-4 sm:w-fit">Добавить услугу</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
            <div>
              <Label>МКБ-10</Label>
              <Input aria-label="Диагноз МКБ-10" value={icd10} onChange={(e) => setIcd10(e.target.value)} className="max-w-[140px]" />
            </div>
            <Button onClick={closeCase}>Закрыть случай</Button>
          </div>
        </section>
      )}

      {cases.filter((row) => row.status === 'CLOSED').length > 0 && (
        <section className="ds-card overflow-hidden p-0">
          <header className="border-b border-[var(--border)] px-5 py-4">
            <p className="ds-kicker">Архив случаев</p>
          </header>
          <ul className="divide-y divide-[var(--border)]">
            {cases.filter((row) => row.status === 'CLOSED').map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm transition-colors duration-150 hover:bg-[var(--surface-muted)]">
                <p className="font-medium text-[var(--text)]">{row.icd10} · {row.branch?.name}</p>
                <p className="mt-0.5 text-[var(--muted)]">
                  {row.result === 'REFERRED' ? 'Направлен' : 'Лечение'} · {row.fundAmount.toLocaleString('ru-RU')} ₽ · не отправлен
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
