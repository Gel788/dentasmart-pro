'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import styles from './integrations.module.css';

type Status = {
  polza: { connected: boolean; assistantModel: string; widgetModel: string };
  widget: { slug: string; requests: number };
  documents: { issued: number };
  egisz: { connected: boolean };
  kassa: { connected: boolean };
  messages: { connected: boolean };
  https: { connected: boolean };
};

export default function IntegrationsPage() {
  return <Protected><Integrations /></Protected>;
}

/** What the clinic is connected to, read from the server's own configuration — nothing here is simulated. */
function Integrations() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Status>('/integrations/status').then(setStatus).catch((err: Error) => setError(err.message)); }, []);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Интеграции</h1>
        <p>Что подключено по-настоящему и что нужно, чтобы подключить остальное. Неподключённое ничего не отправляет и не притворяется, что отправило.</p>
      </header>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
      {!status && !error && <div className={styles.skeleton} aria-label="Загружаем" />}
      {status && (
        <ul className={styles.list}>
          <Row on={status.polza.connected} title="Polza AI — помощник, диктовка, виджет" detail={status.polza.connected ? `Помощник и диктовка: ${status.polza.assistantModel} (данные остаются в России). Виджет записи: ${status.polza.widgetModel}, только с согласия пациента.` : 'Ключ Polza AI на сервере не задан — помощник и диктовка выключены.'} />
          <Row on title="Виджет записи на сайт" detail={`Страница записи /book/${status.widget.slug}, заявок получено: ${status.widget.requests}.`} action={<Link className="sd-btn-ghost" href="/widget">Код для сайта</Link>} />
          <Row on title="Документы пациента" detail={`Договоры, согласия, акты печатаются из CRM. Выдано документов: ${status.documents.issued}.`} action={<Link className="sd-btn-ghost" href="/documents">Открыть</Link>} />
          <Row on={false} title="ЕГИСЗ (РЭМД, ФРМО, ФРМР)" detail="Обязательна для клиник с лицензией. Нужно: OID клиники из ФРМО, СНИЛС и УКЭП врачей, договор со шлюзом ЕГИСЗ. ЕРИС (снимки) — только для городской системы Москвы." action={<Link className="sd-btn-ghost" href="/documents?tab=egisz">Что нужно</Link>} />
          <Row on={false} title="Онлайн-касса 54-ФЗ" detail="Чеки пока пробиваются на кассе клиники отдельно. Для автоматических чеков нужен договор с ОФД и касса с API (АТОЛ Онлайн, Модулькасса и т. п.)." />
          <Row on={false} title="SMS и мессенджеры" detail="Напоминания о визитах собираются в CRM, но не отправляются: провайдер SMS или Telegram не подключён. Нужен аккаунт у SMS-провайдера и согласие пациента на сообщения." />
          <Row on={status.https.connected} title="HTTPS и домен" detail={status.https.connected ? 'CRM открывается по защищённому соединению.' : 'CRM открывается по адресу без HTTPS. Без домена и сертификата браузер не даёт микрофон для диктовки, а данные пациентов передаются без шифрования. Нужен домен клиники.'} />
        </ul>
      )}
    </div>
  );
}

function Row({ on, title, detail, action }: { on: boolean; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <li className={styles.row} data-on={on || undefined}>
      <span className={styles.k} aria-hidden="true" />
      <div>
        <b>{title}</b>
        <span className={styles.state}>{on ? 'подключено' : 'не подключено'}</span>
        <p>{detail}</p>
      </div>
      {action && <div className={styles.act}>{action}</div>}
    </li>
  );
}
