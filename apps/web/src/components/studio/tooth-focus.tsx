'use client';

import { CONDITIONS, type ChartSurface } from '@/components/studio/chart';

const LABEL: Record<string, string> = {
  CARIES: 'Кариес',
  FILLED: 'Пломба',
  CROWN: 'Коронка',
  ROOT_CANAL: 'Каналы',
  IMPLANT: 'Имплант',
  MISSING: 'Нет зуба',
  TO_EXTRACT: 'К удалению',
  PLANNED: 'В плане',
  HEALTHY: 'Здоров',
};

const WHOLE = new Set(['CROWN', 'IMPLANT', 'MISSING', 'TO_EXTRACT', 'ROOT_CANAL']);

export function ToothFocus({
  tooth,
  surface,
  surfaces,
  services,
  onStatus,
  onAdd,
}: {
  tooth: number;
  surface: string;
  surfaces: ChartSurface[];
  services: { id: string; title: string; status?: string }[];
  onStatus?: (condition: string, surface: string) => void;
  onAdd?: () => void;
}) {
  const findings = surfaces.filter((row) => row.toothNum === tooth && row.condition && row.condition !== 'HEALTHY');
  const face = surface === 'TOOTH' ? 'весь зуб' : `поверхность ${surface}`;
  return (
    <aside className="fx-focus" aria-label={`Зуб ${tooth}`}>
      <header>
        <b>Зуб {tooth}</b>
        <span>{face}</span>
      </header>
      {findings.length === 0 && <p>Находок пока нет. Отметьте статус или добавьте услугу.</p>}
      {findings.length > 0 && (
        <ul>
          {findings.map((row, index) => (
            <li key={`${row.surface}-${row.condition}-${index}`}>
              {LABEL[row.condition] ?? row.condition}
              {row.surface && row.surface !== 'TOOTH' ? ` · ${row.surface}` : ''}
            </li>
          ))}
        </ul>
      )}
      {services.length > 0 && (
        <ul>
          {services.map((item) => <li key={item.id}>{item.title}</li>)}
        </ul>
      )}
      {onStatus && (
        <div className="fx-status" role="group" aria-label="Статус зуба">
          {CONDITIONS.map((item) => {
            const active = findings.some((row) => row.condition === item.id && (WHOLE.has(item.id) || row.surface === surface || row.surface === 'TOOTH'));
            return (
              <button key={item.id} type="button" className={active ? 'on' : ''} onClick={() => onStatus(item.id, WHOLE.has(item.id) ? 'TOOTH' : surface === 'TOOTH' ? 'O' : surface)}>
                <i style={{ background: item.color }} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
      {onAdd && <button className="sd-btn-ghost" type="button" data-plan-add="tooth" onClick={onAdd}>+ Услуга</button>}
    </aside>
  );
}
