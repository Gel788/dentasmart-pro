'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarPlus, ChevronDown, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { FEED_FILTERS, fmt, relative, type FeedItem, type NextVisit } from './model';
import styles from './card.module.css';

type Props = {
  nextVisit: NextVisit | null;
  debt: number;
  deposit: number;
  feed: FeedItem[];
  onBook: () => void;
};

const PROTOCOL: { key: 'complaints' | 'objective' | 'diagnosis' | 'treatment' | 'recommendations'; label: string }[] = [
  { key: 'complaints', label: 'Жалобы' },
  { key: 'objective', label: 'Осмотр' },
  { key: 'diagnosis', label: 'Диагноз' },
  { key: 'treatment', label: 'Лечение' },
  { key: 'recommendations', label: 'Рекомендации' },
];

const KIND_LABEL: Record<string, string> = {
  visit: 'Приём', payment: 'Оплата', invoice: 'Счёт', image: 'Снимок', message: 'Связь', chart: 'Формула', consent: 'Согласие', plan: 'План', medical: 'Медкарта',
};

/** Where the patient stands now (next visit, money) and everything that happened, newest first. */
export function Overview({ nextVisit, debt, deposit, feed, onBook }: Props) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(
    () => Object.fromEntries(FEED_FILTERS.map((item) => [item.id, item.kinds.length ? feed.filter((row) => item.kinds.includes(row.kind)).length : feed.length])),
    [feed],
  );
  const rows = useMemo(() => {
    const kinds = FEED_FILTERS.find((item) => item.id === filter)?.kinds ?? [];
    const picked = kinds.length ? feed.filter((row) => kinds.includes(row.kind)) : feed;
    // Eight slices of one CT taken the same day read as one event.
    const out: (FeedItem & { count: number })[] = [];
    for (const row of picked) {
      const last = out[out.length - 1];
      if (last && !row.protocol && last.kind === row.kind && last.title === row.title && last.detail === row.detail && last.at.slice(0, 10) === row.at.slice(0, 10)) {
        last.count += 1;
      } else {
        out.push({ ...row, count: 1 });
      }
    }
    return out;
  }, [feed, filter]);
  const now = new Date().toISOString();

  return (
    <div className={styles.overview}>
      <div className={styles.now}>
        <section className={styles.tile} aria-labelledby="next-visit">
          <h2 id="next-visit"><CalendarClock size={16} aria-hidden="true" /> Следующий визит</h2>
          {nextVisit ? (
            <>
              <p className={styles.big}>{fmt.day(nextVisit.startsAt)}, {fmt.time(nextVisit.startsAt)}</p>
              <p className={styles.sub}>{[nextVisit.service, nextVisit.doctor, nextVisit.cabinet].filter(Boolean).join(' · ')}</p>
              <p className={styles.sub}>{relative(nextVisit.startsAt)}{nextVisit.status === 'CONFIRMED' ? ' · подтверждён' : nextVisit.status === 'SCHEDULED' ? ' · не подтверждён' : ''}</p>
              <Link className="sd-btn-ghost" href="/schedule">Открыть в расписании</Link>
            </>
          ) : (
            <>
              <p className={styles.sub}>Не записан</p>
              <button type="button" className="sd-btn" onClick={onBook}><CalendarPlus size={16} aria-hidden="true" /> Записать</button>
            </>
          )}
        </section>
        <section className={styles.tile} aria-labelledby="balance">
          <h2 id="balance"><Wallet size={16} aria-hidden="true" /> Баланс</h2>
          {debt > 0 ? (
            <p className={styles.big} data-tone="debt">Долг {formatMoney(debt)}</p>
          ) : deposit > 0 ? (
            <p className={styles.big} data-tone="ok">Аванс {formatMoney(deposit)}</p>
          ) : (
            <p className={styles.big}>Расчёты закрыты</p>
          )}
          <Link className="sd-btn-ghost" href="/finance">Счета и оплаты</Link>
        </section>
      </div>

      <section className={styles.feed} aria-labelledby="feed-title">
        <div className={styles.sectionHead}>
          <h2 id="feed-title">История</h2>
        </div>
        <div className={styles.filters} role="group" aria-label="Что показать">
          {FEED_FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} disabled={item.id !== 'all' && !counts[item.id]}>
              {item.label} <b>{counts[item.id]}</b>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className={styles.none}>Здесь появятся приёмы, снимки, оплаты и изменения медкарты.</p>
        ) : (
          <ol className={styles.events}>
            {rows.map((row) => {
              const protocol = row.protocol && PROTOCOL.some((part) => row.protocol?.[part.key]?.trim()) ? row.protocol : null;
              const expanded = open === row.id;
              const future = row.kind === 'visit' && row.at > now;
              return (
                <li key={row.id} data-kind={row.kind} data-future={future || undefined}>
                  <time dateTime={row.at}>
                    <b>{fmt.short(row.at)}</b>
                    {row.kind === 'visit' && <span>{fmt.time(row.at)}</span>}
                  </time>
                  <div className={styles.eventBody}>
                    <span className={styles.kind}>{KIND_LABEL[row.kind] ?? 'Событие'}</span>
                    <b>{row.title}{row.count > 1 && <span className={styles.count}> × {row.count}</span>}</b>
                    {row.detail && <span className={styles.sub}>{row.detail}</span>}
                    {protocol && protocol.diagnosis && !expanded && <span className={styles.diagnosis}>Диагноз: {protocol.diagnosis}</span>}
                    {protocol && (
                      <button type="button" className={styles.textBtn} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : row.id)}>
                        Протокол приёма <ChevronDown size={14} aria-hidden="true" data-open={expanded || undefined} />
                      </button>
                    )}
                    {protocol && expanded && (
                      <dl className={styles.protocol}>
                        {PROTOCOL.filter((part) => protocol[part.key]?.trim()).map((part) => (
                          <div key={part.key}>
                            <dt>{part.label}</dt>
                            <dd>{protocol[part.key]}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
